import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  NewScoreDialog,
  NEW_SCORE_KEY_OPTIONS,
  NEW_SCORE_TIME_OPTIONS,
  type NewScoreDialogProps,
} from '../components/score-editor/NewScoreDialog';

const makeDetails = () => ({
  title: 'Untitled',
  composer: 'Anon',
  measures: 16,
  setTitle: vi.fn(),
  setComposer: vi.fn(),
  setMeasures: vi.fn(),
});

const makeSignature = () => ({
  keyFifths: 0,
  timeNumerator: 4,
  timeDenominator: 4,
  withPickup: false,
  pickupNumerator: 1,
  pickupDenominator: 4,
  setKeyFifths: vi.fn(),
  setTimeNumerator: vi.fn(),
  setTimeDenominator: vi.fn(),
  setWithPickup: vi.fn(),
  setPickupNumerator: vi.fn(),
  setPickupDenominator: vi.fn(),
});

const makeInstruments = () => ({
  selectedIds: ['piano'],
  options: [
    { id: 'piano', name: 'Piano', label: 'Piano (Keyboards)' },
    { id: 'violin', name: 'Violin', label: 'Violin (Strings)' },
  ],
  groups: [
    {
      id: 'keyboards',
      name: 'Keyboards',
      instruments: [{ id: 'piano', name: 'Piano' }],
    },
  ],
  common: [{ instrument: { id: 'violin', name: 'Violin' }, label: 'Violin' }],
  toAdd: 'violin',
  clefMapError: null as string | null,
  fallbackError: null as string | null,
  setToAdd: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
});

const props = (overrides: Partial<NewScoreDialogProps> = {}): NewScoreDialogProps => ({
  details: makeDetails(),
  signature: makeSignature(),
  instruments: makeInstruments(),
  actions: { create: vi.fn(), close: vi.fn() },
  ...overrides,
});

describe('NewScoreDialog', () => {
  it('offers the full key and time catalogues', () => {
    // The catalogues moved out of ScoreEditor with the dialog; losing an entry
    // would silently narrow what a user can create.
    expect(NEW_SCORE_KEY_OPTIONS).toHaveLength(15);
    expect(NEW_SCORE_TIME_OPTIONS).toHaveLength(10);
    expect(NEW_SCORE_KEY_OPTIONS.map((option) => option.fifths)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7,
    ]);
  });

  it('reports the details it was given', () => {
    render(<NewScoreDialog {...props()} />);

    expect(screen.getByPlaceholderText('Untitled score')).toHaveValue('Untitled');
    expect(screen.getByPlaceholderText('Composer')).toHaveValue('Anon');
  });

  it('routes title and composer edits to their own setters', () => {
    const details = makeDetails();

    render(<NewScoreDialog {...props({ details })} />);
    fireEvent.change(screen.getByPlaceholderText('Untitled score'), {
      target: { value: 'Nocturne' },
    });
    fireEvent.change(screen.getByPlaceholderText('Composer'), { target: { value: 'Chopin' } });

    expect(details.setTitle).toHaveBeenCalledWith('Nocturne');
    expect(details.setComposer).toHaveBeenCalledWith('Chopin');
  });

  it('hides the pickup fields until a pickup is requested', () => {
    const { rerender } = render(<NewScoreDialog {...props()} />);
    expect(screen.queryByTestId('new-score-pickup-numerator')).toBeNull();

    rerender(
      <NewScoreDialog
        {...props({
          signature: { ...makeSignature(), withPickup: true },
        })}
      />,
    );
    expect(screen.getByTestId('new-score-pickup-numerator')).toBeVisible();
    expect(screen.getByTestId('new-score-pickup-denominator')).toBeVisible();
  });

  it('toggles the pickup through its setter', () => {
    const signature = makeSignature();

    render(<NewScoreDialog {...props({ signature })} />);
    fireEvent.click(screen.getByTestId('new-score-pickup-checkbox'));

    expect(signature.setWithPickup).toHaveBeenCalledWith(true);
  });

  it('adds and removes instruments by position', () => {
    // remove() takes an index, not an id: duplicate instruments are legal, so the
    // index is what identifies the row.
    const instruments = {
      ...makeInstruments(),
      selectedIds: ['piano', 'violin', 'piano'],
    };

    render(<NewScoreDialog {...props({ instruments })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const rows = screen.getAllByRole('button', { name: 'Remove' });
    fireEvent.click(rows[2]);

    expect(instruments.add).toHaveBeenCalledTimes(1);
    expect(instruments.remove).toHaveBeenCalledWith(2);
  });

  it('will not add without a selection', () => {
    render(
      <NewScoreDialog
        {...props({
          instruments: { ...makeInstruments(), toAdd: '' },
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('reports a catalogue that failed to load', () => {
    render(
      <NewScoreDialog
        {...props({
          instruments: {
            ...makeInstruments(),
            clefMapError: 'clef map unavailable',
            fallbackError: 'fallback catalogue unavailable',
          },
        })}
      />,
    );

    expect(screen.getByText(/clef map unavailable/)).toBeVisible();
    expect(screen.getByText(/fallback catalogue unavailable/)).toBeVisible();
  });

  it('creates and cancels through the owner', () => {
    const actions = { create: vi.fn(), close: vi.fn() };

    render(<NewScoreDialog {...props({ actions })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create Score' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.close).toHaveBeenCalledTimes(1);
  });

  it('closes from the header without creating anything', () => {
    const actions = { create: vi.fn(), close: vi.fn() };

    render(<NewScoreDialog {...props({ actions })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(actions.close).toHaveBeenCalledTimes(1);
    expect(actions.create).not.toHaveBeenCalled();
  });
});
