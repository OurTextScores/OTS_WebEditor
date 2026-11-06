import type { Annotation } from './annotationModel';

/*
 * Where annotations are kept: on the device (the MVP decision), in the installed app's IndexedDB. Behind a small
 * interface so the logic is tested with the in-memory one; the browser specs use the real IndexedDB.
 */

export interface AnnotationStore {
  list(scoreKey: string): Promise<Annotation[]>;
  all(): Promise<Annotation[]>;
  put(annotation: Annotation): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'ots-perform';
const STORE = 'annotations';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const store = open.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('scoreKey', 'scoreKey');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

/** The device store. Asks the browser to keep it (navigator.storage.persist), once. */
export function indexedDbAnnotationStore(): AnnotationStore {
  let db: Promise<IDBDatabase> | null = null;
  const connect = () => {
    if (!db) {
      db = openDb();
      void navigator.storage?.persist?.().catch(() => {});
    }
    return db;
  };
  const tx = async (mode: IDBTransactionMode) =>
    (await connect()).transaction(STORE, mode).objectStore(STORE);
  return {
    list: async (scoreKey) =>
      request((await tx('readonly')).index('scoreKey').getAll(scoreKey)) as Promise<Annotation[]>,
    all: async () => request((await tx('readonly')).getAll()) as Promise<Annotation[]>,
    put: async (annotation) => {
      await request((await tx('readwrite')).put(annotation));
    },
    remove: async (id) => {
      await request((await tx('readwrite')).delete(id));
    },
  };
}

/** An in-memory store (tests, and a fallback where IndexedDB is unavailable). */
export function memoryAnnotationStore(initial: Annotation[] = []): AnnotationStore {
  const items = new Map(initial.map((annotation) => [annotation.id, annotation]));
  return {
    list: async (scoreKey) =>
      [...items.values()].filter((annotation) => annotation.scoreKey === scoreKey),
    all: async () => [...items.values()],
    put: async (annotation) => void items.set(annotation.id, annotation),
    remove: async (id) => void items.delete(id),
  };
}

/** The store for this browser: IndexedDB where there is one. */
export const deviceAnnotationStore = (): AnnotationStore =>
  typeof indexedDB === 'undefined' ? memoryAnnotationStore() : indexedDbAnnotationStore();
