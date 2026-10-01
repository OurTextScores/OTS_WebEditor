import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readDockState,
  useWorkspaceDock,
  type DockOptions,
} from '../../components/shell/useWorkspaceDock';

beforeEach(() => window.localStorage.clear());

const setup = (over: Partial<DockOptions> = {}) => {
  const setFloatingOpen = vi.fn();
  const setCategory = vi.fn();
  const options: DockOptions = {
    enabled: true,
    compareView: false,
    floatingOpen: false,
    setFloatingOpen,
    setCategory,
    ...over,
  };
  const hook = renderHook((props: DockOptions) => useWorkspaceDock(props), {
    initialProps: options,
  });
  return { ...hook, setFloatingOpen, setCategory, options };
};

describe('useWorkspaceDock', () => {
  it('starts open on Palettes, docked', () => {
    const { result } = setup();
    expect(result.current).toMatchObject({
      open: true,
      tab: 'palettes',
      poppedOut: false,
      palettesDocked: true,
    });
    expect(result.current.isShowing('palettes')).toBe(true);
    expect(result.current.isShowing('properties')).toBe(false);
  });

  it('shows a tab, and toggles: the same tab closes the dock, another switches', () => {
    const { result } = setup();
    act(() => result.current.show('instruments'));
    expect(result.current).toMatchObject({ open: true, tab: 'instruments' });
    act(() => result.current.toggle('instruments'));
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle('properties'));
    expect(result.current).toMatchObject({ open: true, tab: 'properties' });
    act(() => result.current.toggle('palettes'));
    expect(result.current).toMatchObject({ open: true, tab: 'palettes' });
  });

  it('reports nothing as showing when the shell is off', () => {
    const { result } = setup({ enabled: false });
    expect(result.current.isShowing('palettes')).toBe(false);
    expect(result.current.palettesDocked).toBe(false);
  });

  describe('palettes follow their form', () => {
    it('toggles the dock tab when docked, clearing the category', () => {
      const { result, setCategory, setFloatingOpen } = setup();
      act(() => result.current.togglePalettes());
      expect(result.current.open).toBe(false);
      expect(setCategory).toHaveBeenCalledWith(null);
      expect(setFloatingOpen).not.toHaveBeenCalled();
      act(() => result.current.togglePalettes());
      expect(result.current).toMatchObject({ open: true, tab: 'palettes' });
    });

    it('toggles the floating overlay when the shell is off or in compare', () => {
      for (const over of [{ enabled: false }, { compareView: true }]) {
        const { result, setFloatingOpen } = setup(over);
        act(() => result.current.togglePalettes());
        expect(setFloatingOpen).toHaveBeenCalledOnce();
        const updater = setFloatingOpen.mock.calls[0][0] as (open: boolean) => boolean;
        expect(updater(false)).toBe(true);
        expect(updater(true)).toBe(false);
      }
    });

    it('opens a category in whichever form is current', () => {
      const docked = setup();
      act(() => docked.result.current.openPalette('Clefs'));
      expect(docked.setCategory).toHaveBeenCalledWith('Clefs');
      expect(docked.result.current).toMatchObject({ open: true, tab: 'palettes' });

      const floating = setup({ enabled: false });
      act(() => floating.result.current.openPalette('Clefs'));
      expect(floating.setFloatingOpen).toHaveBeenCalledWith(true);
    });

    it('reports palettes visible from the dock tab, or from the overlay when floating', () => {
      expect(setup().result.current.palettesVisible).toBe(true);
      expect(setup({ enabled: false, floatingOpen: true }).result.current.palettesVisible).toBe(
        true,
      );
      expect(setup({ enabled: false, floatingOpen: false }).result.current.palettesVisible).toBe(
        false,
      );
    });
  });

  describe('pop out and dock', () => {
    it('pops out: opens the overlay and closes the dock tab it came from', () => {
      const { result, setFloatingOpen } = setup();
      act(() => result.current.setPoppedOut(true));
      expect(result.current).toMatchObject({ poppedOut: true, open: false, palettesDocked: false });
      expect(setFloatingOpen).toHaveBeenLastCalledWith(true);
    });

    it('leaves the dock open when popping out from another tab', () => {
      const { result } = setup();
      act(() => result.current.show('properties'));
      act(() => result.current.setPoppedOut(true));
      expect(result.current).toMatchObject({ poppedOut: true, open: true, tab: 'properties' });
    });

    it('docks back: closes the overlay and shows the palettes tab', () => {
      const { result, setFloatingOpen } = setup();
      act(() => result.current.setPoppedOut(true));
      act(() => result.current.setPoppedOut(false));
      expect(result.current).toMatchObject({ poppedOut: false, open: true, tab: 'palettes' });
      expect(setFloatingOpen).toHaveBeenLastCalledWith(false);
    });

    it('while popped out, palettes visible follows the overlay', () => {
      const { result, rerender, options } = setup();
      act(() => result.current.setPoppedOut(true));
      rerender({ ...options, floatingOpen: true });
      expect(result.current.palettesVisible).toBe(true);
    });
  });

  describe('persistence', () => {
    it('remembers the layout across mounts', () => {
      const first = setup();
      act(() => first.result.current.show('instruments'));
      act(() => first.result.current.setPoppedOut(true));
      first.unmount();
      expect(setup().result.current).toMatchObject({ tab: 'instruments', poppedOut: true });
    });

    it('survives corrupt, partial or blocked storage', () => {
      window.localStorage.setItem('ots.shell.dock', '{not json');
      expect(readDockState()).toEqual({ open: true, tab: 'palettes', poppedOut: false });
      window.localStorage.setItem(
        'ots.shell.dock',
        JSON.stringify({ open: false, tab: 'nonsense' }),
      );
      expect(readDockState()).toEqual({ open: false, tab: 'palettes', poppedOut: false });
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(readDockState().tab).toBe('palettes');
      vi.restoreAllMocks();
    });
  });
});
