# DailyQCM

A spaced-repetition quiz app for exam/course prep **and** LeetCode-style algorithm
prep. No code execution — pure active-recall multiple-choice questions.

You generate study content externally (ChatGPT / Claude, from your course PDFs or raw
LeetCode problems) using the fixed JSON schema below, import it, and the app serves a
daily session using the SM-2 spaced-repetition algorithm, tracks streaks, and shows
progress stats.

## Two implementations in this repo

| | Path | Runs on | Build machine |
|---|---|---|---|
| **PWA** (recommended — installable on iPhone from Windows) | [`pwa/`](pwa/) | Any modern browser; "Add to Home Screen" on iOS 16.4+ | none — plain files, Node only for tests/dev server |
| **Native iOS** (SwiftUI + SwiftData + Swift Charts) | [`DailyQCM/`](DailyQCM/) | iPhone (iOS 17+) | macOS + Xcode 15 (or the cloud-Mac CI) |

Both share the same JSON schema, SM-2 parameters, daily-queue algorithm, and streak
rules. **If you're on Windows and want it on your phone, use the PWA** —
see [`pwa/README.md`](pwa/README.md). The rest of this file documents the native app.

> **Name:** `DailyQCM` is a placeholder. Candidates: **Recall**, **Cue**, **Anchor**,
> **Retain**. For the native app, rename the scheme + bundle id in `project.yml`.

---

## Requirements

- macOS with **Xcode 15+** (iOS 17 SDK)
- Target device: **iPhone 13 Pro**, iOS 17+
- No third-party runtime dependencies. Frameworks used: SwiftUI, SwiftData, Swift
  Charts, UserNotifications.

## Opening the project

This repo contains only source (no `.xcodeproj` is checked in). Generate one with
[XcodeGen](https://github.com/yonyz/XcodeGen):

```bash
brew install xcodegen
cd quiz_qpp
xcodegen generate
open DailyQCM.xcodeproj
```

Or create a new Xcode project ("App", SwiftUI, SwiftData) named `DailyQCM` and drag the
`DailyQCM/` folder in.

## Project layout

```
quiz_qpp/
  project.yml                 XcodeGen config
  PROMPT_TEMPLATE.md          Paste this into ChatGPT/Claude to generate decks
  DailyQCM/
    App/                      App entry + root TabView
    Models/                   SwiftData models: Deck, Item, Question, ReviewState, Attempt, StudyDay
    Import/                   JSON DTOs, schema validation, persistence, Import screen
    Session/                  SM-2 engine, daily-queue builder, session runner + question UI
    Stats/                    Swift Charts stats screen + aggregation engine
    Streak/                   GitHub-style heatmap + streak math
    Decks/                    Deck list & detail / management
    Notifications/            Local daily reminder scheduling
    Settings/                 Daily goal + reminder settings
    Common/                   Shared helpers, reusable views, @AppStorage keys
    Resources/                Info.plist, asset catalog, sample decks
  Tests/DailyQCMTests/        Unit tests for SM-2 and the queue builder
```

## Continuous integration (build without a Mac)

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) builds the app and runs the
XCTest suite on a GitHub-hosted **macOS** runner — so you can verify it compiles on a
real Apple toolchain from a Windows machine. Push to GitHub and check the **Actions**
tab:

```bash
cd quiz_qpp
git init && git add . && git commit -m "DailyQCM initial"
git branch -M main
git remote add origin git@github.com:<you>/dailyqcm.git
git push -u origin main
```

The workflow runs `xcodegen generate`, `xcodebuild build-for-testing`, then
`test-without-building` against an iOS 17 simulator, and uploads the `.xcresult`
bundle as an artifact. It does **not** render the UI — for that you still need Xcode
on a real or cloud Mac.

## Build order (as implemented)

1. **Models** — `Deck` ▸ `Item` ▸ `Question` ▸ `ReviewState` (+ `Attempt`, `StudyDay`)
2. **Import / validation** — `ImportDTO` ▸ `ImportValidator` ▸ `ImportService` ▸ `ImportView`
3. **Daily session logic** — `SM2` ▸ `SessionBuilder` ▸ `SessionCoordinator`
4. **Screens** — Import ▸ Daily Session ▸ Stats ▸ Streak/Calendar ▸ Deck management

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

Validation is lenient where it safely can be: `id` may be omitted (a UUID is
generated), `topic` / `context` / `explanation` may be empty (you get a warning),
`choices` must have 2–6 entries, and `correct_index` must point inside `choices`.

## How the daily queue is built

`SessionBuilder.plan(...)` mixes, up to the daily goal (default 15):

1. **Due reviews** — questions whose `ReviewState.dueDate` is today or earlier, oldest first.
2. **New questions** — never studied; capped at ~60% of the session so reviews never starve.
3. **Pull-ahead reviews** — soonest-due future reviews, only if slots remain.

The final ordering is a weighted shuffle biased toward **weak topics** (lowest historical
success rate → higher weight).

## SM-2

Per **question** (not per deck), `ReviewState` stores `easeFactor` (starts 2.5),
`interval` (days), `repetitions`, `dueDate`, `lapses`, `totalReviews`. MCQ answers are
binary, mapped to SM-2 quality: **correct → 4 ("good")**, **incorrect → 0 ("again")**.
`SM2.apply` is a pure function — see `Tests/DailyQCMTests/SM2Tests.swift`.

## Notifications

A single local notification is scheduled for the next occurrence of your reminder time
(default 19:00). On app launch and after finishing a session it's rescheduled: if you've
already studied today, it's pushed to tomorrow — so you're only nudged when you haven't
studied. No backend.

## Assumptions I made (flag any you want changed)

- App/scheme name kept as `DailyQCM`, bundle id `com.dailyqcm.app`.
- SM-2 binary quality mapping (correct = 4, incorrect = 0).
- Re-importing a deck with an existing name offers **Replace** or **Import as copy**.
- Deleting a deck cascades to its items, questions, review state, and attempt history
  (streak/`StudyDay` records are kept).
- A "completed day" for the streak = at least one question answered that day.
