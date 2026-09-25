/**
 * Stockage IndexedDB pour les gros objets (catalogue de dizaines de milliers d'entrées),
 * que localStorage (~5 Mo) ne peut pas contenir. Repli silencieux si IndexedDB manque.
 */
const DB = 'streampro';
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function open(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        if (typeof indexedDB === 'undefined') return resolve(null);
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(STORE, mode);
          const req = fn(tx.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
}

export function idbSet(key: string, value: unknown): Promise<boolean> {
  return run('readwrite', (s) => s.put(value, key)).then((r) => r !== undefined);
}

export function idbDel(key: string): Promise<void> {
  return run('readwrite', (s) => s.delete(key)).then(() => undefined);
}
