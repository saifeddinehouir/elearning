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
} from "./db.js";
import { applySM2, gradeForBinary, newReviewState, projectedInterval } from "./sm2.js";
import { uuid, UUID_RE, startOfDay } from "./format.js";
import { PATTERNS, PATTERN_PATH, buildPatternDeck } from "./patterns.js";

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
      const due = dQ.filter((q) => {
        const r = reviewByQ.get(q.id);
        return r && r.totalReviews > 0 && r.dueDate < endOfToday;
      }).length;
      return {
        ...d,
        itemCount: dItems.length,
        questionCount: dQ.length,
        studiedFraction: dQ.length ? studied / dQ.length : 0,
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

// ---------- Built-in LeetCode Patterns path ----------
// One deck per pattern plus a roadmap marked `builtin`, whose nodes unlock in
// order: a stage opens (and joins the daily mix) once the stage before it has
// every question studied at least once.

export async function getPatternPath() {
  const roadmaps = await dbGetAll(STORES.roadmaps);
  return roadmaps.find((r) => r.builtin === PATTERN_PATH.key) || null;
}

// Idempotent: re-running it recreates any pattern deck that was deleted and
// re-links it, without duplicating decks that still exist or touching progress.
export async function installPatternPath() {
  const [decks, existing] = await Promise.all([dbGetAll(STORES.decks), getPatternPath()]);
  const deckByKey = new Map(decks.filter((d) => d.builtinKey).map((d) => [d.builtinKey, d]));

  const deckFor = async (pattern, i) => {
    const have = deckByKey.get(pattern.id);
    if (have) return have;
    const { deck } = await importDeck(buildPatternDeck(pattern, i), "copy", {
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
      const idx = PATTERNS.findIndex((p) => p.id === node.patternId);
      if (idx >= 0) node.deckId = (await deckFor(PATTERNS[idx], idx)).id;
    }
  } else {
    const nodes = [];
    for (const [i, p] of PATTERNS.entries()) {
      const deck = await deckFor(p, i);
      nodes.push({ id: uuid(), title: p.name, description: p.tagline, deckId: deck.id, patternId: p.id, unlocked: i === 0 });
    }
    roadmap = { id: uuid(), name: PATTERN_PATH.name, builtin: PATTERN_PATH.key, createdAt: Date.now(), nodes };
  }
  await dbPut(STORES.roadmaps, roadmap);
  emit();
  return roadmap;
}

// Unlocks every built-in path stage whose previous stage is fully studied.
// Returns the titles that were newly unlocked. Never re-locks anything, and
// only ever turns "include in daily mix" ON — a manual opt-out made after
// unlocking is left alone.
export async function syncPathUnlocks() {
  const roadmaps = (await dbGetAll(STORES.roadmaps)).filter((r) => r.builtin);
  if (roadmaps.length === 0) return [];
  const decks = await listDecks();
  const byId = new Map(decks.map((d) => [d.id, d]));
  const unlocked = [];
  for (const r of roadmaps) {
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
      prevDone = !!deck && deck.studiedFraction >= 0.999;
    }
    if (changed) await dbPut(STORES.roadmaps, r);
  }
  return unlocked;
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
