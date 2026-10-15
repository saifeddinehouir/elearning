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
    schema.js           JSON schema parse + validate      │
    random.js           seeded RNG, stable UUIDs          │
    patterns.js         built-in paths + core 20 patterns │
    patterns-advanced.js  the 15 advanced patterns        │
    challenge.js        daily challenge picker + streak  ─┘
    db.js               IndexedDB promise wrapper
    store.js            data layer: assembles logic inputs, does all mutations
    notifications.js    permission + reminder nudge + SW registration
    charts.js           SVG bar / line charts + heatmap
    dom.js              hyperscript (h), overlay + toast helpers
    views/
      daily.js  session.js  stats.js  streak.js  decks.js  import.js  settings.js
      roadmaps.js  browse.js  challenge.js  guide.js
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

## LeetCode Patterns path (built in, PWA only)

**Today → Start the LeetCode Patterns path** (or the Roadmaps tab) installs 20
algorithm patterns as one roadmap, one deck per pattern, 120 questions in all —
no JSON generation needed. Content lives in [`src/patterns.js`](src/patterns.js).

- Every problem asks two things: **"which pattern cracks this?"** (the right
  pattern vs. three look-alikes) and an insight question (complexity, the key
  step, or a trace). Missing a recognition question shows that pattern's
  "spot it when…" signals.
- Each pattern deck has a **guide**: signals, core idea, a code template and
  typical complexity. **Pattern cheat sheet** shows all 20, filterable by a clue
  ("contiguous", "sorted", …).
- Stages **unlock in order**: a stage joins the daily mix once every question in
  the stage before it has been seen. Locked stages can still be studied on their
  own from the path.
- Ids and answer positions are deterministic, so reinstalling (after deleting a
  deck) never duplicates anything.

### LeetCode Advanced (the hard path)

A second built-in path for after the basics: 15 harder patterns (monotonic
deque, binary search on the answer, Dijkstra, BFS over states, MST, LIS, interval
DP, bitmask DP, tree DP, state-machine DP, KMP / rolling hash, Fenwick / segment
trees, sweep line, greedy with regret, divide & conquer counting). That's 45
problems and 90 questions, with no easy problems. It's harder in two ways:

- **5-way recognition**: four decoys instead of three, picked so none of them is
  also a valid way to solve the problem.
- **Mastery unlocks**: a stage opens only when every question in the previous
  stage has been seen **and** ≥ 70% are right on their latest attempt (from
  SM-2: `repetitions > 0` ⇔ the last answer was correct).

Content: [`src/patterns-advanced.js`](src/patterns-advanced.js). Paths are
declared in `PATHS` in [`src/patterns.js`](src/patterns.js). Never change a
shipped path's `idPrefix`, because it seeds the stable question ids.

## Daily challenge

A themed mini-set on the Today screen, a different one each weekday:

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| 🧩 Pattern Sprint | ⏱️ Big-O Blitz | 🎯 Weak Spot | 🔍 Trace & Fill | ⚡ Speed Round (20 s/question) | 🏔️ Hard Mode | 🛡️ Review Gauntlet |

It draws from all decks, and the question set is frozen for the day the first
time you see it. If there aren't enough themed questions it tops up with a mixed
set and says so. Challenges have their own streak and week strip. The first run
counts like normal study (SM-2 + daily streak); **Replay** is practice only and
doesn't touch your review schedule. Logic: [`src/challenge.js`](src/challenge.js).

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

## Updating an installed copy

`sw.js` uses a **network-first** strategy: while you're online, every load fetches
the current deploy directly (the cache only kicks in when offline). So most changes
show up the moment you reopen the app — no waiting on service-worker lifecycle
timing. The one case that still needs a nudge is when `sw.js` itself changes; for
that, `src/updates.js` shows an in-app **"A new version is ready — Reload"** banner
as soon as it detects one — tap it and it activates immediately.

## Built-in Java & Spring Boot library

**Today → Add the Java & Spring Boot decks** (or Roadmaps / Decks) installs 12
interview decks, 521 questions, all unlocked and in the daily mix:
Collections & Generics, Java 8, Concurrency, I/O & NIO, Design Patterns (GoF),
Spring Core & AOP, Spring Boot Essentials, Web MVC / REST / Security,
Data / JPA / Hibernate, Relational & NoSQL, JUnit & Mockito, System Design.
The JSON lives in [`library/java-spring/`](library/java-spring/) and is
listed in study order by its `index.json`. Installing again repairs missing
decks without duplicating, and a deck you imported yourself under the same
name is adopted with its progress.

## Interview date mode

**Today → Interview coming up?** (or **Settings → Interview date**) sets the
day and what to study: everything in your daily mix, or decks you pick (the
sheet shows the questions involved and the new-per-day pace as you choose).
Until then, Today studies only those decks and follows a plan; other decks
pause. Logic: [`src/interview.js`](src/interview.js).

- **Reviews land before the interview.** A review whose SM-2 date falls on or
  after the interview counts as due in the last 3 days before it, spread by
  question so they don't pile onto one night, and never sooner than the day
  after you last answered it.
- **New questions are paced.** Unseen questions are split evenly over the
  days left. The final 0–2 days (based on how much notice you gave) and the
  day itself are review only.
- **Session size** becomes today's due reviews plus today's new share: at
  least your daily goal, at most 60. Past 60 the card says you're behind and
  suggests trimming the mix.
- **Readiness**: a question is ready when its latest answer was right. The
  card shows the overall score and the weakest topics, and a sheet lists every
  topic.

Nothing is written to your review history. The plan only changes how the
queue is built, so removing the date (or letting it pass) returns everything
to the normal schedule.

## Free and Pro plans (not enforced yet)

[`src/plan.js`](src/plan.js) defines what each plan can add. Free keeps the
whole study loop (daily sessions, streak, stats, importing your own decks), the
core LeetCode Patterns path and the first 2 decks of each library. Pro adds the
rest of the libraries, the Advanced path, interview date mode and, later, AI
deck generation and cloud sync.

- Gating only applies to **adding** content. Anything already on the device
  stays usable on any plan. A library's roadmap lists the decks you don't
  have yet: **Unlock with Pro** on the free plan, **Add all** on Pro (they
  join the same roadmap).
- `ENFORCE` is `false`, so everyone is on Pro until billing exists.
  **Settings → Plan** has a per-device preview switch (Default / Free / Pro).
- The switch is client-side only. Real enforcement needs accounts, a payment
  provider and Pro content served from behind a login, because everything
  under `library/` is currently public.

## Backups — read this on iPhone

A Home Screen web app on iOS has **its own storage, separate from Safari**.
Removing the app from the Home Screen deletes its decks and progress. Use
**Settings → Back up everything** (share sheet → Save to Files) before removing
or reinstalling, and **Restore from a backup** afterwards or on a new phone.

## Data & privacy

Everything is stored locally in the browser (IndexedDB + `localStorage`). Nothing
leaves the device. Clearing site data or deleting the PWA wipes it.
