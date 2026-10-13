import { h, clear, openOverlay, toast, ICONS } from "../dom.js";
import { composeSession } from "../session.js";
import { recordAnswer, finishSession, getFlagState, setFlagState } from "../store.js";
import { patternById } from "../patterns.js";
import { ring } from "../charts.js";
import { pct } from "../format.js";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const FLAG_CYCLE = { none: "confusing", confusing: "wrong", wrong: null };
const TIMED_OUT = -1;

export function startSession(pool, config, opts = {}) {
  const { queue } = composeSession(pool, config);
  if (queue.length === 0) return;
  runSession(queue, opts);
}

/**
 * Runs a fixed queue of questions in a full-screen sheet.
 * opts:
 *   title         shown in the header instead of the bare counter
 *   timeLimitSec  per-question countdown; running out counts as a miss
 *   showCombo     show the running correct-answer streak
 *   practice      grade locally only: no SM-2 update, no attempt/streak record
 *                 (used for replays, so repeating a set can't inflate intervals)
 *   onFinish      async ({ answered, correct, bestCombo }) => Node | null,
 *                 extra content for the summary (e.g. challenge result)
 */
export function runSession(queue, opts = {}) {
  if (queue.length === 0) return;

  // history[i] holds the recorded answer for a question once it's been submitted,
  // so navigating Back re-shows it (revealed, read-only) instead of re-grading it.
  const state = {
    queue,
    viewIndex: 0,
    maxIndex: 0,
    correct: 0,
    chosen: null,
    revealed: false,
    feedback: null,
    justRevealed: false,
    done: false,
    combo: 0,
    bestCombo: 0,
    history: new Array(queue.length).fill(null),
  };
  let timer = null;

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay session" });

    const head = h("div", { class: "o-head" });
    const bar = h("div", { class: "progress session-progress" }, h("i", {}));
    const timeBar = h("div", { class: "timebar", hidden: true }, h("i", {}));
    const body = h("div", { class: "o-body" });
    const foot = h("div", { class: "o-foot" });
    overlay.append(head, bar, timeBar, body, foot);

    const endBtn = h("button", { class: "btn", onclick: () => confirmEnd() }, "End");
    const backBtn = h("button", {
      class: "btn icon-btn",
      html: ICONS.chevronLeft,
      "aria-label": "Previous question",
      onclick: goBack,
    });
    const flagBtn = h("button", {
      class: "btn icon-btn",
      html: ICONS.flag,
      "aria-label": "Flag question",
      onclick: cycleFlag,
    });
    const counter = h("strong", { class: "counter" }, "");
    const combo = h("span", { class: "combo", hidden: true });
    const titleWrap = h("div", { class: "o-title" }, opts.title ? h("span", { class: "o-kicker" }, opts.title) : null, counter);
    head.append(endBtn, backBtn, titleWrap, h("div", { class: "spacer" }), combo, flagBtn);

    const answeredCount = () => state.history.filter(Boolean).length;

    function shut() {
      stopTimer();
      document.removeEventListener("keydown", onKey);
      close();
    }

    async function confirmEnd() {
      if (state.done) return shut();
      const n = answeredCount();
      if (n === 0 || confirm("End this session? Answers so far are saved and count toward today's streak.")) {
        // Credit what was answered so ending early still counts as studying today.
        if (n > 0 && !opts.practice) await finishSession(n, state.correct);
        shut();
      }
    }

    function onKey(e) {
      if (!overlay.isConnected) return document.removeEventListener("keydown", onKey);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (state.done) {
        if (e.key === "Enter" || e.key === "Escape") shut();
        return;
      }
      const q = state.queue[state.viewIndex];
      const letter = e.key.length === 1 ? LETTERS.indexOf(e.key.toUpperCase()) : -1;
      const digit = /^[1-6]$/.test(e.key) ? Number(e.key) - 1 : -1;
      const idx = digit >= 0 ? digit : letter;
      if (idx >= 0 && idx < q.choices.length && !state.revealed) {
        state.chosen = idx;
        renderQuestion();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (state.revealed) goNext();
        else if (state.chosen != null) submit();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        goBack();
      } else if (e.key === "ArrowRight" && state.revealed) {
        goNext();
      } else if (e.key === "Escape") {
        confirmEnd();
      }
    }
    document.addEventListener("keydown", onKey);

    function paintProgress() {
      counter.textContent = `${state.viewIndex + 1} of ${state.queue.length}`;
      bar.firstChild.style.width = `${(answeredCount() / state.queue.length) * 100}%`;
      backBtn.disabled = state.viewIndex === 0;
      combo.hidden = !opts.showCombo || state.combo < 2;
      combo.textContent = `🔥 ${state.combo}`;
    }

    async function paintFlag() {
      const q = state.queue[state.viewIndex];
      const reason = await getFlagState(q.id);
      flagBtn.dataset.reason = reason || "none";
      flagBtn.className = `btn icon-btn ${reason === "wrong" ? "danger" : reason === "confusing" ? "primary" : ""}`;
    }

    async function cycleFlag() {
      const q = state.queue[state.viewIndex];
      const current = flagBtn.dataset.reason || "none";
      const next = FLAG_CYCLE[current];
      await setFlagState(q, next);
      await paintFlag();
      toast(next ? `Flagged: ${next}` : "Flag removed");
    }

    function loadFromHistory() {
      const rec = state.history[state.viewIndex];
      state.chosen = rec ? rec.chosen : null;
      state.revealed = !!rec;
      state.feedback = rec ? rec.feedback : null;
      state.justRevealed = false;
    }

    function stopTimer() {
      if (timer) clearInterval(timer);
      timer = null;
      timeBar.hidden = true;
    }

    function startTimer() {
      stopTimer();
      if (!opts.timeLimitSec || state.revealed) return;
      const total = opts.timeLimitSec * 1000;
      const started = Date.now();
      const fill = timeBar.firstChild;
      timeBar.hidden = false;
      const tick = () => {
        const left = Math.max(0, total - (Date.now() - started));
        fill.style.width = `${(left / total) * 100}%`;
        timeBar.classList.toggle("low", left < total * 0.3);
        if (left <= 0) {
          stopTimer();
          // A picked-but-unchecked answer still counts; otherwise it's a miss.
          if (state.chosen == null) state.chosen = TIMED_OUT;
          submit();
        }
      };
      tick();
      timer = setInterval(tick, 100);
    }

    async function submit() {
      if (state.chosen == null || state.revealed) return;
      stopTimer();
      state.revealed = true;
      state.justRevealed = true;
      const q = state.queue[state.viewIndex];
      state.feedback = opts.practice ? gradeLocally(q, state.chosen) : await recordAnswer(q, state.chosen);
      if (state.feedback.correct) {
        state.correct += 1;
        state.combo += 1;
        state.bestCombo = Math.max(state.bestCombo, state.combo);
      } else {
        state.combo = 0;
      }
      if (navigator.vibrate) navigator.vibrate(state.feedback.correct ? 12 : [30, 40, 30]);
      state.history[state.viewIndex] = { chosen: state.chosen, feedback: state.feedback };
      renderQuestion();
    }

    function goBack() {
      if (state.viewIndex === 0) return;
      stopTimer();
      state.viewIndex -= 1;
      loadFromHistory();
      renderQuestion();
    }

    async function goNext() {
      if (state.viewIndex >= state.queue.length - 1) {
        stopTimer();
        const result = opts.practice ? { unlocked: [] } : await finishSession(answeredCount(), state.correct);
        const extra = opts.onFinish
          ? await opts.onFinish({ answered: answeredCount(), correct: state.correct, bestCombo: state.bestCombo })
          : null;
        renderSummary(result.unlocked, extra);
        return;
      }
      state.viewIndex += 1;
      state.maxIndex = Math.max(state.maxIndex, state.viewIndex);
      loadFromHistory();
      renderQuestion();
      body.scrollTop = 0;
    }

    function renderQuestion() {
      paintProgress();
      paintFlag();
      const q = state.queue[state.viewIndex];
      clear(body);

      const card = h("div", { class: "q-card" });
      card.appendChild(
        h(
          "div",
          { class: "row", style: "gap:6px;flex-wrap:wrap" },
          badge(kindLabel(q.kind), "accent"),
          badge(cap(q.difficulty), q.difficulty),
          badge(q.topic, "")
        )
      );

      if (q.context && q.sourceType === "leetcode") {
        // For algorithm problems the statement IS the question — always show it.
        card.appendChild(
          h(
            "div",
            { class: "q-problem" },
            h("div", { class: "q-problem-title" }, h("span", { html: ICONS.code }), q.itemTitle || "Problem"),
            h("div", { class: "q-problem-body" }, q.context)
          )
        );
      } else if (q.context) {
        card.appendChild(
          h(
            "details",
            { class: "q-context" },
            h("summary", {}, q.itemTitle || "Context"),
            h("div", { class: "body" }, q.context)
          )
        );
      }

      card.appendChild(h("div", { class: "q-prompt" }, q.prompt));
      body.appendChild(card);

      const choices = h("div", { class: "choices" });
      q.choices.forEach((choice, i) => {
        let cls = "choice";
        if (state.revealed) {
          if (i === q.correctIndex) cls += " correct" + (state.justRevealed ? " pop" : "");
          else if (i === state.chosen) cls += " wrong" + (state.justRevealed ? " shake" : "");
          else cls += " dim";
        } else if (state.chosen === i) {
          cls += " selected";
        }
        choices.appendChild(
          h(
            "button",
            {
              class: cls,
              disabled: state.revealed,
              onclick: () => {
                if (state.revealed) return;
                state.chosen = i;
                renderQuestion();
              },
            },
            h("span", { class: "mk" }, LETTERS[i] || "•"),
            h("span", { class: "choice-text" }, choice)
          )
        );
      });
      body.appendChild(choices);

      if (state.revealed && state.feedback) body.appendChild(feedbackBox(q, state.feedback, state.chosen));

      clear(foot);
      foot.appendChild(
        h(
          "button",
          {
            class: "btn primary block lg",
            disabled: !state.revealed && state.chosen == null,
            onclick: () => (state.revealed ? goNext() : submit()),
          },
          state.revealed ? (state.viewIndex + 1 >= state.queue.length ? "Finish" : "Next") : "Check answer"
        )
      );
      foot.appendChild(h("div", { class: "kbd-hint" }, "Keys: 1–4 to pick · Enter to check / continue · ← back"));

      if (!state.revealed) startTimer();
    }

    function feedbackBox(q, fb, chosen) {
      const box = h("div", { class: `feedback ${fb.correct ? "correct" : "wrong"}` });
      const title = fb.correct ? "Correct" : chosen === TIMED_OUT ? "Time's up" : "Not quite";
      box.appendChild(h("div", { class: "fb-title" }, (fb.correct ? "✓ " : "✕ ") + title));
      if (!fb.correct) box.appendChild(h("div", { class: "fb-answer" }, `Answer: ${q.choices[q.correctIndex]}`));
      if (q.explanation) box.appendChild(h("div", { class: "fb-exp" }, q.explanation));

      // Pattern-recognition questions: show the cues that should have tipped you off.
      const pattern = q.deckGuide && patternById.get(q.deckGuide.patternId);
      if (pattern && q.choices[q.correctIndex] === pattern.name) {
        box.appendChild(
          h(
            "div",
            { class: "fb-signals" },
            h("div", { class: "fb-signals-title" }, `Spot ${pattern.name} when…`),
            h("ul", {}, ...pattern.signals.map((s) => h("li", {}, s)))
          )
        );
      }
      box.appendChild(
        h(
          "div",
          { class: "fb-next" },
          fb.nextIntervalDays == null
            ? "Practice replay — your review schedule isn't changed"
            : `Next review in ~${fb.nextIntervalDays} day${fb.nextIntervalDays === 1 ? "" : "s"}`
        )
      );
      return box;
    }

    function renderSummary(unlocked = [], extra = null) {
      state.done = true;
      stopTimer();
      bar.firstChild.style.width = "100%";
      counter.textContent = "Complete";
      endBtn.textContent = "Close";
      backBtn.style.display = "none";
      flagBtn.style.display = "none";
      combo.hidden = true;
      clear(body);
      clear(foot);

      const answered = answeredCount();
      const rate = answered ? state.correct / answered : 0;
      const color = rate >= 0.8 ? "var(--green)" : rate >= 0.5 ? "var(--accent)" : "var(--orange)";

      const summary = h("div", { class: "summary" });
      summary.appendChild(ring(rate, { size: 148, stroke: 13, color, label: pct(rate), sub: "accuracy" }));
      summary.appendChild(h("h2", { class: "summary-title" }, headline(rate)));
      summary.appendChild(h("p", { class: "small muted" }, summaryMessage(rate)));
      summary.appendChild(
        h(
          "div",
          { class: "tiles", style: "margin-top:18px" },
          tile(answered, "Answered"),
          tile(state.correct, "Correct"),
          tile(state.bestCombo, "Best streak")
        )
      );
      body.appendChild(summary);

      if (extra) body.appendChild(extra);

      for (const title of unlocked) {
        body.appendChild(
          h(
            "div",
            { class: "nudge unlock" },
            h("span", { class: "icon-chip c-green", html: ICONS.unlock }),
            h("span", {}, h("strong", {}, "New stage unlocked: "), title, " — it's now part of your daily mix.")
          )
        );
      }

      const misses = state.queue
        .map((q, i) => ({ q, rec: state.history[i] }))
        .filter(({ rec }) => rec && !rec.feedback.correct);
      if (misses.length) {
        const det = h("details", { class: "card misses" });
        det.appendChild(h("summary", {}, `Review ${misses.length} miss${misses.length === 1 ? "" : "es"}`));
        for (const { q } of misses) {
          det.appendChild(
            h(
              "div",
              { class: "miss" },
              h("div", { class: "miss-prompt" }, q.itemTitle ? `${q.itemTitle} — ${q.prompt}` : q.prompt),
              h("div", { class: "miss-answer" }, "✓ ", q.choices[q.correctIndex]),
              q.explanation ? h("div", { class: "fb-exp" }, q.explanation) : null
            )
          );
        }
        body.appendChild(det);
      }

      foot.appendChild(h("button", { class: "btn primary block lg", onclick: shut }, "Done"));
      if (rate >= 0.8 && answered >= 3) celebrate(overlay);
    }

    renderQuestion();
    return overlay;
  });
}

