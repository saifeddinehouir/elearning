# DailyQCM — PWA

A spaced-repetition quiz app (course QCMs **and** LeetCode-pattern questions) built as
an installable Progressive Web App. No build step, no framework, no runtime
dependencies — plain ES modules, SVG charts, IndexedDB.

You generate study content externally (ChatGPT / Claude) with the fixed JSON schema,
import it, and the app serves daily questions via SM-2, tracks a streak, and shows
stats.

---

## Run it locally (Windows / Mac / Linux)

Needs Node 18+ (for the dev server and tests). No `npm install` — there are no deps.

```bash
cd quiz_qpp/pwa
npm run serve      # -> http://localhost:5173
npm test           # SM-2 / session builder / streak / schema unit tests
```

Open `http://localhost:5173` in Chrome or Edge. In DevTools → Application you can
inspect the manifest, service worker, and IndexedDB. "Add to Home screen" /
install works from `localhost`.

First run is empty — open **Decks → Load course sample** (or import your own JSON).

## Put it on your iPhone

iOS installs a PWA from a real HTTPS URL (not `localhost`). Two options:

**A. GitHub Pages (free).** Push the repo; the included
[`.github/workflows/pages.yml`](../.github/workflows/pages.yml) publishes `pwa/` to
`https://<you>.github.io/<repo>/`. On the iPhone open that URL in **Safari** →
Share → **Add to Home Screen**. You get an icon that launches full-screen, works
offline, and (after you allow it in Settings) shows the daily reminder.

**B. Any static host.** Upload the contents of `pwa/` to Netlify / Vercel /
Cloudflare Pages and open the URL in Safari.

> iOS 16.4+ is required for installed-PWA notifications. iOS 17 recommended.

## Project layout

```
pwa/
  index.html            app shell
  manifest.webmanifest  install metadata
  sw.js                 service worker (offline cache + notification handling)
  styles.css
  src/
    format.js           date / number helpers          ─┐
    sm2.js              SM-2 scheduler (pure)            │ importable in Node,
    session.js          daily-queue builder (pure)       │ covered by tests/
    streak.js           streak math (pure)               │
    stats.js            attempt aggregations (pure)       │
    schema.js           JSON schema parse + validate     ─┘
    db.js               IndexedDB promise wrapper
    store.js            data layer: assembles logic inputs, does all mutations
    notifications.js    permission + reminder nudge + SW registration
    charts.js           SVG bar / line charts + heatmap
    dom.js              hyperscript (h), overlay + toast helpers
    views/
      daily.js  session.js  stats.js  streak.js  decks.js  import.js  settings.js
  samples/course.json  samples/leetcode.json
  tools/
    serve.mjs           zero-dep dev server
    make-icons.mjs      regenerates the PNG icons (npm run icons)
  tests/                node:test suites for the pure modules
```

## Unified JSON schema

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
      "context": "course excerpt OR the LeetCode problem statement",
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

`id` may be omitted (generated); `topic` / `context` / `explanation` may be empty
(warning); `choices` must have 2–6 entries; `correct_index` must be in range.
See [`../PROMPT_TEMPLATE.md`](../PROMPT_TEMPLATE.md) for the generator prompt.

## Behaviour (matches the native version)

- **Daily queue** — due reviews first, then new (soft-capped at the "new ratio"),
  then pull-ahead reviews, then top-up; final order weighted toward weak topics.
- **SM-2** — per question: ease (start 2.5, floor 1.3), interval 1 → 6 →
  round(interval × ease); wrong → interval 1 + lapse. Correct = quality 4,
  incorrect = 0.
- **Streak** — consecutive days with ≥ 1 answer, today or yesterday.
- **Reminder** — a static PWA can't run a scheduled job, so the reminder fires when
  you open the app after the set time on a day with no study. A true background
  push needs a small server (VAPID keys + `web-push` + cron); the service worker
  already has the `push` / `notificationclick` handlers for when you add one.

## Data & privacy

Everything is stored locally in the browser (IndexedDB + `localStorage`). Nothing
leaves the device. Clearing site data or deleting the PWA wipes it.
