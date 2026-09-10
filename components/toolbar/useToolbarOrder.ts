import { useState, useSyncExternalStore } from 'react';
import { ToolbarSectionId } from './types';

const DEFAULT_ORDER: ToolbarSectionId[] = [
  'file',
  'view',
  'playback',
  'tempo',
  'measures',
  'signatures',
  'score',
  'notes',
  'expression',
  'edit',
  'layout',
  'pitch',
  'duration',
  'help',
];

const DEFAULT_SNAP: Record<string, 'right' | undefined> = {
  view: 'right',
  help: 'right',
};

const STORAGE_KEY_ORDER = 'ots-toolbar-section-order';
const STORAGE_KEY_SNAP = 'ots-toolbar-snap-config';

type ToolbarSnapConfig = Record<string, 'right' | undefined>;

type ToolbarLayoutSnapshot = {
  orderedIds: ToolbarSectionId[];
  snapConfig: ToolbarSnapConfig;
};

const DEFAULT_SNAPSHOT: ToolbarLayoutSnapshot = {
  orderedIds: DEFAULT_ORDER,
  snapConfig: DEFAULT_SNAP,
};

let cachedOrderValue: string | null | undefined;
let cachedSnapValue: string | null | undefined;
let cachedSnapshot = DEFAULT_SNAPSHOT;
const toolbarStorageListeners = new Set<() => void>();

const parseStoredOrder = (value: string | null): ToolbarSectionId[] => {
  if (!value) return DEFAULT_ORDER;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return DEFAULT_ORDER;
    const isValid =
      DEFAULT_ORDER.every((id) => parsed.includes(id)) &&
      parsed.every(
        (id) => typeof id === 'string' && DEFAULT_ORDER.includes(id as ToolbarSectionId),
      );
    return isValid ? (parsed as ToolbarSectionId[]) : DEFAULT_ORDER;
  } catch (error) {
    console.error('Failed to parse toolbar order', error);
    return DEFAULT_ORDER;
  }
};

const parseStoredSnap = (value: string | null): ToolbarSnapConfig => {
  if (!value) return DEFAULT_SNAP;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_SNAP;
    const entries = Object.entries(parsed);
    const isValid = entries.every(
      ([id, snap]) => DEFAULT_ORDER.includes(id as ToolbarSectionId) && snap === 'right',
    );
    return isValid ? (Object.fromEntries(entries) as ToolbarSnapConfig) : DEFAULT_SNAP;
  } catch (error) {
    console.error('Failed to parse toolbar snap config', error);
    return DEFAULT_SNAP;
  }
};

const readToolbarLayoutSnapshot = (): ToolbarLayoutSnapshot => {
  const storedOrder = localStorage.getItem(STORAGE_KEY_ORDER);
  const storedSnap = localStorage.getItem(STORAGE_KEY_SNAP);
  if (storedOrder === cachedOrderValue && storedSnap === cachedSnapValue) {
    return cachedSnapshot;
  }
  cachedOrderValue = storedOrder;
  cachedSnapValue = storedSnap;
  cachedSnapshot = {
    orderedIds: parseStoredOrder(storedOrder),
    snapConfig: parseStoredSnap(storedSnap),
  };
  return cachedSnapshot;
};

const subscribeToToolbarStorage = (listener: () => void) => {
  toolbarStorageListeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY_ORDER || event.key === STORAGE_KEY_SNAP || event.key === null) {
      listener();
    }
  };
  window.addEventListener('storage', handleStorage);
  return () => {
    toolbarStorageListeners.delete(listener);
    window.removeEventListener('storage', handleStorage);
  };
};

const notifyToolbarStorageListeners = () => {
  toolbarStorageListeners.forEach((listener) => listener());
};

const writeStoredOrder = (newOrder: ToolbarSectionId[]) => {
  localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(newOrder));
  notifyToolbarStorageListeners();
};

const writeStoredSnap = (newSnap: ToolbarSnapConfig) => {
  localStorage.setItem(STORAGE_KEY_SNAP, JSON.stringify(newSnap));
  notifyToolbarStorageListeners();
};

export function useToolbarOrder() {
  const { orderedIds, snapConfig } = useSyncExternalStore(
    subscribeToToolbarStorage,
    readToolbarLayoutSnapshot,
    () => DEFAULT_SNAPSHOT,
  );
  const [dragSourceId, setDragSourceId] = useState<ToolbarSectionId | null>(null);
  const [dragTargetId, setDragTargetId] = useState<ToolbarSectionId | null>(null);

  const saveOrder = (newOrder: ToolbarSectionId[]) => {
    writeStoredOrder(newOrder);
  };

  const saveSnap = (newSnap: ToolbarSnapConfig) => {
    writeStoredSnap(newSnap);
  };

  const handleDragStart = (id: ToolbarSectionId) => {
    setDragSourceId(id);
  };

  const handleDragOver = (e: React.DragEvent, id: ToolbarSectionId) => {
    e.preventDefault();
    if (dragSourceId && dragSourceId !== id) {
      setDragTargetId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: ToolbarSectionId) => {
    e.preventDefault();
    if (!dragSourceId || dragSourceId === targetId) return;

    const newOrder = [...orderedIds];
    const sourceIndex = newOrder.indexOf(dragSourceId);
    const targetIndex = newOrder.indexOf(targetId);

    newOrder.splice(sourceIndex, 1);
    newOrder.splice(targetIndex, 0, dragSourceId);

    saveOrder(newOrder);
    setDragSourceId(null);
    setDragTargetId(null);
  };

  const handleDragEnd = () => {
    setDragSourceId(null);
    setDragTargetId(null);
  };

  const toggleSnap = (id: ToolbarSectionId) => {
    const newSnap = { ...snapConfig };
    if (newSnap[id] === 'right') {
      delete newSnap[id];
    } else {
      newSnap[id] = 'right';
    }
    saveSnap(newSnap);
  };

  const resetOrder = () => {
    saveOrder(DEFAULT_ORDER);
    saveSnap(DEFAULT_SNAP);
  };

  return {
    orderedIds,
    snapConfig,
    dragSourceId,
    dragTargetId,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
    toggleSnap,
    resetOrder,
  };
}
