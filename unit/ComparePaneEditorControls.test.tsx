import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComparePaneEditorControls } from '../components/score-editor/ComparePaneEditorControls';

describe('ComparePaneEditorControls', () => {
  it('exposes the minimal pane editing controls and routes actions', async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onZoomOut = vi.fn();
    const onZoomIn = vi.fn();
    const onAddBar = vi.fn();
    const onToggleNoteInput = vi.fn();
    const onOpenPalettes = vi.fn();

    const { rerender } = render(
      <ComparePaneEditorControls
        side="right"
        active
        busy={false}
        noteInputActive
        zoom={0.75}
        onActivate={onActivate}
        onZoomOut={onZoomOut}
        onZoomIn={onZoomIn}
        onAddBar={onAddBar}
        onToggleNoteInput={onToggleNoteInput}
        onOpenPalettes={onOpenPalettes}
      />,
    );

    expect(screen.getByTestId('compare-editor-controls-right')).toHaveTextContent('75%');
    expect(screen.getByTestId('btn-compare-activate-right')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveTextContent('Stop input');
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveAccessibleName(
      'Disable note input for right compare score',
    );

    await user.click(screen.getByTestId('btn-compare-activate-right'));
    await user.click(screen.getByTestId('btn-compare-zoom-out-right'));
    await user.click(screen.getByTestId('btn-compare-zoom-in-right'));
    await user.click(screen.getByTestId('btn-compare-add-bar-right'));
    await user.click(screen.getByTestId('btn-compare-note-input-right'));
    await user.click(screen.getByTestId('btn-compare-palettes-right'));

    expect(onActivate).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onAddBar).toHaveBeenCalledOnce();
    expect(onToggleNoteInput).toHaveBeenCalledOnce();
    expect(onOpenPalettes).toHaveBeenCalledOnce();

    rerender(
      <ComparePaneEditorControls
        side="right"
        active={false}
        busy={false}
        noteInputActive
        zoom={0.75}
        onActivate={onActivate}
        onZoomOut={onZoomOut}
        onZoomIn={onZoomIn}
        onAddBar={onAddBar}
        onToggleNoteInput={onToggleNoteInput}
        onOpenPalettes={onOpenPalettes}
      />,
    );
    expect(screen.getByTestId('btn-compare-activate-right')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    rerender(
      <ComparePaneEditorControls
        side="right"
        active={false}
        busy={false}
        noteInputActive={false}
        zoom={0.75}
        onActivate={onActivate}
        onZoomOut={onZoomOut}
        onZoomIn={onZoomIn}
        onAddBar={onAddBar}
        onToggleNoteInput={onToggleNoteInput}
        onOpenPalettes={onOpenPalettes}
      />,
    );
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveTextContent('Note input');
    expect(screen.getByTestId('btn-compare-note-input-right')).toHaveAccessibleName(
      'Enable note input for right compare score',
    );
  });
});
