import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorCommandProps } from '../../components/score-editor/editorProps';
import { useEditorCommands } from '../../components/score-editor/useEditorCommands';
import { defaultCommandRegistry, runCommand } from '../../lib/commands';

const base = { onFileUpload: () => {}, onZoomIn: () => {}, onZoomOut: () => {}, zoomLevel: 1 };

/** Stands in for ScoreEditor: the one place that hands the editor's handlers to the commands. */
function Editor(props: EditorCommandProps) {
  useEditorCommands(props);
  return null;
}

describe('useEditorCommands', () => {
  it('registers on mount and clears on unmount', () => {
    const view = render(<Editor {...base} />);
    expect(defaultCommandRegistry.has('file.export.pdf')).toBe(true);
    expect(defaultCommandRegistry.has('add.clef')).toBe(true);
    view.unmount();
    expect(defaultCommandRegistry.ids()).toEqual([]);
  });

  it('runs the editor handler, with the editor context', async () => {
    const onExportPdf = vi.fn();
    const onUndo = vi.fn();
    render(
      <Editor
        {...base}
        exportsEnabled
        mutationsEnabled
        onExportPdf={onExportPdf}
        onUndo={onUndo}
      />,
    );
    await expect(runCommand('file.export.pdf')).resolves.toBe('ran');
    await expect(runCommand('edit.undo')).resolves.toBe('ran');
    expect(onExportPdf).toHaveBeenCalledOnce();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('follows the props as they change, without re-registering', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = render(<Editor {...base} exportsEnabled onExportSvg={first} />);
    const version = defaultCommandRegistry.contextVersion;
    view.rerender(<Editor {...base} exportsEnabled onExportSvg={second} />);
    await runCommand('file.export.svg');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    // Same context, same ids: nothing for subscribers to re-evaluate.
    expect(defaultCommandRegistry.contextVersion).toBe(version);
  });

  it('re-evaluates enabled when the editor state changes', async () => {
    const onAddSlur = vi.fn();
    const view = render(<Editor {...base} mutationsEnabled onAddSlur={onAddSlur} />);
    await expect(runCommand('add.line.slur')).resolves.toBe('disabled');
    view.rerender(<Editor {...base} mutationsEnabled selectionActive onAddSlur={onAddSlur} />);
    await expect(runCommand('add.line.slur')).resolves.toBe('ran');
    expect(onAddSlur).toHaveBeenCalledOnce();
  });

  it('opens the transpose dialog through the editor-supplied opener', async () => {
    const onOpenTransposeDialog = vi.fn();
    render(
      <Editor
        {...base}
        mutationsEnabled
        onTransposeEx={vi.fn()}
        onOpenTransposeDialog={onOpenTransposeDialog}
      />,
    );
    await runCommand('tools.transpose');
    expect(onOpenTransposeDialog).toHaveBeenCalledOnce();
  });

  it('exposes the registry to Playwright in non-production builds', async () => {
    const onZoomIn = vi.fn();
    render(<Editor {...base} onZoomIn={onZoomIn} />);
    expect(window.__otsCommands?.list().map((entry) => entry.id)).toContain('view.zoom.in');
    await window.__otsCommands?.run('view.zoom.in');
    expect(onZoomIn).toHaveBeenCalledOnce();
  });
});
