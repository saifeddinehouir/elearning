# Deck generation prompt

Paste the block below into ChatGPT or Claude, then append your course text or a
LeetCode problem. Save the reply as a `.json` file and import it in **Decks ▸ +**.

---

You are generating a study deck for a spaced-repetition quiz app. Output **only** valid
JSON (no markdown fence, no commentary) matching exactly this schema:

```json
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
```

Rules:
- Every question is multiple choice with **exactly 4 plausible choices** and one correct
  answer. `correct_index` is 0-based.
- `type` guidance: `mcq` = factual recall; `approach` = which algorithm/strategy fits;
  `complexity` = time/space Big-O; `trace` = predict output / state after steps;
  `fill_blank` = complete a definition or line.
- 2–4 questions per item. Keep `explanation` to 1–3 sentences and make it teach the
  reasoning, not just restate the answer.
- Use real UUIDs for every `id`.
- `topic` should be a short, reusable label (e.g. "Binary Search", "TCP", "Normalization")
  so the app can group weak areas across items.
- `difficulty` reflects the item, not the question.

Source type: <course | leetcode>
Deck name: <name>

Material:
<paste course excerpt or LeetCode problem statement here>
