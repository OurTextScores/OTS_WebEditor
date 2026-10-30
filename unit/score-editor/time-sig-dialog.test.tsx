import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  closeScoreDialog,
  openScoreDialog,
  ScoreDialog,
  type DialogEngine,
} from '../../components/score-editor/score-dialogs';

const DEFAULTS = { eighth: '1000', sixteenth: '10001000', thirtySecond: '1000100010001000' };

function engine() {
  return {
    getTimeSigProperties: vi.fn(async () => ({
      type: 'normal' as const,
      numerator: 2,
      denominator: 4,
      numeratorText: '',
      denominatorText: '',
      showCourtesy: true,
      groups: DEFAULTS,
      defaultGroups: DEFAULTS,
    })),
    setTimeSigProperties: vi.fn(async () => true),
  } as unknown as DialogEngine & { setTimeSigProperties: ReturnType<typeof vi.fn> };
}

afterEach(() => act(() => closeScoreDialog()));

describe('Time Signature Properties beam groups', () => {
  it('toggles a gap between two eighths into a new beam, and applies the edited row', async () => {
    const e = engine();
    const onApply = vi.fn(async (_kind: string, apply: () => Promise<boolean>) => apply());
    render(<ScoreDialog engine={e} onApply={onApply} />);
    act(() => openScoreDialog('timeSigProperties'));

    const gap = await screen.findByTestId('score-dialog-eighth-2');
    expect(gap).toHaveAttribute('data-state', '0');
    fireEvent.click(gap);
    expect(gap).toHaveAttribute('data-state', '1');
    // The eighth row has only two states: a second click joins the notes again, then a third breaks them.
    fireEvent.click(gap);
    expect(gap).toHaveAttribute('data-state', '0');
    fireEvent.click(gap);

    // The sixteenth row also offers a sub-beam break.
    const sixteenthGap = screen.getByTestId('score-dialog-sixteenth-1');
    fireEvent.click(sixteenthGap);
    fireEvent.click(sixteenthGap);
    expect(sixteenthGap).toHaveAttribute('data-state', '2');

    fireEvent.click(screen.getByTestId('score-dialog-submit'));
    await waitFor(() =>
      expect(e.setTimeSigProperties).toHaveBeenCalledWith(
        expect.objectContaining({ groups: { eighth: '1010', sixteenth: '12001000', thirtySecond: DEFAULTS.thirtySecond } }),
      ),
    );
  });
});
