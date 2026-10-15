// Application data layer: wraps IndexedDB, assembles the plain objects the pure
// logic modules expect, and performs all mutations. Emits "change" events so
// views can re-render. Browser-only.

import {
  STORES,
  dbGetAll,
  dbGet,
  dbGetAllByIndex,
  dbPut,
  dbBulkPut,
  dbDelete,
  tx,
} from "./db.js";
import { applySM2, gradeForBinary, newReviewState, projectedInterval } from "./sm2.js";
import { uuid, UUID_RE, startOfDay } from "./format.js";
import { PATTERN_PATH, pathByKey, buildPatternDeck, isStageDone } from "./patterns.js";
import { libraryByKey, libraryKeyFor } from "./library.js";
import { effectivePlan, isPlan, canInstallPath, libraryEntriesFor } from "./plan.js";

const bus = new EventTarget();
export const onChange = (fn) => {
  const h = () => fn();
  bus.addEventListener("change", h);
  return () => bus.removeEventListener("change", h);
};
const emit = () => bus.dispatchEvent(new Event("change"));

// ---------- Settings (localStorage) ----------

const SETTINGS_KEY = "dailyqcm.settings";
const DEFAULT_SETTINGS = {
  dailyGoal: 15,
  newLimitRatio: 0.6,
  reminderEnabled: true,
  reminderHour: 19,
  reminderMinute: 0,
  theme: "system", // "system" | "light" | "dark"
  interview: null, // { date, setOn } as day starts (ms), see interview.js
};

export function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  emit();
  return next;
}

// ---------- Plan (free / pro) ----------
// The override is per device: a preview switch now, and where the plan from a
// verified purchase will be cached once billing exists.

const PLAN_KEY = "dailyqcm.plan";

export function getPlanOverride() {
  try {
    const p = localStorage.getItem(PLAN_KEY);
    return isPlan(p) ? p : null;
  } catch {
    return null;
  }
}

export const getPlan = () => effectivePlan(getPlanOverride());

export function setPlanOverride(plan) {
  try {
    if (isPlan(plan)) localStorage.setItem(PLAN_KEY, plan);
    else localStorage.removeItem(PLAN_KEY);
  } catch {}
  emit();
}

export class ProRequiredError extends Error {
  constructor(what) {
    super(`${what} needs Pro`);
    this.name = "ProRequiredError";
  }
}

// ---------- Reads ----------

