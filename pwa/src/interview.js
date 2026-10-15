// Interview date mode. Pure logic over the question shape composeSession()
// uses: { id, topic, reviewState?, attempts? }. An interview is stored in
// settings as { date, setOn, deckIds? }: day starts in ms, and the decks to
// focus on (missing = whatever is in the daily mix).
//
// Nothing here is stored. Setting a date only changes how today's queue is
// built, so removing it puts everything back on the normal SM-2 schedule:
//   - Reviews that would land after the interview are treated as due in the
//     last few days before it, spread so they don't all pile onto one night.
//   - Unseen questions are paced across the days left, keeping the final
//     day or two for review only.
//   - Readiness = share of questions whose latest answer was right.

import { startOfDay, addDays } from "./format.js";

// At most this many days before the interview take the pulled-in reviews.
export const FINAL_WINDOW = 3;
// A session never grows past this, however far behind the plan is.
export const MAX_SESSION = 60;

const DAY = 86400000;
const dayDiff = (a, b) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

// Study days left before the interview, today included. 0 = it's today,
// negative = it has passed.
export const daysLeft = (interviewDate, now = Date.now()) => dayDiff(now, interviewDate);

export const isActive = (interviewDate, now = Date.now()) =>
  Number.isFinite(interviewDate) && daysLeft(interviewDate, now) >= 0;

// Days at the end kept for review only, fixed by how much notice there was
// when the date was set: none when time is short, up to two.
export const reserveDays = ({ date, setOn }) => Math.max(0, Math.min(2, Math.floor(dayDiff(setOn ?? date, date) / 4)));

const isSeen = (q) => q.reviewState && (q.reviewState.totalReviews || 0) > 0;

// Small stable hash so each question lands on the same final-window day on
// every render.
function spreadOf(id, window) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % window;
}

// The due date a seen question gets under the plan. Unchanged unless its next
// review would come on or after the interview day.
export function effectiveDue(state, interviewDate, id, now = Date.now()) {
  const interviewDay = startOfDay(interviewDate).getTime();
  if (state.dueDate < interviewDay) return state.dueDate;
  const left = daysLeft(interviewDate, now);
  if (left <= 0) return state.dueDate;
  const window = Math.max(1, Math.min(FINAL_WINDOW, left));
  const target = addDays(interviewDay, -1 - spreadOf(id, window)).getTime();
  // Never earlier than the day after it was last answered.
  const earliest = state.lastReviewedAt ? addDays(startOfDay(state.lastReviewedAt), 1).getTime() : 0;
  const due = Math.max(target, earliest);
  return due < interviewDay ? due : state.dueDate;
}

// The pool with review dates moved under the plan, for composeSession() only.
// Review states are copied, never mutated.
export function withInterviewDue(pool, interviewDate, now = Date.now()) {
  if (!isActive(interviewDate, now)) return pool;
  return pool.map((q) => {
    if (!isSeen(q)) return q;
    const due = effectiveDue(q.reviewState, interviewDate, q.id, now);
    return due === q.reviewState.dueDate ? q : { ...q, reviewState: { ...q.reviewState, dueDate: due } };
  });
}

// Days that still take new questions, today included.
export const learningDays = (interview, now = Date.now()) => daysLeft(interview.date, now) - reserveDays(interview);

// New questions a day needed to see `unseen` questions in time (0 once only
// review days are left).
export function paceFor(unseen, interview, now = Date.now()) {
  const days = learningDays(interview, now);
  return days > 0 ? Math.ceil(unseen / days) : 0;
}

// The decks the interview focuses on, limited to ones that still exist, or
// null for "whatever is in the daily mix" (also when none are left).
export function focusDeckIds(interview, existingIds) {
  const ids = Array.isArray(interview?.deckIds) ? interview.deckIds : null;
  if (!ids) return null;
  const have = new Set(existingIds);
  const kept = ids.filter((id) => have.has(id));
  return kept.length ? kept : null;
}

const firstAttemptToday = (q, now) => {
  const dates = (q.attempts || []).map((a) => a.date);
  return dates.length > 0 && dayDiff(Math.min(...dates), now) === 0;
};

// Today's plan for a pool already passed through withInterviewDue().
// `interview` is { date, setOn } (both ms).
//   newPerDay  - pace that covers every unseen question in time
//   newToday   - new questions still to introduce today
//   dueToday   - reviews due by the end of today
//   reviewOnly - today is one of the reserved final days (or the day itself)
//   size       - session size: at least the daily goal, capped at MAX_SESSION
//   behind     - true when even MAX_SESSION can't hold today's work
export function planToday(pool, interview, dailyGoal, now = Date.now()) {
  const left = daysLeft(interview.date, now);
  const endOfToday = addDays(startOfDay(now), 1).getTime();
  const unseen = pool.filter((q) => !isSeen(q)).length;
  const introducedToday = pool.filter((q) => isSeen(q) && firstAttemptToday(q, now)).length;
  const dueToday = pool.filter((q) => isSeen(q) && q.reviewState.dueDate < endOfToday).length;

  const reviewOnly = learningDays(interview, now) <= 0;
  // Pace from the start of today, so finishing today's share doesn't make
  // the next render ask for more.
  const newPerDay = paceFor(unseen + introducedToday, interview, now);
  const newToday = Math.max(0, newPerDay - introducedToday);

  const needed = dueToday + newToday;
  return {
    daysLeft: left,
    reviewOnly,
    unseen,
    newPerDay,
    newToday,
    dueToday,
    size: Math.min(MAX_SESSION, Math.max(dailyGoal, needed)),
    behind: needed > MAX_SESSION,
  };
}

// Readiness overall and per topic, weakest first. A question is ready when its
// latest answer was right (SM-2: repetitions > 0); unseen ones aren't.
export function readiness(pool) {
  const byTopic = {};
  let ready = 0;
  for (const q of pool) {
    const t = q.topic || "General";
    const e = byTopic[t] || (byTopic[t] = { topic: t, ready: 0, total: 0 });
    e.total += 1;
    if (q.reviewState && q.reviewState.repetitions > 0) {
      e.ready += 1;
      ready += 1;
    }
  }
  const topics = Object.values(byTopic)
    .map((e) => ({ ...e, rate: e.ready / e.total }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total || a.topic.localeCompare(b.topic));
  return { ready, total: pool.length, rate: pool.length ? ready / pool.length : 0, topics };
}
