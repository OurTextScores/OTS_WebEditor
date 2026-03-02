import React from 'react';
import { ToolbarSectionId } from './types';
import { toolbarSectionInnerClass, toolbarSectionLabelClass } from './constants';
import { GripVertical } from 'lucide-react';
import { cn } from '../../lib/ui';

interface ToolbarSectionWrapperProps {
    id: ToolbarSectionId;
    label: string;
    bgColor: string;
    isRightSnapped?: boolean;
    isDragging?: boolean;
    isDropTarget?: boolean;
    onDragStart: (id: ToolbarSectionId) => void;
    onDragOver: (e: React.DragEvent, id: ToolbarSectionId) => void;
    onDrop: (e: React.DragEvent, id: ToolbarSectionId) => void;
    onDragEnd: () => void;
    onToggleSnap: (id: ToolbarSectionId) => void;
    children: React.ReactNode;
}

export const ToolbarSection: React.FC<ToolbarSectionWrapperProps> = ({
    id,
    label,
    bgColor,
    isRightSnapped,
    isDragging,
    isDropTarget,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onToggleSnap,
    children,
}) => {
    return (
        <div
            draggable
            onDragStart={() => onDragStart(id)}
            onDragOver={(e) => onDragOver(e, id)}
            onDrop={(e) => onDrop(e, id)}
            onDragEnd={onDragEnd}
            className={cn(
                'group relative transition-all duration-200',
                isRightSnapped ? 'ml-auto' : '',
                isDragging ? 'opacity-40' : 'opacity-100',
                isDropTarget ? 'ring-2 ring-blue-400' : ''
            )}
        >
            <div className={cn(toolbarSectionInnerClass, bgColor)}>
                <div
                    className={toolbarSectionLabelClass}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        onToggleSnap(id);
                    }}
                    title="Drag to reorder. Right-click to snap right."
                >
                    <GripVertical size={10} className="mr-0.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                    {label}
                </div>
                <div className="h-3 w-px bg-slate-200/60 mx-0.5"></div>
                {children}
            </div>
        </div>
    );
};