export async function listDecks() {
  const [decks, items, questions, reviews] = await Promise.all([
    dbGetAll(STORES.decks),
    dbGetAll(STORES.items),
    dbGetAll(STORES.questions),
    dbGetAll(STORES.reviewState),
  ]);
  const reviewByQ = new Map(reviews.map((r) => [r.questionId, r]));
  const now = Date.now();
  const endOfToday = startOfDay(now).getTime() + 86400000;

  return decks
    .map((d) => {
      const dItems = items.filter((i) => i.deckId === d.id);
      const dQ = questions.filter((q) => q.deckId === d.id);
      const studied = dQ.filter((q) => (reviewByQ.get(q.id)?.totalReviews || 0) > 0).length;
      // SM-2 resets repetitions to 0 on a miss, so repetitions > 0 ⇔ the
      // latest answer to that question was right.
      const mastered = dQ.filter((q) => (reviewByQ.get(q.id)?.repetitions || 0) > 0).length;
      const due = dQ.filter((q) => {
        const r = reviewByQ.get(q.id);
        return r && r.totalReviews > 0 && r.dueDate < endOfToday;
      }).length;
      return {
        ...d,
        itemCount: dItems.length,
        questionCount: dQ.length,
        studiedFraction: dQ.length ? studied / dQ.length : 0,
        mastery: dQ.length ? mastered / dQ.length : 0,
        dueCount: due,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDeckDetail(deckId) {
  const [deck, items, questions, reviews, attempts] = await Promise.all([
    dbGet(STORES.decks, deckId),
    dbGetAllByIndex(STORES.items, "deckId", deckId),
    dbGetAllByIndex(STORES.questions, "deckId", deckId),
    dbGetAllByIndex(STORES.reviewState, "deckId", deckId),
    dbGetAll(STORES.attempts),
  ]);
  if (!deck) return null;
  const reviewByQ = new Map(reviews.map((r) => [r.questionId, r]));
  const attemptsByQ = new Map();
  for (const a of attempts) {
    if (!attemptsByQ.has(a.questionId)) attemptsByQ.set(a.questionId, []);
    attemptsByQ.get(a.questionId).push(a);
  }
  const byItem = new Map(items.map((i) => [i.id, { ...i, questions: [] }]));
  for (const q of questions) {
    const entry = byItem.get(q.itemId);
    if (!entry) continue;
    entry.questions.push({
      ...q,
      reviewState: reviewByQ.get(q.id) || null,
      attempts: attemptsByQ.get(q.id) || [],
    });
  }
  const itemList = [...byItem.values()].sort(
    (a, b) => a.topic.localeCompare(b.topic) || a.difficulty.localeCompare(b.difficulty)
  );
  return { deck, items: itemList };
}

// Reconstructs a deck back into the unified JSON schema (the inverse of
// importDeck) so it can be backed up, edited, handed to someone else, or fed
// back to ChatGPT/Claude to extend.
export async function exportDeckJSON(deckId) {
  const detail = await getDeckDetail(deckId);
  if (!detail) return null;
  const { deck, items } = detail;
  const dto = {
    deck_name: deck.name,
    source_type: deck.sourceType,
    ...(deck.guide ? { guide: deck.guide } : {}),
    items: items.map((it) => ({
      id: it.id,
      title: it.title,
      topic: it.topic,
      difficulty: it.difficulty,
      context: it.context,
      questions: it.questions.map((q) => ({
        id: q.id,
        type: q.kind,
        prompt: q.prompt,
        choices: q.choices,
        correct_index: q.correctIndex,
        explanation: q.explanation,
      })),
    })),
  };
  return JSON.stringify(dto, null, 2);
}

// Returns question objects shaped for composeSession(): { id, topic, difficulty,
// deckId, deckName, prompt, choices, correctIndex, explanation, kind,
// reviewState, attempts }.
async function buildPool(filterFn) {
  const [decks, questions, items, reviews, attempts] = await Promise.all([
    dbGetAll(STORES.decks),
    dbGetAll(STORES.questions),
    dbGetAll(STORES.items),
    dbGetAll(STORES.reviewState),
    dbGetAll(STORES.attempts),
  ]);
  const deckById = new Map(decks.map((d) => [d.id, d]));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const reviewByQ = new Map(reviews.map((r) => [r.questionId, r]));
  const attemptsByQ = new Map();
  for (const a of attempts) {
    if (!attemptsByQ.has(a.questionId)) attemptsByQ.set(a.questionId, []);
    attemptsByQ.get(a.questionId).push(a);
  }

  return questions
    .filter((q) => {
      const deck = deckById.get(q.deckId);
      return deck && filterFn(deck);
    })
    .map((q) => {
      const item = itemById.get(q.itemId) || {};
      const deck = deckById.get(q.deckId);
      return {
        id: q.id,
        deckId: q.deckId,
        deckName: deck ? deck.name : "Unknown",
        sourceType: deck ? deck.sourceType : "course",
        deckGuide: deck ? deck.guide || null : null,
        itemId: q.itemId,
        itemTitle: item.title || "",
        context: item.context || "",
        topic: item.topic || "General",
        difficulty: item.difficulty || "medium",
        kind: q.kind,
        prompt: q.prompt,
        choices: q.choices,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        reviewState: reviewByQ.get(q.id) || null,
        attempts: attemptsByQ.get(q.id) || [],
      };
    });
}

export const getDailyPool = () => buildPool((d) => d.includeInMix !== false);
export const getDeckPool = (deckId) => buildPool((d) => d.id === deckId);
export const getDecksPool = (deckIds) => {
  const ids = new Set(deckIds);
  return buildPool((d) => ids.has(d.id));
};
export const getAllQuestionsFlat = () => buildPool(() => true);

export const getAllAttempts = () => dbGetAll(STORES.attempts);
export const getAllStudyDays = () => dbGetAll(STORES.studyDays);

// ---------- Session mutations ----------

export async function recordAnswer(question, chosenIndex, now = Date.now()) {
  const correct = chosenIndex === question.correctIndex;

  const existing = await dbGet(STORES.reviewState, question.id);
  const base = existing || newReviewState(question.id, question.deckId, question.topic, now);
  const nextState = applySM2(base, gradeForBinary(correct), now);
  await dbPut(STORES.reviewState, nextState);

  await dbPut(STORES.attempts, {
    questionId: question.id,
    date: now,
    wasCorrect: correct,
    chosenIndex,
    topic: question.topic,
    difficulty: question.difficulty,
    deckName: question.deckName,
  });

  emit();
  return {
    correct,
    correctIndex: question.correctIndex,
    explanation: question.explanation,
    nextIntervalDays: projectedInterval(base, gradeForBinary(correct)),
  };
}

// Returns { unlocked: [stage titles] } — path stages that opened up because
// this session finished the stage before them.
export async function finishSession(answered, correct, now = Date.now()) {
  if (answered <= 0) return { unlocked: [] };
  const dayStart = startOfDay(now).getTime();
  const { dailyGoal } = getSettings();
  const existing = await dbGet(STORES.studyDays, dayStart);
  if (existing) {
    existing.answered += answered;
    existing.correct += correct;
    existing.completedGoal = existing.completedGoal || existing.answered >= dailyGoal;
    await dbPut(STORES.studyDays, existing);
  } else {
    await dbPut(STORES.studyDays, {
      dayStart,
      answered,
      correct,
      completedGoal: answered >= dailyGoal,
    });
  }
  const unlocked = await syncPathUnlocks();
  emit();
  return { unlocked };
}

export async function studiedToday(now = Date.now()) {
  const rec = await dbGet(STORES.studyDays, startOfDay(now).getTime());
  return !!rec && rec.answered > 0;
}

// ---------- Deck management ----------

export async function findDeckByName(name) {
  const decks = await dbGetAll(STORES.decks);
  return decks.find((d) => d.name === name) || null;
}

async function deleteDeckCascade(deckId) {
  const [items, questions, reviews, attempts, flags, roadmaps] = await Promise.all([
    dbGetAllByIndex(STORES.items, "deckId", deckId),
    dbGetAllByIndex(STORES.questions, "deckId", deckId),
    dbGetAllByIndex(STORES.reviewState, "deckId", deckId),
    dbGetAll(STORES.attempts),
    dbGetAllByIndex(STORES.flags, "deckId", deckId),
    dbGetAll(STORES.roadmaps),
  ]);
  const qIds = new Set(questions.map((q) => q.id));
  const affectedRoadmaps = roadmaps.filter((r) => r.nodes.some((n) => n.deckId === deckId));
  for (const r of affectedRoadmaps) {
    for (const n of r.nodes) if (n.deckId === deckId) n.deckId = null;
  }
  await Promise.all([
    ...items.map((i) => dbDelete(STORES.items, i.id)),
    ...questions.map((q) => dbDelete(STORES.questions, q.id)),
    ...reviews.map((r) => dbDelete(STORES.reviewState, r.questionId)),
    ...attempts.filter((a) => qIds.has(a.questionId)).map((a) => dbDelete(STORES.attempts, a.id)),
    ...flags.map((f) => dbDelete(STORES.flags, f.questionId)),
    ...affectedRoadmaps.map((r) => dbPut(STORES.roadmaps, r)),
  ]);
  await dbDelete(STORES.decks, deckId);
}

export async function deleteDeck(deckId) {
  await deleteDeckCascade(deckId);
  emit();
}

export async function setDeckIncludeInMix(deckId, value) {
  const deck = await dbGet(STORES.decks, deckId);
  if (!deck) return;
  deck.includeInMix = value;
  await dbPut(STORES.decks, deck);
  emit();
}

function uniqueNameFrom(base, taken) {
  let candidate = `${base} (copy)`;
  let n = 2;
  while (taken.has(candidate)) candidate = `${base} (copy ${n++})`;
  return candidate;
}

// resolution: "replace" | "copy"
// extra: { builtinKey, includeInMix, silent } — used by the built-in pattern path.
export async function importDeck(dto, resolution, extra = {}) {
  const decks = await dbGetAll(STORES.decks);
  const takenNames = new Set(decks.map((d) => d.name));
  let name = dto.deck_name;

  const clash = decks.find((d) => d.name === dto.deck_name);
  if (clash) {
    if (resolution === "replace") await deleteDeckCascade(clash.id);
    else name = uniqueNameFrom(dto.deck_name, takenNames);
  }

  const deckId = uuid();
  const deck = {
    id: deckId,
    name,
    sourceType: dto.source_type,
    createdAt: Date.now(),
    includeInMix: extra.includeInMix ?? true,
    ...(dto.guide && typeof dto.guide === "object" ? { guide: dto.guide } : {}),
    ...(extra.builtinKey ? { builtinKey: extra.builtinKey } : {}),
    ...(extra.libraryKey ? { libraryKey: extra.libraryKey } : {}),
  };

  // Ids from the JSON are kept when they're valid UUIDs AND not already in
  // use. Without the second check, importing a copy of an exported deck would
  // silently move the original deck's questions (same keys) into the copy.
  const [existingItemIds, existingQuestionIds] = await Promise.all([
    dbGetAll(STORES.items).then((rows) => new Set(rows.map((r) => r.id))),
    dbGetAll(STORES.questions).then((rows) => new Set(rows.map((r) => r.id))),
  ]);
  const keepId = (id, taken) => {
    const ok = UUID_RE.test(String(id || "")) && !taken.has(id);
    const out = ok ? id : uuid();
    taken.add(out);
    return out;
  };

  const items = [];
  const questions = [];
  for (const it of dto.items) {
    const itemId = keepId(it.id, existingItemIds);
    items.push({
      id: itemId,
      deckId,
      title: it.title,
      topic: (it.topic || "").trim() || "General",
      difficulty: it.difficulty,
      context: it.context || "",
    });
    for (const q of it.questions) {
      const qId = keepId(q.id, existingQuestionIds);
      questions.push({
        id: qId,
        itemId,
        deckId,
        kind: q.type,
        prompt: q.prompt,
        choices: q.choices,
        correctIndex: q.correct_index,
        explanation: q.explanation || "",
      });
    }
  }

  await dbPut(STORES.decks, deck);
  await dbBulkPut(STORES.items, items);
  await dbBulkPut(STORES.questions, questions);

  if (!extra.silent) emit();
  return { deck, itemCount: items.length, questionCount: questions.length };
}

// ---------- Flags (mark a question "confusing" / "wrong" for later review) ----------

// reason: "confusing" | "wrong" | null (null clears the flag)
export async function setFlagState(question, reason) {
  if (!reason) {
    await dbDelete(STORES.flags, question.id);
    emit();
    return null;
  }
  const existing = await dbGet(STORES.flags, question.id);
  const rec = {
    questionId: question.id,
    deckId: question.deckId,
    reason,
    createdAt: existing ? existing.createdAt : Date.now(),
  };
  await dbPut(STORES.flags, rec);
  emit();
  return rec;
}

export async function getFlagState(questionId) {
  const rec = await dbGet(STORES.flags, questionId);
  return rec ? rec.reason : null;
}

export async function getFlagsMap() {
  const flags = await dbGetAll(STORES.flags);
  return new Map(flags.map((f) => [f.questionId, f]));
}

export const countFlags = () => dbGetAll(STORES.flags).then((r) => r.length);

// ---------- Roadmaps (a named, ordered curriculum; each node optionally points at a deck) ----------

export async function importRoadmap(dto) {
  const roadmap = {
    id: uuid(),
    name: dto.roadmap_name,
    createdAt: Date.now(),
    nodes: dto.nodes.map((n) => ({
      id: uuid(),
      title: n.title,
      description: n.description || "",
      deckId: null,
    })),
  };
  await dbPut(STORES.roadmaps, roadmap);
  emit();
  return roadmap;
}

export const listRoadmaps = () => dbGetAll(STORES.roadmaps);

export async function attachDeckToNode(roadmapId, nodeId, deckId) {
  const roadmap = await dbGet(STORES.roadmaps, roadmapId);
  if (!roadmap) return;
  const node = roadmap.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  node.deckId = deckId;
  await dbPut(STORES.roadmaps, roadmap);
  emit();
}

export async function deleteRoadmap(roadmapId) {
  await dbDelete(STORES.roadmaps, roadmapId);
  emit();
}

export async function renameRoadmap(roadmapId, name) {
  const roadmap = await dbGet(STORES.roadmaps, roadmapId);
  if (!roadmap) return;
  roadmap.name = name;
  await dbPut(STORES.roadmaps, roadmap);
  emit();
}

export async function updateRoadmapNode(roadmapId, nodeId, patch) {
  const roadmap = await dbGet(STORES.roadmaps, roadmapId);
  if (!roadmap) return;
  const node = roadmap.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  Object.assign(node, patch);
  await dbPut(STORES.roadmaps, roadmap);
  emit();
}

export async function addRoadmapNode(roadmapId, title) {
  const roadmap = await dbGet(STORES.roadmaps, roadmapId);
  if (!roadmap) return;
  roadmap.nodes.push({ id: uuid(), title, description: "", deckId: null });
  await dbPut(STORES.roadmaps, roadmap);
  emit();
}

export async function removeRoadmapNode(roadmapId, nodeId) {
  const roadmap = await dbGet(STORES.roadmaps, roadmapId);
  if (!roadmap) return;
  roadmap.nodes = roadmap.nodes.filter((n) => n.id !== nodeId);
  await dbPut(STORES.roadmaps, roadmap);
  emit();
}

// direction: -1 (move earlier) or 1 (move later)
export async function moveRoadmapNode(roadmapId, nodeId, direction) {
  const roadmap = await dbGet(STORES.roadmaps, roadmapId);
  if (!roadmap) return;
  const idx = roadmap.nodes.findIndex((n) => n.id === nodeId);
  const target = idx + direction;
  if (idx === -1 || target < 0 || target >= roadmap.nodes.length) return;
  [roadmap.nodes[idx], roadmap.nodes[target]] = [roadmap.nodes[target], roadmap.nodes[idx]];
  await dbPut(STORES.roadmaps, roadmap);
  emit();
}

// ---------- Built-in pattern paths ----------
// Each path (see PATHS in patterns.js) is one deck per pattern plus a roadmap
// whose `builtin` is the path key. Nodes unlock in order: a stage opens (and
// joins the daily mix) once the stage before it is done under the path's
// unlock rule — every question seen, or seen AND mostly right ("mastery").

export async function getPatternPath(key = PATTERN_PATH.key) {
  const roadmaps = await dbGetAll(STORES.roadmaps);
  return roadmaps.find((r) => r.builtin === key) || null;
}

export async function getPatternPaths() {
  const roadmaps = await dbGetAll(STORES.roadmaps);
  return roadmaps.filter((r) => r.builtin && (pathByKey.has(r.builtin) || libraryByKey.has(r.builtin)));
}

// Idempotent: re-running it recreates any pattern deck that was deleted and
// re-links it, without duplicating decks that still exist or touching progress.
export async function installPatternPath(key = PATTERN_PATH.key) {
  const path = pathByKey.get(key);
  if (!path) throw new Error(`Unknown path ${key}`);
  const [decks, existing] = await Promise.all([dbGetAll(STORES.decks), getPatternPath(key)]);
  // Repairing a path that's already installed is always allowed.
  if (!existing && !canInstallPath(getPlan(), key)) throw new ProRequiredError(path.name);
  const deckByKey = new Map(decks.filter((d) => d.builtinKey).map((d) => [d.builtinKey, d]));

  const deckFor = async (pattern, i) => {
    const have = deckByKey.get(pattern.id);
    if (have) return have;
    const { deck } = await importDeck(buildPatternDeck(pattern, i, path), "copy", {
      builtinKey: pattern.id,
      includeInMix: i === 0,
      silent: true,
    });
    return deck;
  };

  let roadmap = existing;
  if (roadmap) {
    const deckIds = new Set(decks.map((d) => d.id));
    for (const node of roadmap.nodes) {
      if (!node.patternId || (node.deckId && deckIds.has(node.deckId))) continue;
      const idx = path.patterns.findIndex((p) => p.id === node.patternId);
      if (idx >= 0) node.deckId = (await deckFor(path.patterns[idx], idx)).id;
    }
  } else {
    const nodes = [];
    for (const [i, p] of path.patterns.entries()) {
      const deck = await deckFor(p, i);
      nodes.push({ id: uuid(), title: p.name, description: p.tagline, deckId: deck.id, patternId: p.id, unlocked: i === 0 });
    }
    roadmap = { id: uuid(), name: path.name, builtin: path.key, createdAt: Date.now(), nodes };
  }
  await dbPut(STORES.roadmaps, roadmap);
  emit();
  return roadmap;
}

// Unlocks every built-in path stage whose previous stage is done. Returns the
// titles that were newly unlocked. Never re-locks anything, and only ever
// turns "include in daily mix" ON — a manual opt-out made after unlocking is
// left alone.
export async function syncPathUnlocks() {
  const roadmaps = (await dbGetAll(STORES.roadmaps)).filter((r) => r.builtin);
  if (roadmaps.length === 0) return [];
  const decks = await listDecks();
  const byId = new Map(decks.map((d) => [d.id, d]));
  const unlocked = [];
  for (const r of roadmaps) {
    const rule = pathByKey.get(r.builtin)?.unlock || "seen";
    let changed = false;
    let prevDone = true;
    for (const node of r.nodes) {
      const deck = node.deckId ? byId.get(node.deckId) : null;
      if (prevDone && !node.unlocked) {
        node.unlocked = true;
        changed = true;
        unlocked.push(node.title);
        if (deck && deck.includeInMix === false) {
          const raw = await dbGet(STORES.decks, deck.id);
          if (raw) await dbPut(STORES.decks, { ...raw, includeInMix: true });
        }
      }
      prevDone = isStageDone(deck, rule);
    }
    if (changed) await dbPut(STORES.roadmaps, r);
  }
  return unlocked;
}

// ---------- Built-in deck libraries (e.g. Java & Spring Boot) ----------

// Installs (or repairs) a library: every deck in its index.json, in order,
// plus a roadmap with all stages open. A deck already installed from the
// library is reused; a deck you imported yourself under the same name is
// adopted (keeping its progress) instead of duplicated. On the free plan only
// the first few decks are added; installing again after upgrading adds the
// rest to the same roadmap.
export async function installLibrary(key) {
  const lib = libraryByKey.get(key);
  if (!lib) throw new Error(`Unknown library ${key}`);
  const index = libraryEntriesFor(getPlan(), await (await fetch(`${lib.dir}index.json`)).json());
  const [decks, roadmaps] = await Promise.all([dbGetAll(STORES.decks), dbGetAll(STORES.roadmaps)]);
  const byLibKey = new Map(decks.filter((d) => d.libraryKey).map((d) => [d.libraryKey, d]));
  const byName = new Map(decks.filter((d) => !d.libraryKey && !d.builtinKey).map((d) => [d.name, d]));

  const deckIds = [];
  for (const entry of index) {
    const lk = libraryKeyFor(lib, entry.id);
    let deck = byLibKey.get(lk);
    if (!deck && byName.has(entry.name)) {
      deck = { ...byName.get(entry.name), libraryKey: lk };
      await dbPut(STORES.decks, deck);
    }
    if (!deck) {
      const dto = await (await fetch(`${lib.dir}${entry.id}.json`)).json();
      ({ deck } = await importDeck(dto, "copy", { libraryKey: lk, silent: true }));
    }
    deckIds.push({ entry, deck, added: !byLibKey.has(lk) });
  }

  const nodeFor = ({ entry, deck }) => ({
    id: uuid(),
    title: entry.name,
    description: entry.topics.slice(0, 4).join(" · "),
    deckId: deck.id,
    libraryDeck: entry.id,
    unlocked: true,
  });
  let roadmap = roadmaps.find((r) => r.builtin === lib.key);
  if (roadmap) {
    const existing = new Map(roadmap.nodes.map((n) => [n.libraryDeck, n]));
    for (const pair of deckIds) {
      const node = existing.get(pair.entry.id);
      if (node) node.deckId = pair.deck.id;
      // Only decks new to this device get a stage, so a stage you removed
      // from the roadmap stays removed.
      else if (pair.added) roadmap.nodes.push(nodeFor(pair));
    }
  } else {
    roadmap = { id: uuid(), name: lib.name, builtin: lib.key, createdAt: Date.now(), nodes: deckIds.map(nodeFor) };
  }
  await dbPut(STORES.roadmaps, roadmap);
  emit();
  return roadmap;
}

// ---------- Backup & restore ----------
// Everything that lives in IndexedDB plus settings, as one JSON file. On iPhone
// a Home Screen app's storage is deleted when the app is removed, so this file
// is the only way to carry progress across a reinstall or to a new phone.

const BACKUP_STORES = [
  STORES.decks,
  STORES.items,
  STORES.questions,
  STORES.reviewState,
  STORES.attempts,
  STORES.studyDays,
  STORES.flags,
  STORES.roadmaps,
  STORES.challenges,
];
const BACKUP_KEY = "dailyqcm.lastBackupAt";

export async function exportBackup() {
  const data = {};
  for (const s of BACKUP_STORES) data[s] = await dbGetAll(s);
  try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch {}
  return { app: "dailyqcm", format: 1, exportedAt: Date.now(), settings: getSettings(), data };
}

export function lastBackupAt() {
  try { return Number(localStorage.getItem(BACKUP_KEY)) || null; } catch { return null; }
}

// Returns null when the object looks like a DailyQCM backup, else a message.
export function checkBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "dailyqcm" || !obj.data) {
    return "That file isn't a DailyQCM backup. Choose a file made with “Back up everything”.";
  }
  if (!Array.isArray(obj.data.decks) || !Array.isArray(obj.data.questions)) return "The backup is missing its decks or questions.";
  return null;
}

export const backupSummary = (obj) => ({
  decks: obj.data.decks?.length || 0,
  questions: obj.data.questions?.length || 0,
  answers: obj.data.attempts?.length || 0,
  days: obj.data.studyDays?.length || 0,
});

// Replaces everything on this device with the backup, in one transaction.
export async function restoreBackup(obj) {
  const problem = checkBackup(obj);
  if (problem) throw new Error(problem);
  await tx(BACKUP_STORES, "readwrite", (stores) => {
    for (const s of BACKUP_STORES) {
      stores[s].clear();
      for (const row of obj.data[s] || []) stores[s].put(row);
    }
  });
  if (obj.settings) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(obj.settings)); } catch {}
  }
  emit();
  return backupSummary(obj);
}

