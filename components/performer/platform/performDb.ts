/*
 * Performer mode's device storage: one IndexedDB database, `ots-perform`, with a store per kind of record
 * (annotations, scores kept on the device, setlists). Each store is used through a small Table; tests and browsers
 * without IndexedDB use the in-memory one.
 */

const DB_NAME = 'ots-perform';
const DB_VERSION = 2;

export interface Table<T> {
  get(key: string): Promise<T | undefined>;
  all(): Promise<T[]>;
  /** The records whose `index` field equals `value` (annotations by scoreKey). */
  where(index: string, value: string): Promise<T[]>;
  put(record: T): Promise<void>;
  remove(key: string): Promise<void>;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let database: Promise<IDBDatabase> | null = null;

/** The database, opened (and upgraded) once per page; asks the browser to keep it (storage.persist). */
function connect(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = (event) => {
        const db = open.result;
        if (event.oldVersion < 1) {
          db.createObjectStore('annotations', { keyPath: 'id' }).createIndex(
            'scoreKey',
            'scoreKey',
          );
        }
        if (event.oldVersion < 2) {
          db.createObjectStore('scores', { keyPath: 'key' });
          db.createObjectStore('setlists', { keyPath: 'id' });
        }
      };
      open.onsuccess = () => {
        // Another tab opening a newer version: let it, and reopen next time
        open.result.onversionchange = () => {
          open.result.close();
          database = null;
        };
        resolve(open.result);
      };
      open.onerror = () => reject(open.error);
    });
    void navigator.storage?.persist?.().catch(() => {});
  }
  return database;
}

export function indexedDbTable<T>(store: 'annotations' | 'scores' | 'setlists'): Table<T> {
  const tx = async (mode: IDBTransactionMode) =>
    (await connect()).transaction(store, mode).objectStore(store);
  return {
    get: async (key) => request((await tx('readonly')).get(key)) as Promise<T | undefined>,
    all: async () => request((await tx('readonly')).getAll()) as Promise<T[]>,
    where: async (index, value) =>
      request((await tx('readonly')).index(index).getAll(value)) as Promise<T[]>,
    put: async (record) => {
      await request((await tx('readwrite')).put(record));
    },
    remove: async (key) => {
      await request((await tx('readwrite')).delete(key));
    },
  };
}

export function memoryTable<T>(keyOf: (record: T) => string, initial: T[] = []): Table<T> {
  const items = new Map(initial.map((record) => [keyOf(record), record]));
  return {
    get: async (key) => items.get(key),
    all: async () => [...items.values()],
    where: async (index, value) =>
      [...items.values()].filter((record) => (record as Record<string, unknown>)[index] === value),
    put: async (record) => void items.set(keyOf(record), record),
    remove: async (key) => void items.delete(key),
  };
}

/** The table for this browser: IndexedDB where there is one, otherwise in memory (lost on reload). */
export function deviceTable<T>(
  store: 'annotations' | 'scores' | 'setlists',
  keyOf: (record: T) => string,
): Table<T> {
  return typeof indexedDB === 'undefined' ? memoryTable(keyOf) : indexedDbTable<T>(store);
}
