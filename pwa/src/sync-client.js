// Runs cloud sync for the signed-in Pro account: when the app opens, a few
// seconds after any change, when the app goes to the background, when the
// connection comes back, and from "Sync now". One sync at a time; a request
// during a sync runs once more afterwards. Browser-only.

import {
  accountsConfigured,
  accountStatus,
  currentUid,
  firebaseApp,
  onAccountChange,
  FIREBASE_SDK_BASE,
} from "./account.js";
import { getPlan, onChange, readSyncSnapshot, getSyncMeta, saveSyncMeta, applySyncRecords } from "./store.js";
import { hasFeature } from "./plan.js";
import { snapshotToRecords, resolvePull, computePush, markPushed, sortForApply } from "./sync.js";
import { firestoreRemote } from "./sync-firestore.js";

const CHANGE_DELAY_MS = 8000;

// "idle" | "syncing" | "ok" | "error" | "offline"
let status = { state: "idle", at: null, error: null, result: null };
const listeners = new Set();
const setStatus = (patch) => {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
};
export const syncStatus = () => status;
export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const syncSignedIn = () => accountsConfigured() && accountStatus() === "signed_in" && !!currentUid();
export const syncAllowed = () => syncSignedIn() && hasFeature(getPlan(), "sync");

// True while pulled records are written locally, so the change they emit
// doesn't schedule another sync.
let applying = false;

/**
 * One sync cycle against `remote` ({ pull(cursor), push(list) }) for `uid`.
 * Exported so it can be exercised with a fake remote.
 */
export async function runSync(remote, uid) {
  const meta = await getSyncMeta(uid);
  let local = snapshotToRecords(await readSyncSnapshot());

  const { changes, cursor } = await remote.pull(meta.cursor);
  const { toApply, synced } = resolvePull(local, meta.synced, changes);

  // Retry anything that couldn't be applied last time; newer pulls win.
  const queued = new Map(meta.pending.map((r) => [r.id, r]));
  for (const r of toApply) queued.set(r.id, r);
  const queue = sortForApply([...queued.values()]);

  let failed = [];
  if (queue.length) {
    applying = true;
    try {
      ({ failed } = await applySyncRecords(queue));
    } finally {
      applying = false;
    }
    local = snapshotToRecords(await readSyncSnapshot());
  }

  // Never push this device's stale copy of a record we couldn't update yet.
  const failedIds = new Set(failed.map((f) => f.id));
  const outgoing = computePush(local, synced).filter((p) => !failedIds.has(p.id));
  const { pushed, skipped } = await remote.push(outgoing);

  await saveSyncMeta(uid, { synced: markPushed(synced, pushed), cursor, pending: failed, lastSyncAt: Date.now() });
  return { pulled: queue.length - failed.length, pushed: pushed.length, skipped: skipped.length, failed: failed.length };
}

let remotePromise = null;
let remoteUid = null;
async function cloud(uid) {
  if (!remotePromise || remoteUid !== uid) {
    remoteUid = uid;
    remotePromise = (async () => firestoreRemote({ sdkBase: FIREBASE_SDK_BASE, app: await firebaseApp(), uid }))().catch((err) => {
      remotePromise = null;
      throw err;
    });
  }
  return remotePromise;
}

let inflight = null;
let again = false;

export function syncNow() {
  if (!syncAllowed()) return Promise.resolve(null);
  if (inflight) {
    again = true;
    return inflight;
  }
  inflight = (async () => {
    let result = null;
    do {
      again = false;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setStatus({ state: "offline" });
        break;
      }
      setStatus({ state: "syncing", error: null });
      try {
        const uid = currentUid();
        result = await runSync(await cloud(uid), uid);
        setStatus({ state: "ok", at: Date.now(), result });
      } catch (err) {
        console.error("Sync failed", err);
        setStatus({ state: "error", error: friendlyError(err) });
        break;
      }
    } while (again);
    inflight = null;
    return result;
  })();
  return inflight;
}

function friendlyError(err) {
  const code = err?.code || "";
  if (code === "permission-denied") return "The cloud refused the change. Cloud sync needs an active Pro plan.";
  if (code === "unavailable" || code === "deadline-exceeded") return "Couldn't reach the cloud. It'll retry when you're back online.";
  if (code === "resource-exhausted") return "The cloud is busy. It'll retry shortly.";
  return err?.message || "Sync didn't finish. It'll retry automatically.";
}

let timer = null;
function syncSoon(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}

// Wires the triggers once. Safe to call when accounts aren't configured.
let started = false;
export function startSync() {
  if (started || !accountsConfigured()) return;
  started = true;
  onAccountChange(() => {
    if (syncAllowed()) syncSoon(500);
  });
  onChange(() => {
    if (!applying && syncAllowed()) syncSoon(CHANGE_DELAY_MS);
  });
  window.addEventListener("online", () => syncSoon(500));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && syncAllowed()) {
      clearTimeout(timer);
      syncNow();
    }
  });
}
