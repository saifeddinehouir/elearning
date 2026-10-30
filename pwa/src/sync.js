// Cloud sync engine. Pure: no DOM, no IndexedDB, no Firebase.
//
// The device's data is flattened into records, `${kind}:${key}` → data, that
// mean the same thing on every device (no local-only ids). Sync keeps, per
// account, the hash of each record as the cloud last had it (`synced`):
//   - a record whose hash differs from `synced` changed here → push it
//   - an id in `synced` that's gone here was deleted here → push a tombstone
//   - a cloud change to a record that didn't change here → apply it
//   - both changed → merge by kind (see mergeConflict)
// Built-in deck content is never uploaded (every device ships it); only the
// fact that a path/library is installed and each built-in deck's mix toggle.

import { hashString } from "./random.js";

// Applied in this order, so decks exist before the progress that points at them.
export const APPLY_ORDER = ["settings", "path", "deck", "mix", "roadmap", "review", "flag", "attempt", "challenge"];

export const recordId = (kind, key) => `${kind}:${key}`;
export function splitId(id) {
  const i = id.indexOf(":");
  return { kind: id.slice(0, i), key: id.slice(i + 1) };
}

// JSON with sorted keys, so equal data always hashes the same.
export function stableStringify(v) {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
}

export function hashData(data) {
  const s = stableStringify(data);
  return `${hashString(s, 1).toString(36)}${hashString(s, 2).toString(36)}${s.length.toString(36)}`;
}

const omit = (obj, keys) => {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
};

// How a deck is named on every device: built-in decks by their built-in key
// (their local ids differ per device), imported decks by their id.
export const deckRef = (deck) =>
  deck?.builtinKey ? { ref: `b:${deck.builtinKey}` } : deck?.libraryKey ? { ref: `l:${deck.libraryKey}` } : deck ? { deckId: deck.id } : null;

const isBuiltinDeck = (d) => !!(d.builtinKey || d.libraryKey);

/**
 * Flattens a device snapshot into sync records.
 * snap: { decks, items, questions, reviewState, attempts, flags, roadmaps, challenges, settings }
 * Returns Map<id, { kind, key, data }>.
 */
export function snapshotToRecords(snap) {
  const out = new Map();
  const put = (kind, key, data) => out.set(recordId(kind, key), { kind, key, data });
  const deckById = new Map(snap.decks.map((d) => [d.id, d]));

  if (snap.settings) put("settings", "all", snap.settings);

  for (const d of snap.decks) {
    if (isBuiltinDeck(d)) {
      put("mix", deckRef(d).ref, { includeInMix: d.includeInMix !== false });
    } else {
      put("deck", d.id, {
        deck: omit(d, []),
        items: snap.items.filter((i) => i.deckId === d.id).map((i) => omit(i, ["deckId"])),
        questions: snap.questions.filter((q) => q.deckId === d.id).map((q) => omit(q, ["deckId"])),
      });
    }
  }

  for (const r of snap.roadmaps) {
    if (r.builtin) put("path", r.builtin, { installed: true });
    else {
      put("roadmap", r.id, {
        ...r,
        nodes: (r.nodes || []).map((n) => ({ ...omit(n, ["deckId"]), deck: n.deckId ? deckRef(deckById.get(n.deckId)) : null })),
      });
    }
  }

  for (const r of snap.reviewState) put("review", r.questionId, omit(r, ["deckId"]));
  for (const f of snap.flags) put("flag", f.questionId, omit(f, ["deckId"]));
  for (const a of snap.attempts) if (a.syncId) put("attempt", a.syncId, omit(a, ["id"]));
  for (const c of snap.challenges) put("challenge", String(c.dayStart), c);
  return out;
}

