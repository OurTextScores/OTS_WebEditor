'use client';

import React, { useState } from 'react';
import { Button } from '../../ui/Button';
import { EraseScopeDialog, UnplacedTray } from './AnnotateDialogs';
import { COLORS, type AnnotationTool } from './annotationTools';
import { StampPalette } from './StampPalette';
import { MarksHistoryPanel } from './MarksHistoryPanel';
import type { useAnnotateMode } from './useAnnotateMode';

type AnnotateMode = ReturnType<typeof useAnnotateMode>;

const TOOLS: { tool: AnnotationTool; label: string }[] = [
  { tool: 'pen', label: 'Pen' },
  { tool: 'highlighter', label: 'Highlighter' },
  { tool: 'eraser', label: 'Eraser' },
  { tool: 'text', label: 'Text' },
  { tool: 'stamp', label: 'Stamp' },
];

/** The words of a text annotation, typed where it was tapped; Enter adds it, Escape or leaving cancels. */
function TextEntry({ mode }: { mode: AnnotateMode }) {
  const [text, setText] = useState('');
  const entry = mode.textEntry;
  if (!entry) return null;
  return (
    <input
      aria-label="Text"
      data-testid="annotate-text-input"
      autoFocus
      className="fixed z-20 h-8 w-48 rounded border border-slate-400 bg-white px-2 text-sm text-slate-800 shadow-sm"
      style={{ left: entry.clientX, top: entry.clientY }}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => mode.setTextEntry(null)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && text.trim()) {
          entry.place(text.trim());
          mode.setTextEntry(null);
        } else if (event.key === 'Escape') {
          mode.setTextEntry(null);
        }
      }}
    />
  );
}

/**
 * The annotation tools, shown at the top while annotating: tool, stamp, colour, draw with finger, undo/redo, Done;
 * and the text box for a text annotation. Pedals still turn pages while annotating; taps draw instead of turning.
 */
export function AnnotateTools({ mode, onDone }: { mode: AnnotateMode; onDone: () => void }) {
  return (
    <>
      <div
        data-testid="annotate-tools"
        data-performer-controls
        role="toolbar"
        aria-label="Annotation tools"
        className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 text-sm text-slate-800 shadow-sm"
        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
      >
        {TOOLS.map((item) => (
          <Button
            key={item.tool}
            type="button"
            size="sm"
            variant={mode.tool === item.tool ? 'primary' : 'outline'}
            aria-pressed={mode.tool === item.tool}
            data-testid={`annotate-${item.tool}`}
            onClick={() => mode.setTool(item.tool)}
          >
            {item.label}
          </Button>
        ))}
        <span className="flex items-center gap-1" role="radiogroup" aria-label="Colour">
          {COLORS.map((swatch) => (
            <Button
              key={swatch}
              type="button"
              size="sm"
              variant="quiet"
              role="radio"
              aria-checked={mode.color === swatch}
              aria-label={`Colour ${swatch}`}
              data-testid={`annotate-color-${swatch}`}
              className="h-6 w-6 rounded-full border-2 p-0"
              style={{
                background: swatch,
                borderColor: mode.color === swatch ? 'currentColor' : 'transparent',
              }}
              onClick={() => mode.setColor(swatch)}
            />
          ))}
        </span>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={mode.drawWithFinger}
            onChange={(event) => mode.setDrawWithFinger(event.target.checked)}
          />
          Draw with finger
        </label>
        <Button
          type="button"
          size="sm"
          disabled={!mode.canUndo}
          data-testid="annotate-undo"
          onClick={mode.undo}
        >
          Undo
        </Button>
        <Button type="button" size="sm" disabled={!mode.canRedo} onClick={mode.redo}>
          Redo
        </Button>
        <MarksHistoryPanel
          history={mode.history}
          onUndo={mode.undo}
          onRedo={mode.redo}
          onJump={mode.jump}
        />
        <UnplacedTray mode={mode} />
        <Button
          type="button"
          size="sm"
          variant="primary"
          data-testid="annotate-done"
          onClick={onDone}
        >
          Done
        </Button>
      </div>
      {mode.tool === 'stamp' && <StampPalette stamp={mode.stamp} onStamp={mode.setStamp} />}
      <EraseScopeDialog mode={mode} />
      <TextEntry
        key={mode.textEntry ? `${mode.textEntry.clientX},${mode.textEntry.clientY}` : 'none'}
        mode={mode}
      />
    </>
  );
}
