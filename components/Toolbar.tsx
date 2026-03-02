import React, { useState } from 'react';
import { Button } from './ui/Button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/Collapsible';
import { ToolbarSectionId, ToolbarSectionProps } from './toolbar/types';
import { useToolbarOrder } from './toolbar/useToolbarOrder';
import { ToolbarSection } from './toolbar/ToolbarSection';
import { FileSection } from './toolbar/sections/FileSection';
import { ViewSection } from './toolbar/sections/ViewSection';
import { PlaybackSection } from './toolbar/sections/PlaybackSection';
import { TempoSection } from './toolbar/sections/TempoSection';
import { MeasuresSection } from './toolbar/sections/MeasuresSection';
import { SignaturesSection } from './toolbar/sections/SignaturesSection';
import { ScoreSection } from './toolbar/sections/ScoreSection';
import { NotesSection } from './toolbar/sections/NotesSection';
import { ExpressionSection } from './toolbar/sections/ExpressionSection';
import { EditSection } from './toolbar/sections/EditSection';
import { LayoutSection } from './toolbar/sections/LayoutSection';
import { PitchSection } from './toolbar/sections/PitchSection';
import { DurationSection } from './toolbar/sections/DurationSection';
import { HelpSection } from './toolbar/sections/HelpSection';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

export type MeasureInsertTarget = 'beginning' | 'after-selection' | 'end';
export type HeaderTextTarget = 'title' | 'subtitle' | 'composer' | 'lyricist';
export type HeaderEditorPoint = { clientX: number; clientY: number };

interface InstrumentTemplate {
    id: string;
    name: string;
    groupId?: string;
    groupName?: string;
    familyId?: string;
    familyName?: string;
    staffCount?: number;
    isExtended?: boolean;
}

interface InstrumentTemplateGroup {
    id: string;
    name: string;
    instruments: InstrumentTemplate[];
}

interface PartSummary {
    index: number;
    name: string;
    instrumentName: string;
    instrumentId: string;
    isVisible: boolean;
}

export interface ToolbarProps extends ToolbarSectionProps {}

const SECTION_COMPONENTS: Record<ToolbarSectionId, { label: string; bgColor: string; Component: React.FC<ToolbarSectionProps> }> = {
    file: { label: 'File', bgColor: 'bg-blue-50/40', Component: FileSection },
    view: { label: 'View', bgColor: 'bg-slate-50/50', Component: ViewSection },
    playback: { label: 'Playback', bgColor: 'bg-green-50/40', Component: PlaybackSection },
    tempo: { label: 'Tempo', bgColor: 'bg-purple-50/40', Component: TempoSection },
    measures: { label: 'Bars', bgColor: 'bg-amber-50/40', Component: MeasuresSection },
    signatures: { label: 'Signatures', bgColor: 'bg-indigo-50/40', Component: SignaturesSection },
    score: { label: 'Score', bgColor: 'bg-rose-50/40', Component: ScoreSection },
    notes: { label: 'Notes', bgColor: 'bg-teal-50/40', Component: NotesSection },
    expression: { label: 'Expression', bgColor: 'bg-cyan-50/40', Component: ExpressionSection },
    edit: { label: 'Edit', bgColor: 'bg-red-50/40', Component: EditSection },
    layout: { label: 'Layout', bgColor: 'bg-lime-50/40', Component: LayoutSection },
    pitch: { label: 'Pitch', bgColor: 'bg-sky-50/40', Component: PitchSection },
    duration: { label: 'Duration', bgColor: 'bg-violet-50/40', Component: DurationSection },
    help: { label: 'Help', bgColor: 'bg-slate-50/60', Component: HelpSection },
};

export const Toolbar: React.FC<ToolbarProps> = (props) => {
    const [toolbarCollapsed, setToolbarCollapsed] = useState(
        () => typeof window !== 'undefined' && window.innerWidth < 1024,
    );

    const {
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
    } = useToolbarOrder();

    return (
        <Collapsible
            open={!toolbarCollapsed}
            onOpenChange={(open) => setToolbarCollapsed(!open)}
        >
            <div
                className="relative flex flex-col gap-0 overflow-visible border-b border-slate-200 bg-white shadow-sm"
                style={{ zIndex: 100 }}
            >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-blue-50 via-slate-50 to-blue-50 px-3 py-1">
                    <div className="flex items-center gap-1.5">
                        <div className="h-4 w-0.5 rounded-full bg-blue-600"></div>
                        <span className="text-xs font-bold tracking-wide text-slate-800">
                            Score Tools
                        </span>
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={resetOrder}
                            className="ml-2 h-6 px-1.5 text-[10px] text-slate-500 hover:text-blue-600"
                            title="Reset Toolbar Layout"
                        >
                            <RotateCcw size={10} className="mr-1" />
                            Reset Layout
                        </Button>
                    </div>
                    <CollapsibleTrigger asChild>
                        <Button
                            aria-expanded={!toolbarCollapsed}
                            aria-controls="toolbar-content"
                            variant="ghost"
                            size="sm"
                            className="text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                            {toolbarCollapsed ? (
                                <><ChevronDown size={14} className="mr-1" /> Show Tools</>
                            ) : (
                                <><ChevronUp size={14} className="mr-1" /> Hide Tools</>
                            )}
                        </Button>
                    </CollapsibleTrigger>
                </div>
                <CollapsibleContent
                    id="toolbar-content"
                    className="flex flex-wrap items-start gap-x-1.5 gap-y-0.5 px-1.5 py-0.5 bg-gradient-to-b from-slate-50 to-white"
                >
                    {orderedIds.map((id) => {
                        const section = SECTION_COMPONENTS[id];
                        if (!section) return null;
                        return (
                            <ToolbarSection
                                key={id}
                                id={id}
                                label={section.label}
                                bgColor={section.bgColor}
                                isRightSnapped={snapConfig[id] === 'right'}
                                isDragging={dragSourceId === id}
                                isDropTarget={dragTargetId === id}
                                onDragStart={handleDragStart}
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onDragEnd={handleDragEnd}
                                onToggleSnap={toggleSnap}
                            >
                                <section.Component {...props} />
                            </ToolbarSection>
                        );
                    })}
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
};
