import { useState, useEffect } from 'react';
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

export function useToolbarOrder() {
    const [orderedIds, setOrderedIds] = useState<ToolbarSectionId[]>(DEFAULT_ORDER);
    const [snapConfig, setSnapConfig] = useState<Record<string, 'right' | undefined>>(DEFAULT_SNAP);
    const [dragSourceId, setDragSourceId] = useState<ToolbarSectionId | null>(null);
    const [dragTargetId, setDragTargetId] = useState<ToolbarSectionId | null>(null);

    useEffect(() => {
        const storedOrder = localStorage.getItem(STORAGE_KEY_ORDER);
        const storedSnap = localStorage.getItem(STORAGE_KEY_SNAP);

        if (storedOrder) {
            try {
                const parsed = JSON.parse(storedOrder) as ToolbarSectionId[];
                // Validate that all current IDs are present (in case of updates)
                const isValid = DEFAULT_ORDER.every(id => parsed.includes(id)) && parsed.every(id => DEFAULT_ORDER.includes(id));
                if (isValid) {
                    setOrderedIds(parsed);
                }
            } catch (e) {
                console.error('Failed to parse toolbar order', e);
            }
        }

        if (storedSnap) {
            try {
                setSnapConfig(JSON.parse(storedSnap));
            } catch (e) {
                console.error('Failed to parse toolbar snap config', e);
            }
        }
    }, []);

    const saveOrder = (newOrder: ToolbarSectionId[]) => {
        setOrderedIds(newOrder);
        localStorage.setItem(STORAGE_KEY_ORDER, JSON.stringify(newOrder));
    };

    const saveSnap = (newSnap: Record<string, 'right' | undefined>) => {
        setSnapConfig(newSnap);
        localStorage.setItem(STORAGE_KEY_SNAP, JSON.stringify(newSnap));
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
