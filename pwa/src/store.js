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

export async function finishSession(answered, correct, now = Date.now()) {
  if (answered <= 0) return;
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
  emit();
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
  const [items, questions, reviews, attempts] = await Promise.all([
    dbGetAllByIndex(STORES.items, "deckId", deckId),
    dbGetAllByIndex(STORES.questions, "deckId", deckId),
    dbGetAllByIndex(STORES.reviewState, "deckId", deckId),
    dbGetAll(STORES.attempts),
  ]);
  const qIds = new Set(questions.map((q) => q.id));
  await Promise.all([
    ...items.map((i) => dbDelete(STORES.items, i.id)),
    ...questions.map((q) => dbDelete(STORES.questions, q.id)),
    ...reviews.map((r) => dbDelete(STORES.reviewState, r.questionId)),
    ...attempts.filter((a) => qIds.has(a.questionId)).map((a) => dbDelete(STORES.attempts, a.id)),
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
export async function importDeck(dto, resolution) {
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
    includeInMix: true,
  };

  const items = [];
  const questions = [];
  for (const it of dto.items) {
    const itemId = UUID_RE.test(String(it.id || "")) ? it.id : uuid();
    items.push({
      id: itemId,
      deckId,
      title: it.title,
      topic: (it.topic || "").trim() || "General",
      difficulty: it.difficulty,
      context: it.context || "",
    });
    for (const q of it.questions) {
      const qId = UUID_RE.test(String(q.id || "")) ? q.id : uuid();
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

  emit();
  return { deck, itemCount: items.length, questionCount: questions.length };
}

export async function loadSampleDeck(kind) {
  const res = await fetch(`samples/${kind === "leetcode" ? "leetcode" : "course"}.json`);
  const dto = await res.json();
  return importDeck(dto, "copy");
}
