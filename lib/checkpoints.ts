export type CheckpointRecord = {
    id?: number;
    title: string;
    createdAt: number;
    format: 'musicxml';
    data: ArrayBuffer;
    size: number;
};

export type CheckpointSummary = {
    id: number;
    title: string;
    createdAt: number;
    format: 'musicxml';
    size: number;
};

const DB_NAME = 'ots-web';
const DB_VERSION = 1;
const STORE_NAME = 'checkpoints';

export const isIndexedDbAvailable = () => typeof indexedDB !== 'undefined';

const openDb = () => new Promise<IDBDatabase>((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
        reject(new Error('IndexedDB is not available in this environment.'));
        return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('createdAt', 'createdAt');
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
});

export const saveCheckpoint = async (record: CheckpointRecord): Promise<number> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.add(record);
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error ?? new Error('Failed to save checkpoint.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
    });
};

export const listCheckpoints = async (): Promise<CheckpointSummary[]> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
            const items = (request.result as CheckpointRecord[]).filter(Boolean);
            const summaries = items.map(item => ({
                id: item.id as number,
                title: item.title,
                createdAt: item.createdAt,
                format: item.format,
                size: item.size,
            }));
            summaries.sort((a, b) => b.createdAt - a.createdAt);
            resolve(summaries);
        };
        request.onerror = () => reject(request.error ?? new Error('Failed to read checkpoints.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
    });
};

export const getCheckpoint = async (id: number): Promise<CheckpointRecord | null> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve((request.result as CheckpointRecord) ?? null);
        request.onerror = () => reject(request.error ?? new Error('Failed to load checkpoint.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
    });
};

export const deleteCheckpoint = async (id: number): Promise<void> => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? new Error('Failed to delete checkpoint.'));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
    });
};
