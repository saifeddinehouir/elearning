// JSON deck schema: parsing + validation. Pure, no DOM.

import { UUID_RE } from "./format.js";

export const QUESTION_KINDS = ["mcq", "approach", "complexity", "trace", "fill_blank"];
export const DIFFICULTIES = ["easy", "medium", "hard"];
export const SOURCE_TYPES = ["course", "leetcode"];
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

export function parseDeck(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) return { ok: false, error: "Nothing to import — paste JSON or choose a file first." };

  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: `That is not valid JSON.\n${e.message}` };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Top level must be a JSON object with deck_name, source_type and items." };
  }
  return { ok: true, dto: data };
}

export function validateDeck(dto) {
  const issues = [];
  const err = (path, message) => issues.push({ severity: "error", path, message });
  const warn = (path, message) => issues.push({ severity: "warning", path, message });
  const blank = (v) => !v || !String(v).trim();

  if (blank(dto.deck_name)) err("deck_name", "Deck name is empty.");
  if (!SOURCE_TYPES.includes(dto.source_type))
    err("source_type", `"${dto.source_type}" is not one of: course, leetcode.`);
  if (!Array.isArray(dto.items) || dto.items.length === 0) err("items", "Deck has no items.");

  (Array.isArray(dto.items) ? dto.items : []).forEach((item, i) => {
    const b = `items[${i}]`;
    if (typeof item !== "object" || item === null) {
      err(b, "Item is not an object.");
      return;
    }
    if (blank(item.title)) err(`${b}.title`, "Item title is empty.");
    if (!DIFFICULTIES.includes(item.difficulty))
      err(`${b}.difficulty`, `"${item.difficulty}" is not easy / medium / hard.`);
    if (blank(item.topic)) warn(`${b}.topic`, 'No topic — will be grouped under "General".');
    if (blank(item.context)) warn(`${b}.context`, "No context provided.");
    if (item.id != null && !UUID_RE.test(String(item.id)))
      warn(`${b}.id`, `"${item.id}" is not a UUID — a new id will be generated.`);

    if (!Array.isArray(item.questions) || item.questions.length === 0) {
      err(`${b}.questions`, "Item has no questions.");
      return;
    }

    item.questions.forEach((q, j) => {
      const qb = `${b}.questions[${j}]`;
      if (typeof q !== "object" || q === null) {
        err(qb, "Question is not an object.");
        return;
      }
      if (!QUESTION_KINDS.includes(q.type)) err(`${qb}.type`, `"${q.type}" is not a known question type.`);
      if (blank(q.prompt)) err(`${qb}.prompt`, "Prompt is empty.");

      const n = Array.isArray(q.choices) ? q.choices.length : 0;
      if (n < MIN_CHOICES || n > MAX_CHOICES)
        err(`${qb}.choices`, `Expected ${MIN_CHOICES}–${MAX_CHOICES} choices, got ${n}.`);
      else if (q.choices.some((c) => blank(c))) err(`${qb}.choices`, "A choice is blank.");

      if (!Number.isInteger(q.correct_index) || q.correct_index < 0 || q.correct_index >= n)
        err(`${qb}.correct_index`, `correct_index ${q.correct_index} is outside 0…${Math.max(0, n - 1)}.`);

      if (blank(q.explanation)) warn(`${qb}.explanation`, "No explanation.");
    });
  });

  const errors = issues.filter((x) => x.severity === "error");
  const warnings = issues.filter((x) => x.severity === "warning");
  const items = Array.isArray(dto.items) ? dto.items : [];

  return {
    issues,
    errors,
    warnings,
    // NB: named `importable`, not `isImportable` — views/import.js and
    // views/decks.js key off this exact name; a rename here silently breaks
    // the Import button (it did once — see git history).
    importable: errors.length === 0,
    itemCount: items.length,
    questionCount: items.reduce((s, it) => s + (Array.isArray(it && it.questions) ? it.questions.length : 0), 0),
    topics: [...new Set(items.map((it) => (it && !blank(it.topic) ? String(it.topic).trim() : "General")))].sort(),
  };
}
