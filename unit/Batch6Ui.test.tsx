import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FretboardEditor } from '../components/FretboardEditor';
import { FloatingPalettes } from '../components/FloatingPalettes';

describe('Batch 6 UI', () => {
  it('edits fretboard dimensions, markers, and dots', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const data = {
      strings: 6,
      frets: 4,
      fretOffset: 0,
      showNut: true,
      dots: [],
      markers: [],
      barres: [],
    };
    const { rerender } = render(<FretboardEditor data={data} onChange={onChange} />);

    await user.click(screen.getByTestId('fretboard-cell-2-3'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dots: [{ string: 2, fret: 3, type: 0 }] }),
    );

    await user.click(screen.getByTestId('fretboard-marker-0'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ markers: [{ string: 0, type: 1 }] }),
    );

    rerender(
      <FretboardEditor data={{ ...data, markers: [{ string: 2, type: 1 }] }} onChange={onChange} />,
    );
    await user.click(screen.getByTestId('fretboard-cell-2-3'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dots: [{ string: 2, fret: 3, type: 0 }],
        markers: [],
      }),
    );

    rerender(
      <FretboardEditor
        data={{ ...data, dots: [{ string: 0, fret: 2, type: 0 }] }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId('fretboard-marker-0'));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dots: [], markers: [{ string: 0, type: 1 }] }),
    );

    rerender(<FretboardEditor data={{ ...data, strings: 5 }} onChange={onChange} />);
    expect(screen.getAllByTitle('Cycle open, muted, and unmarked')).toHaveLength(5);
  });

  it('searches and click-applies items from the floating palettes', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<FloatingPalettes onApply={onApply} onClose={() => {}} dragEnabled />);

    expect(screen.getByTestId('palette-category-clefs')).toBeInTheDocument();
    expect(screen.getByTestId('palette-category-dynamics')).toBeInTheDocument();
    await user.type(screen.getByTestId('palette-search'), 'staccato');
    expect(screen.queryByTestId('palette-category-clefs')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('palette-item-articulation-0'));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'Staccato', elementType: 2 }),
    );

    const transfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.dragStart(screen.getByTestId('palette-item-articulation-0'), {
      dataTransfer: transfer,
    });
    expect(transfer.setData).toHaveBeenCalledWith(
      'application/x-ots-score-palette+json',
      expect.any(String),
    );
  });
});
