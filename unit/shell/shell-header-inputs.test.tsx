import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EditorCommandProps } from '../../components/score-editor/editorProps';
import { useEditorCommands } from '../../components/score-editor/useEditorCommands';
import { ShellHeader } from '../../components/shell/ShellHeader';
import { openFilePicker, registerFilePicker } from '../../components/shell/filePickers';
import { resetShellUiForTests } from '../../components/shell/shellStore';
import { defaultCommandRegistry, runCommand } from '../../lib/commands';
import { CommandRegistry } from '../../lib/commands/registry';
import { defineCommand } from '../../lib/commands/types';

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  resetShellUiForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe('ShellHeader', () => {
  it('carries the transport and the hidden file inputs', () => {
    render(<ShellHeader title="T" dirty={false} registry={new CommandRegistry()} />);
    expect(screen.getByRole('group', { name: 'Playback' })).toBeInTheDocument();
    expect(screen.getByTestId('open-score-input')).toHaveAttribute('type', 'file');
    expect(screen.getByTestId('soundfont-input')).toHaveAttribute('accept', '.sf2,.sf3');
  });

  it('runs File ▸ Open with the file chosen in the input', () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register('global', [defineCommand<File>({ id: 'file.open', label: 'Open', run })]);
    render(<ShellHeader title="T" dirty={false} registry={registry} />);
    const file = new File(['x'], 'a.mscz');
    fireEvent.change(screen.getByTestId('open-score-input'), { target: { files: [file] } });
    expect(run).toHaveBeenCalledWith(expect.anything(), file);
  });

  it('does nothing when the picker is dismissed', () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register('global', [defineCommand<File>({ id: 'file.open', label: 'Open', run })]);
    render(<ShellHeader title="T" dirty={false} registry={registry} />);
    fireEvent.change(screen.getByTestId('open-score-input'), { target: { files: [] } });
    expect(run).not.toHaveBeenCalled();
  });

  it('sends a soundfont to its own command', () => {
    const registry = new CommandRegistry();
    const run = vi.fn();
    registry.register('global', [
      defineCommand<File>({ id: 'playback.soundfont', label: 'Load SoundFont', run }),
    ]);
    render(<ShellHeader title="T" dirty={false} registry={registry} />);
    const file = new File(['x'], 'a.sf2');
    fireEvent.change(screen.getByTestId('soundfont-input'), { target: { files: [file] } });
    expect(run).toHaveBeenCalledWith(expect.anything(), file);
  });

  it('registers its pickers while mounted, so File ▸ Open clicks the input', () => {
    const view = render(<ShellHeader title="T" dirty={false} registry={new CommandRegistry()} />);
    const click = vi.spyOn(screen.getByTestId('open-score-input'), 'click');
    expect(openFilePicker('score')).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    view.unmount();
    expect(openFilePicker('score')).toBe(false);
  });
});

/** Stands in for ScoreEditor, which registers the editor's commands. */
function EditorCommands(props: EditorCommandProps) {
  useEditorCommands(props);
  return null;
}

describe('file.open with the header’s input', () => {
  it('opens the shell’s input instead of making its own', async () => {
    const onFileUpload = vi.fn();
    render(
      <EditorCommands
        onFileUpload={onFileUpload}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );
    const open = vi.fn();
    const remove = registerFilePicker('score', open);
    await runCommand('file.open');
    expect(open).toHaveBeenCalledOnce();
    expect(onFileUpload).not.toHaveBeenCalled();
    remove();
  });

  it('still takes a file argument directly', async () => {
    const onFileUpload = vi.fn();
    render(
      <EditorCommands
        onFileUpload={onFileUpload}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        zoomLevel={1}
      />,
    );
    const file = new File(['x'], 'a.mscz');
    await act(async () => {
      await runCommand('file.open', file);
    });
    expect(onFileUpload).toHaveBeenCalledWith(file);
    expect(defaultCommandRegistry.has('file.open')).toBe(true);
  });
});
