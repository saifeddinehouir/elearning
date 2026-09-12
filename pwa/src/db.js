// Thin promise wrapper around IndexedDB. Browser-only.

const DB_NAME = "dailyqcm";
const DB_VERSION = 1;

export const STORES = {
  decks: "decks",
  items: "items",
  questions: "questions",
  reviewState: "reviewState",
  attempts: "attempts",
  studyDays: "studyDays",
};

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORES.decks)) {
        db.createObjectStore(STORES.decks, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORES.items)) {
        const s = db.createObjectStore(STORES.items, { keyPath: "id" });
        s.createIndex("deckId", "deckId");
      }
      if (!db.objectStoreNames.contains(STORES.questions)) {
        const s = db.createObjectStore(STORES.questions, { keyPath: "id" });
        s.createIndex("deckId", "deckId");
        s.createIndex("itemId", "itemId");
      }
      if (!db.objectStoreNames.contains(STORES.reviewState)) {
        const s = db.createObjectStore(STORES.reviewState, { keyPath: "questionId" });
        s.createIndex("deckId", "deckId");
        s.createIndex("dueDate", "dueDate");
      }
      if (!db.objectStoreNames.contains(STORES.attempts)) {
        const s = db.createObjectStore(STORES.attempts, { keyPath: "id", autoIncrement: true });
        s.createIndex("date", "date");
        s.createIndex("questionId", "questionId");
      }
      if (!db.objectStoreNames.contains(STORES.studyDays)) {
        db.createObjectStore(STORES.studyDays, { keyPath: "dayStart" });
      }
      void e;
    };
  });
  return dbPromise;
}

function tx(storeNames, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(storeNames, mode);
        const stores = Array.isArray(storeNames)
          ? Object.fromEntries(storeNames.map((n) => [n, t.objectStore(n)]))
          : t.objectStore(storeNames);
        let result;
        Promise.resolve(fn(stores, t))
          .then((r) => { result = r; })
          .catch(reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error || new Error("transaction aborted"));
      })
  );
}

const reqToPromise = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const dbGetAll = (store, query, count) =>
  tx(store, "readonly", (s) => reqToPromise(s.getAll(query, count)));

export const dbGet = (store, key) =>
  tx(store, "readonly", (s) => reqToPromise(s.get(key)));

export const dbGetAllByIndex = (store, index, query) =>
  tx(store, "readonly", (s) => reqToPromise(s.index(index).getAll(query)));

export const dbPut = (store, value) =>
  tx(store, "readwrite", (s) => reqToPromise(s.put(value)));

export const dbBulkPut = (store, values) =>
  tx(store, "readwrite", (s) => {
    for (const v of values) s.put(v);
  });

export const dbDelete = (store, key) =>
  tx(store, "readwrite", (s) => reqToPromise(s.delete(key)));

export { tx, reqToPromise };
