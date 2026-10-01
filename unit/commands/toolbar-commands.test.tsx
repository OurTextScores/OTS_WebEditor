import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Toolbar } from '../../components/Toolbar';
import { defaultCommandRegistry, runCommand } from '../../lib/commands';

const base = { onFileUpload: () => {}, onZoomIn: () => {}, onZoomOut: () => {}, zoomLevel: 1 };

describe('Toolbar registers the ribbon as commands', () => {
  it('registers on mount and clears on unmount', () => {
    const view = render(<Toolbar {...base} />);
    expect(defaultCommandRegistry.has('file.export.pdf')).toBe(true);
    expect(defaultCommandRegistry.has('add.clef')).toBe(true);
    view.unmount();
    expect(defaultCommandRegistry.ids()).toEqual([]);
  });

  it('runs the same handler as the ribbon button, with the editor context', async () => {
    const onExportPdf = vi.fn();
    const onUndo = vi.fn();
    render(
      <Toolbar
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
    const view = render(<Toolbar {...base} exportsEnabled onExportSvg={first} />);
    const version = defaultCommandRegistry.contextVersion;
    view.rerender(<Toolbar {...base} exportsEnabled onExportSvg={second} />);
    await runCommand('file.export.svg');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    // Same context, same ids: nothing for subscribers to re-evaluate.
    expect(defaultCommandRegistry.contextVersion).toBe(version);
  });

  it('re-evaluates enabled when the editor state changes', async () => {
    const onAddSlur = vi.fn();
    const view = render(<Toolbar {...base} mutationsEnabled onAddSlur={onAddSlur} />);
    await expect(runCommand('add.line.slur')).resolves.toBe('disabled');
    view.rerender(<Toolbar {...base} mutationsEnabled selectionActive onAddSlur={onAddSlur} />);
    await expect(runCommand('add.line.slur')).resolves.toBe('ran');
    expect(onAddSlur).toHaveBeenCalledOnce();
  });

  it('opens the transpose dialog the ribbon button opens', async () => {
    render(<Toolbar {...base} mutationsEnabled onTransposeEx={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await act(async () => {
      await runCommand('tools.transpose');
    });
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens the transpose dialog from the ribbon button as before', async () => {
    render(<Toolbar {...base} mutationsEnabled onTransposeEx={vi.fn()} />);
    act(() => screen.getByTestId('btn-transpose-dialog').click());
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('exposes the registry to Playwright in non-production builds', async () => {
    const onZoomIn = vi.fn();
    render(<Toolbar {...base} onZoomIn={onZoomIn} />);
    expect(window.__otsCommands?.list().map((entry) => entry.id)).toContain('view.zoom.in');
    await window.__otsCommands?.run('view.zoom.in');
    expect(onZoomIn).toHaveBeenCalledOnce();
  });
});
