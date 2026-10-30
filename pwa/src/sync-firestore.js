// Cloud side of sync: one Firestore document per record, under
// users/{uid}/records/{id}. Each holds { kind, key, json, hash, deleted,
// updatedAt } where updatedAt is the server's commit time, so "what changed
// since my last pull" never depends on device clocks. The data travels as a
// JSON string so it round-trips exactly (Firestore maps would drop undefined
// fields and reject nested arrays). Browser-only.

import { recordId } from "./sync.js";

// A Firestore document is capped at 1 MiB; leave room for the other fields.
export const MAX_JSON_BYTES = 900_000;
const BATCH_SIZE = 400; // Firestore allows 500 writes per batch
const PAGE_SIZE = 500;

export async function firestoreRemote({ sdkBase, app, uid }) {
  const fs = await import(`${sdkBase}firebase-firestore.js`);
  const db = fs.getFirestore(app);
  const col = fs.collection(db, "users", uid, "records");
  const toTs = (c) => new fs.Timestamp(c.s, c.n);

  return {
    // Everything committed after `cursor` ({ s, n } seconds/nanos), oldest first.
    async pull(cursor) {
      const changes = [];
      let last = cursor;
      let lastDoc = null;
      for (;;) {
        const q = fs.query(
          col,
          ...(cursor ? [fs.where("updatedAt", ">", toTs(cursor))] : []),
          fs.orderBy("updatedAt"),
          fs.orderBy(fs.documentId()),
          ...(lastDoc ? [fs.startAfter(lastDoc)] : []),
          fs.limit(PAGE_SIZE)
        );
        const snap = await fs.getDocs(q);
        for (const d of snap.docs) {
          const v = d.data();
          if (!v.updatedAt || !v.kind) continue;
          changes.push({
            id: recordId(v.kind, v.key),
            kind: v.kind,
            key: v.key,
            data: v.deleted ? null : JSON.parse(v.json),
            hash: v.deleted ? null : v.hash,
          });
          last = { s: v.updatedAt.seconds, n: v.updatedAt.nanoseconds };
        }
        // Page with the document snapshot, not the timestamp: a batch's docs
        // all share one commit time and could straddle a page boundary.
        if (snap.docs.length < PAGE_SIZE) break;
        lastDoc = snap.docs[snap.docs.length - 1];
      }
      return { changes, cursor: last };
    },

    // Uploads records (data null = tombstone). Returns which went up and
    // which were too large for one document.
    async push(list) {
      const pushed = [];
      const skipped = [];
      const ready = [];
      for (const p of list) {
        const json = p.data == null ? null : JSON.stringify(p.data);
        if (json && json.length > MAX_JSON_BYTES) skipped.push(p);
        else ready.push({ p, json });
      }
      for (let i = 0; i < ready.length; i += BATCH_SIZE) {
        const chunk = ready.slice(i, i + BATCH_SIZE);
        const batch = fs.writeBatch(db);
        for (const { p, json } of chunk) {
          batch.set(fs.doc(col, encodeURIComponent(p.id)), {
            kind: p.kind,
            key: p.key,
            json,
            hash: p.hash ?? null,
            deleted: p.data == null,
            updatedAt: fs.serverTimestamp(),
          });
        }
        await batch.commit();
        pushed.push(...chunk.map((c) => c.p));
      }
      return { pushed, skipped };
    },
  };
}