const gradeLocally = (q, chosen) => ({
  correct: chosen === q.correctIndex,
  correctIndex: q.correctIndex,
  explanation: q.explanation,
  nextIntervalDays: null,
});

function headline(rate) {
  if (rate >= 0.9) return "Outstanding";
  if (rate >= 0.7) return "Nice work";
  if (rate >= 0.5) return "Getting there";
  return "Tough one";
}

function summaryMessage(rate) {
  if (rate >= 0.9) return "Excellent recall — these come back at longer intervals.";
  if (rate >= 0.7) return "Solid session. The ones you missed are back tomorrow.";
  if (rate >= 0.5) return "Keep going — the misses are rescheduled soon so they'll stick.";
  return "Those questions reset to a 1-day interval; you'll see them again shortly.";
}

// A short burst of confetti. Purely decorative; skipped for reduced motion.
function celebrate(container) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["var(--accent)", "var(--green)", "var(--orange)", "var(--purple)", "var(--teal)"];
  const layer = h("div", { class: "confetti", "aria-hidden": "true" });
  for (let i = 0; i < 36; i++) {
    const piece = h("i", {});
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    piece.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    piece.style.setProperty("--spin", `${Math.random() * 720 - 360}deg`);
    layer.appendChild(piece);
  }
  container.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const kindLabel = (k) =>
  ({ mcq: "Recall", approach: "Approach", complexity: "Complexity", trace: "Trace", fill_blank: "Fill blank" }[k] || "Recall");

function badge(text, variant) {
  return h("span", { class: `badge ${variant || ""}` }, text);
}
function tile(value, label) {
  return h("div", { class: "tile" }, h("div", { class: "v" }, String(value)), h("div", { class: "l" }, label));
}