// Asks the browser not to evict this app's storage under pressure. Harmless
// where unsupported; it can't stop the user deleting the app itself.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// ---------- Daily challenge records ----------
// { dayStart, challengeId, questionIds, score?, total?, bestScore?, completedAt?, plays? }

export const listChallengeRecords = () => dbGetAll(STORES.challenges);

// Today's challenge with its question set frozen on first view, so answering
// (which changes review state, and so the gauntlet / weak-spot ordering)
// doesn't reshuffle the set mid-day. `pick` is challenge.js#pickChallenge.
export async function getTodaysChallenge(def, pick, now = Date.now()) {
  const dayStart = startOfDay(now).getTime();
  const [pool, record] = await Promise.all([getAllQuestionsFlat(), dbGet(STORES.challenges, dayStart)]);
  const byId = new Map(pool.map((q) => [q.id, q]));

  if (record && record.challengeId === def.id && record.questionIds?.every((id) => byId.has(id))) {
    return {
      def,
      questions: record.questionIds.map((id) => byId.get(id)),
      themed: record.themed !== false,
      focus: record.focus,
      record,
    };
  }

  const picked = pick(pool, def, now);
  if (picked.questions.length === 0) return { ...picked, record: null };
  const fresh = {
    ...(record || {}),
    dayStart,
    challengeId: def.id,
    questionIds: picked.questions.map((q) => q.id),
    themed: picked.themed,
    focus: picked.focus,
  };
  await dbPut(STORES.challenges, fresh);
  return { ...picked, record: fresh };
}

export async function saveChallengeResult(def, score, total, now = Date.now()) {
  const dayStart = startOfDay(now).getTime();
  const rec = (await dbGet(STORES.challenges, dayStart)) || { dayStart, challengeId: def.id };
  const next = {
    ...rec,
    score,
    total,
    bestScore: Math.max(score, rec.bestScore ?? 0),
    completedAt: rec.completedAt || now,
    plays: (rec.plays || 0) + 1,
  };
  await dbPut(STORES.challenges, next);
  emit();
  return next;
}

export async function loadSampleDeck(kind) {
  const res = await fetch(`samples/${kind === "leetcode" ? "leetcode" : "course"}.json`);
  const dto = await res.json();
  return importDeck(dto, "copy");
}
