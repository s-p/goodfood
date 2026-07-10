import type { Checkin, Entry, PhotoRecord } from "./types";

// Minimal promise wrapper around IndexedDB. Keep the schema in sync with
// public/sw.js, which writes check-ins from notification actions.
const DB_NAME = "goodfood";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("entries")) {
        const s = db.createObjectStore("entries", { keyPath: "id" });
        s.createIndex("eatenAt", "eatenAt");
      }
      if (!db.objectStoreNames.contains("checkins")) {
        const s = db.createObjectStore("checkins", { keyPath: "id" });
        s.createIndex("at", "at");
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const db = {
  putEntry: (e: Entry) => tx("entries", "readwrite", (s) => s.put(e)),
  getEntry: (id: string) => tx<Entry | undefined>("entries", "readonly", (s) => s.get(id)),
  deleteEntry: async (id: string) => {
    await tx("entries", "readwrite", (s) => s.delete(id));
    await tx("photos", "readwrite", (s) => s.delete(id));
  },
  allEntries: () => tx<Entry[]>("entries", "readonly", (s) => s.getAll()),

  putCheckin: (c: Checkin) => tx("checkins", "readwrite", (s) => s.put(c)),
  deleteCheckin: (id: string) => tx("checkins", "readwrite", (s) => s.delete(id)),
  allCheckins: () => tx<Checkin[]>("checkins", "readonly", (s) => s.getAll()),

  putPhoto: (p: PhotoRecord) => tx("photos", "readwrite", (s) => s.put(p)),
  getPhoto: (id: string) =>
    tx<PhotoRecord | undefined>("photos", "readonly", (s) => s.get(id)),
};

export function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}
