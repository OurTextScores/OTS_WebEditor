import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { loadSmuflCodes, loadSpecialCharacters, SpecialCharactersPicker, symbolLabel } from '../../components/score-editor/rich-text';


describe('special characters, from MuseScore’s dialog (E17)', () => {
  it('has MuseScore’s common symbols and characters, SMuFL categories and Unicode ranges', async () => {
    const characters = await loadSpecialCharacters();
    const codes = await loadSmuflCodes();
    expect(characters.common).toEqual(expect.arrayContaining([{ s: 'dynamicForte' }, { s: 'segno' }, { c: 0xe9 }]));
    expect(characters.smufl.length).toBeGreaterThan(100);
    expect(characters.unicode[0]).toMatchObject({ label: 'Basic Latin', first: 0x20 });
    expect(codes.dynamicForte).toBe(0xe522);
    expect(symbolLabel('dynamicForte')).toBe('dynamic forte');
  });

  it('opens, loads, and inserts a symbol or a character', async () => {
    const onOpen = vi.fn();
    const onInsert = vi.fn();
    render(<SpecialCharactersPicker onOpen={onOpen} onInsert={onInsert} />);
    await userEvent.setup().click(screen.getByTestId('rich-text-special'));
    expect(onOpen).toHaveBeenCalled();
    const forte = await screen.findByTestId('special-sym-dynamicForte');
    fireEvent.click(forte);
    expect(onInsert).toHaveBeenLastCalledWith({ s: 'dynamicForte' }, expect.objectContaining({ dynamicForte: 0xe522 }));
    fireEvent.click(screen.getByTestId('special-char-233'));
    expect(onInsert).toHaveBeenLastCalledWith({ c: 0xe9 }, expect.anything());
  });

  it('finds symbols by name across every category', async () => {
    render(<SpecialCharactersPicker onOpen={vi.fn()} onInsert={vi.fn()} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('rich-text-special'));
    await screen.findByTestId('special-sym-dynamicForte');
    await user.click(screen.getByRole('tab', { name: 'Musical symbols' }));
    await user.type(screen.getByTestId('special-smufl-search'), 'coda');
    await waitFor(() => expect(screen.getByTestId('special-sym-coda')).toBeInTheDocument());
    expect(screen.queryByTestId('special-sym-accidentalFlat')).toBeNull();
  });
});