// Both sides have a version and they differ. `initial`: this device has never
// synced this record (a device joining the account), so the cloud is the
// account's truth for settings-like records.
export function mergeConflict(kind, local, remote, { initial = false } = {}) {
  switch (kind) {
    case "review": {
      // Keep the schedule from the most recent review.
      const lt = local.lastReviewedAt || 0;
      const rt = remote.lastReviewedAt || 0;
      if (rt !== lt) return rt > lt ? remote : local;
      return (remote.totalReviews || 0) > (local.totalReviews || 0) ? remote : local;
    }
    case "challenge": {
      const done = [local.completedAt, remote.completedAt].filter(Boolean);
      const latest = (remote.completedAt || 0) > (local.completedAt || 0) ? remote : local;
      return {
        ...remote,
        ...local,
        score: latest.score ?? local.score ?? remote.score,
        total: Math.max(local.total || 0, remote.total || 0) || undefined,
        bestScore: Math.max(local.bestScore ?? 0, remote.bestScore ?? 0),
        completedAt: done.length ? Math.min(...done) : undefined,
        plays: Math.max(local.plays || 0, remote.plays || 0),
        questionIds: local.questionIds || remote.questionIds,
      };
    }
    case "deck":
      // Same deck on both sides (content never changes); keep the newer mix toggle / name.
      return { ...remote, deck: { ...remote.deck, ...local.deck } };
    default:
      // settings, flags, mix toggles, roadmaps: the cloud wins when this device
      // is joining; otherwise this device's newer edit wins and is pushed.
      return initial ? remote : local;
  }
}

/**
 * Decides what to do with changes pulled from the cloud.
 * local:  Map<id, {kind,key,data}> (this device now)
 * synced: Map<id, hash> (the cloud as of the last sync)
 * remote: [{ id, kind, key, data|null (deleted), hash|null }]
 * Returns { toApply: [{ id, kind, key, data|null }], synced: Map } — the
 * synced map is a copy, updated to what the cloud has now.
 */
export function resolvePull(local, synced, remote) {
  const next = new Map(synced);
  const toApply = [];
  for (const r of remote) {
    const remoteHash = r.data == null ? null : r.hash || hashData(r.data);
    const last = next.get(r.id) ?? null;
    if (remoteHash === last) continue; // our own write coming back, or nothing new

    const mine = local.get(r.id);
    const mineHash = mine ? hashData(mine.data) : null;
    const changedHere = mineHash !== last;

    if (remoteHash === null) next.delete(r.id);
    else next.set(r.id, remoteHash);

    if (!changedHere) {
      if (mineHash !== remoteHash) toApply.push({ id: r.id, kind: r.kind, key: r.key, data: r.data });
      continue;
    }
    // Changed on both sides.
    if (remoteHash === null) continue; // deleted there, edited here: keep ours (it gets pushed back)
    if (!mine) {
      // Deleted here, changed there: keep the data rather than lose it.
      toApply.push({ id: r.id, kind: r.kind, key: r.key, data: r.data });
      continue;
    }
    const merged = mergeConflict(r.kind, mine.data, r.data, { initial: last === null });
    if (hashData(merged) !== mineHash) toApply.push({ id: r.id, kind: r.kind, key: r.key, data: merged });
  }
  return { toApply: sortForApply(toApply), synced: next };
}

/** What to upload: changed records and tombstones for records deleted here. */
export function computePush(local, synced) {
  const out = [];
  for (const [id, rec] of local) {
    const h = hashData(rec.data);
    if (synced.get(id) !== h) out.push({ id, kind: rec.kind, key: rec.key, data: rec.data, hash: h });
  }
  for (const id of synced.keys()) {
    if (!local.has(id)) {
      const { kind, key } = splitId(id);
      out.push({ id, kind, key, data: null, hash: null });
    }
  }
  return out;
}

/** The synced map after `pushed` records reached the cloud. */
export function markPushed(synced, pushed) {
  const next = new Map(synced);
  for (const p of pushed) {
    if (p.data == null) next.delete(p.id);
    else next.set(p.id, p.hash);
  }
  return next;
}

export function sortForApply(list) {
  const rank = (k) => {
    const i = APPLY_ORDER.indexOf(k);
    return i === -1 ? APPLY_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** Study days rebuilt from answers, so two devices' answers on one day add up. */
export function studyDaysFromAttempts(attempts, dailyGoal, dayStartOf) {
  const days = new Map();
  for (const a of attempts) {
    const d = dayStartOf(a.date);
    const e = days.get(d) || { dayStart: d, answered: 0, correct: 0 };
    e.answered += 1;
    if (a.wasCorrect) e.correct += 1;
    days.set(d, e);
  }
  return [...days.values()].map((e) => ({ ...e, completedGoal: e.answered >= dailyGoal }));
}
