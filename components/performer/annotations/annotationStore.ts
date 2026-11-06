import type { Annotation } from './annotationModel';
import { indexedDbTable, memoryTable, type Table } from '../platform/performDb';

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

/** The device store (IndexedDB `ots-perform`, store `annotations`, by scoreKey). */
export function indexedDbAnnotationStore(): AnnotationStore {
  return storeOver(indexedDbTable<Annotation>('annotations'));
}

/** An in-memory store (tests, and a fallback where IndexedDB is unavailable). */
export function memoryAnnotationStore(initial: Annotation[] = []): AnnotationStore {
  return storeOver(memoryTable<Annotation>((annotation) => annotation.id, initial));
}

function storeOver(table: Table<Annotation>): AnnotationStore {
  return {
    list: (scoreKey) => table.where('scoreKey', scoreKey),
    all: () => table.all(),
    put: (annotation) => table.put(annotation),
    remove: (id) => table.remove(id),
  };
}

/** The store for this browser: IndexedDB where there is one. */
export const deviceAnnotationStore = (): AnnotationStore =>
  typeof indexedDB === 'undefined' ? memoryAnnotationStore() : indexedDbAnnotationStore();
