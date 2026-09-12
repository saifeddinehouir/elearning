import { h, clear, openOverlay } from "../dom.js";
import { composeSession } from "../session.js";
import { recordAnswer, finishSession } from "../store.js";
import { pct } from "../format.js";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function startSession(pool, config) {
  const { queue } = composeSession(pool, config);
  if (queue.length === 0) return;

  const state = { queue, index: 0, correct: 0, chosen: null, revealed: false, feedback: null, done: false };

  openOverlay((close) => {
    const overlay = h("div", { class: "overlay" });

    const head = h("div", { class: "o-head" });
    const bar = h("div", { class: "progress", style: "margin:0 16px 8px" }, h("i", {}));
    const body = h("div", { class: "o-body" });
    const foot = h("div", { class: "o-foot" });
    overlay.append(head, bar, body, foot);

    const endBtn = h("button", { class: "btn", onclick: () => confirmEnd(close) }, "End");
    const counter = h("strong", {}, "");
    head.append(endBtn, counter, h("div", { class: "spacer" }));

    function confirmEnd(closeFn) {
      if (state.done) return closeFn();
      if (confirm("End this session? Progress on answered questions is saved.")) closeFn();
    }

    function paintProgress() {
      counter.textContent = `${Math.min(state.index + 1, state.queue.length)} / ${state.queue.length}`;
      bar.firstChild.style.width = `${(state.index / state.queue.length) * 100}%`;
    }

    async function submit() {
      if (state.chosen == null || state.revealed) return;
      state.revealed = true;
      const q = state.queue[state.index];
      state.feedback = await recordAnswer(q, state.chosen);
      if (state.feedback.correct) state.correct += 1;
      renderQuestion();
    }

    async function next() {
      state.index += 1;
      state.chosen = null;
      state.revealed = false;
      state.feedback = null;
      if (state.index >= state.queue.length) {
        await finishSession(state.queue.length, state.correct);
        renderSummary();
      } else {
        renderQuestion();
      }
    }

    function renderQuestion() {
      paintProgress();
      const q = state.queue[state.index];
      clear(body);

      body.appendChild(
        h(
          "div",
          { class: "row", style: "gap:6px;flex-wrap:wrap" },
          badge(q.kind ? kindLabel(q.kind) : "Recall", "accent"),
          badge(cap(q.difficulty), q.difficulty),
          badge(q.topic, "accent")
        )
      );

      if (q.context) {
        body.appendChild(
          h(
            "details",
            { class: "q-context" },
            h("summary", {}, q.itemTitle || "Context"),
            h("div", { class: "body" }, q.context)
          )
        );
      }

      body.appendChild(h("div", { class: "q-prompt" }, q.prompt));

      q.choices.forEach((choice, i) => {
        let cls = "choice";
        if (state.revealed) {
          if (i === q.correctIndex) cls += " correct";
          else if (i === state.chosen) cls += " wrong";
        } else if (state.chosen === i) {
          cls += " selected";
        }
        body.appendChild(
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
            h("span", {}, choice)
          )
        );
      });

      if (state.revealed && state.feedback) {
        const fb = state.feedback;
        const box = h("div", { class: `feedback ${fb.correct ? "correct" : "wrong"}` });
        box.appendChild(h("div", { class: "fb-title" }, fb.correct ? "Correct" : "Incorrect"));
        if (!fb.correct) box.appendChild(h("div", {}, `Answer: ${q.choices[q.correctIndex]}`));
        if (q.explanation) box.appendChild(h("div", { class: "fb-exp" }, q.explanation));
        box.appendChild(
          h("div", { class: "fb-exp" }, `Next review in ~${fb.nextIntervalDays} day${fb.nextIntervalDays === 1 ? "" : "s"}.`)
        );
        body.appendChild(box);
      }

      clear(foot);
      foot.appendChild(
        h(
          "button",
          {
            class: "btn primary block lg",
            disabled: !state.revealed && state.chosen == null,
            onclick: () => (state.revealed ? next() : submit()),
          },
          state.revealed ? (state.index + 1 >= state.queue.length ? "Finish" : "Next") : "Check answer"
        )
      );
    }

    function renderSummary() {
      state.done = true;
      bar.firstChild.style.width = "100%";
      counter.textContent = "Done";
      endBtn.textContent = "Close";
      clear(body);
      clear(foot);
      const answered = state.queue.length;
      const rate = answered ? state.correct / answered : 0;
      body.appendChild(
        h(
          "div",
          { class: "summary" },
          h("div", { class: "big" }, rate >= 0.8 ? "🌟" : "✅"),
          h("h2", { class: "screen-title" }, "Session complete"),
          h(
            "div",
            { class: "tiles" },
            tile(answered, "Answered"),
            tile(state.correct, "Correct"),
            tile(pct(rate), "Accuracy")
          ),
          h("p", { class: "small muted mt" }, summaryMessage(rate))
        )
      );
      foot.appendChild(h("button", { class: "btn primary block lg", onclick: close }, "Done"));
    }

    renderQuestion();
    return overlay;
  });
}

function summaryMessage(rate) {
  if (rate >= 0.9) return "Excellent recall — these come back at longer intervals.";
  if (rate >= 0.7) return "Solid session. The ones you missed are back tomorrow.";
  if (rate >= 0.5) return "Keep going — the misses are rescheduled soon so they'll stick.";
  return "Tough set. Those questions reset to a 1-day interval; you'll see them again shortly.";
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
