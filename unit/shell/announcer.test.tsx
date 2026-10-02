// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Announcer } from '../../components/shell/announcer';
import {
  announce,
  getAnnouncement,
  resetAnnouncements,
} from '../../components/shell/announcer/announcerStore';
import {
  SELECTION_CLEARED,
  describeEdit,
  describeSelection,
  humanizeElementType,
} from '../../components/shell/announcer/selectionAnnouncement';
import {
  SELECTION_ANNOUNCE_DELAY_MS,
  useSelectionAnnouncer,
} from '../../components/shell/announcer/useSelectionAnnouncer';
import { CommandRegistry, DEFAULT_COMMAND_CONTEXT } from '../../lib/commands/registry';
import type { CommandContext } from '../../lib/commands/types';

beforeEach(() => {
  resetAnnouncements();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('wording', () => {
  it('humanizes engine element names', () => {
    expect(humanizeElementType('Note')).toBe('note');
    expect(humanizeElementType('LayoutBreak')).toBe('layout break');
    expect(humanizeElementType('TIME_SIG')).toBe('time sig');
  });

  it('describes one element, several, and none', () => {
    expect(describeSelection({ elementType: 'Hairpin', selectionCount: 1 })).toBe(
      'Hairpin selected.',
    );
    expect(describeSelection({ elementType: 'Note', selectionCount: 4 })).toBe(
      '4 elements selected.',
    );
    expect(describeSelection(null)).toBeNull();
    expect(describeSelection({ elementType: 'Note', selectionCount: 0 })).toBeNull();
  });

  it('turns a mutation label into a sentence', () => {
    expect(describeEdit('raise pitch')).toBe('Raise pitch.');
    expect(describeEdit('transpose 2 semitones')).toBe('Transpose 2 semitones.');
  });
});

describe('store', () => {
  it('ignores an empty message', () => {
    announce('   ');
    expect(getAnnouncement().text).toBe('');
  });

  it('gives the same message twice a new id, so it is read twice', () => {
    announce('Raise pitch.');
    const first = getAnnouncement().id;
    announce('Raise pitch.');
    expect(getAnnouncement().id).toBeGreaterThan(first);
  });
});

describe('useSelectionAnnouncer', () => {
  const note = { elementType: 'Note', selectionCount: 1 };

  it('says nothing for the initial empty selection', () => {
    vi.useFakeTimers();
    renderHook(() => useSelectionAnnouncer(null));
    act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS * 2));
    expect(getAnnouncement().text).toBe('');
  });

  it('announces a selection after it settles, once', () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ value }) => useSelectionAnnouncer(value), {
      initialProps: { value: null as typeof note | null },
    });
    rerender({ value: note });
    expect(getAnnouncement().text).toBe('');
    act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS));
    expect(getAnnouncement().text).toBe('Note selected.');
    const id = getAnnouncement().id;
    rerender({ value: { ...note } }); // a new object for the same selection
    act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS * 2));
    expect(getAnnouncement().id).toBe(id);
  });

  it('says one thing for a quick run of selections', () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ value }) => useSelectionAnnouncer(value), {
      initialProps: { value: null as typeof note | null },
    });
    for (const count of [1, 2, 3]) {
      rerender({ value: { elementType: 'Note', selectionCount: count } });
      act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS / 5));
    }
    act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS));
    expect(getAnnouncement().text).toBe('3 elements selected.');
  });

  it('announces clearing only after something was selected', () => {
    vi.useFakeTimers();
    const { rerender } = renderHook(({ value }) => useSelectionAnnouncer(value), {
      initialProps: { value: note as typeof note | null },
    });
    act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS));
    rerender({ value: null });
    act(() => void vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS));
    expect(getAnnouncement().text).toBe(SELECTION_CLEARED);
  });
});

describe('Announcer', () => {
  function registryFor(mode: CommandContext['mode']) {
    const registry = new CommandRegistry();
    let context: CommandContext = { ...DEFAULT_COMMAND_CONTEXT, mode };
    registry.setContextSource(() => context);
    return {
      registry,
      setMode(next: CommandContext['mode']) {
        context = { ...context, mode: next };
        registry.invalidate();
      },
    };
  }

  it('renders the latest message in a polite live region', () => {
    const { registry } = registryFor('write');
    render(<Announcer registry={registry} />);
    const region = screen.getByTestId('announcer');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('');
    act(() => announce('Note selected.'));
    expect(region.textContent).toBe('Note selected.');
  });

  it('announces a mode switch, but not the mode it starts in', () => {
    const { registry, setMode } = registryFor('write');
    render(<Announcer registry={registry} />);
    expect(screen.getByTestId('announcer').textContent).toBe('');
    act(() => setMode('compare'));
    expect(screen.getByTestId('announcer').textContent).toBe('Compare mode.');
    act(() => setMode('host-compare'));
    expect(screen.getByTestId('announcer').textContent).toBe('Compare mode.'); // no label: silent
  });
});
