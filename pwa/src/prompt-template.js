// The generator prompt shown in the Import screen so the schema, rules, and JSON
// example never drift out of sync with what ImportValidator actually accepts.
// Mirrors ../../PROMPT_TEMPLATE.md and DailyQCM/Import prompt copy in the native app.

export const PROMPT_TEMPLATE = `You are generating a study deck for a spaced-repetition quiz app. Output ONLY valid JSON (no markdown fence, no commentary) matching exactly this schema:

{
  "deck_name": "string",
  "source_type": "course | leetcode",
  "items": [
    {
      "id": "uuid",
      "title": "string",
      "topic": "string",
      "difficulty": "easy | medium | hard",
      "context": "the course excerpt OR the leetcode problem statement",
      "questions": [
        {
          "id": "uuid",
          "type": "mcq | approach | complexity | trace | fill_blank",
          "prompt": "string",
          "choices": ["string", "string", "string", "string"],
          "correct_index": 0,
          "explanation": "string"
        }
      ]
    }
  ]
}

Rules:
- Every question is multiple choice with exactly 4 plausible choices and one correct answer. correct_index is 0-based.
- type guidance: mcq = factual recall; approach = which algorithm/strategy fits; complexity = time/space Big-O; trace = predict output / state after steps; fill_blank = complete a definition or line.
- 2-4 questions per item. Keep explanation to 1-3 sentences and make it teach the reasoning, not just restate the answer.
- Use real UUIDs for every id.
- topic should be a short, reusable label (e.g. "Binary Search", "TCP", "Normalization") so the app can group weak areas across items.
- difficulty reflects the item, not the question.

Source type: <course | leetcode>
Deck name: <name>

Material:
<paste course excerpt or LeetCode problem statement here>`;

// Companion prompt: outlines a curriculum as an ordered list of stages
// (a "roadmap") rather than a full deck. Import this first to lay out the
// path, then generate one deck per node with PROMPT_TEMPLATE above and
// attach it to that node from the Decks tab.
export const ROADMAP_PROMPT_TEMPLATE = `You are outlining a study curriculum as an ordered roadmap for a spaced-repetition quiz app. Output ONLY valid JSON (no markdown fence, no commentary) matching exactly this schema:

{
  "roadmap_name": "string",
  "nodes": [
    {
      "title": "string (a short stage name, e.g. \\"Java Collections\\")",
      "description": "1-2 sentences on what this stage covers and why it comes at this point in the sequence"
    }
  ]
}

Rules:
- Order nodes the way someone should actually learn them — earlier nodes are prerequisites for later ones.
- 5-12 nodes is typical. Each node should be narrow enough to become a single study deck later (a few hours of material, not a whole subject).
- Do NOT include questions or content here — this is just the outline. Decks for each node are generated separately.
- title should be short enough to use as a deck name later.

Topic: <the overall subject, e.g. "Backend interview prep in Java/Spring">

Notes:
<anything about your background, target role, timeline, or topics to emphasize/skip>`;

// Clipboard write with a manual-select fallback for browsers/contexts that
// block the async Clipboard API (e.g. no permission prompt available).
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
