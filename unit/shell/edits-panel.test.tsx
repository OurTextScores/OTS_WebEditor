// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAnnouncement } from '../../components/shell/announcer/announcerStore';
import { EditsPanel, type EditsPanelProps } from '../../components/shell/EditsPanel';

afterEach(cleanup);

const entries = [
  { id: 1, description: 'Raise pitch' },
  { id: 2, description: 'Add dynamic' },
  { id: 3, description: 'Add slur' },
];

function setup(over: Partial<EditsPanelProps> = {}) {
  const props: EditsPanelProps = {
    entries,
    index: 3,
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onJump: vi.fn(),
    ...over,
  };
  render(<EditsPanel {...props} />);
  return props;
}

const labels = () =>
  within(screen.getByRole('list', { name: /newest first/i }))
    .getAllByRole('button')
    .map((button) => button.textContent);

describe('EditsPanel', () => {
  it('lists the edits newest first, ending in the loaded score, and marks the current one', () => {
    setup();
    expect(labels()).toEqual(['Add slur', 'Add dynamic', 'Raise pitch', 'Original']);
    expect(screen.getByTestId('edit-row-3')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('edit-row-2')).not.toHaveAttribute('aria-current');
  });

  it('dims what Redo would bring back, and marks Original when everything is undone', () => {
    setup({ index: 1, canRedo: true });
    expect(screen.getByTestId('edit-row-1')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('edit-row-3').className).toContain('text-slate-500');
    expect(screen.getByTestId('edit-row-2').className).toContain('text-slate-500');
    expect(screen.getByTestId('edit-row-0').className).toContain('text-slate-700');
    cleanup();
    setup({ index: 0, canUndo: false, canRedo: true });
    expect(screen.getByTestId('edit-row-0')).toHaveAttribute('aria-current', 'step');
  });

  it('jumps to a row and says where it went, forward or back; the current row does nothing', async () => {
    const props = setup({ index: 2, canRedo: true });
    const user = userEvent.setup();
    await user.click(screen.getByTestId('edit-row-1'));
    expect(props.onJump).toHaveBeenLastCalledWith(1);
    expect(getAnnouncement().text).toBe('Back to: Raise pitch');
    await user.click(screen.getByTestId('edit-row-3'));
    expect(props.onJump).toHaveBeenLastCalledWith(3);
    expect(getAnnouncement().text).toBe('Forward to: Add slur');
    await user.click(screen.getByTestId('edit-row-0'));
    expect(props.onJump).toHaveBeenLastCalledWith(0);
    expect(getAnnouncement().text).toBe('Back to: Original');
    (props.onJump as ReturnType<typeof vi.fn>).mockClear();
    await user.click(screen.getByTestId('edit-row-2'));
    expect(props.onJump).not.toHaveBeenCalled();
  });

  it('moves between rows with the arrow keys and jumps with Enter', async () => {
    const props = setup();
    const user = userEvent.setup();
    screen.getByTestId('edit-row-3').focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('edit-row-2')).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(screen.getByTestId('edit-row-0')).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(screen.getByTestId('edit-row-1')).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(props.onJump).toHaveBeenLastCalledWith(1);
  });

  it('has Undo and Redo buttons that follow what is possible', async () => {
    const props = setup({ canUndo: true, canRedo: false });
    const user = userEvent.setup();
    expect(screen.getByTestId('edits-redo')).toBeDisabled();
    await user.click(screen.getByTestId('edits-undo'));
    expect(props.onUndo).toHaveBeenCalledOnce();
    cleanup();
    setup({ canUndo: false, canRedo: true });
    expect(screen.getByTestId('edits-undo')).toBeDisabled();
  });

  it('says there are no edits yet, without the list', () => {
    setup({ entries: [], index: 0, canUndo: false });
    expect(screen.getByTestId('edits-empty')).toHaveTextContent('No edits yet.');
    expect(screen.queryByRole('list')).toBeNull();
  });
});
