import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useToolbarOrder } from '../components/toolbar/useToolbarOrder';
import type { ToolbarSectionId } from '../components/toolbar/types';

const DEFAULT_ORDER: ToolbarSectionId[] = [
  'file',
  'view',
  'playback',
  'tempo',
  'measures',
  'signatures',
  'score',
  'notes',
  'expression',
  'edit',
  'layout',
  'pitch',
  'duration',
  'help',
];

describe('useToolbarOrder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores a valid toolbar layout from storage', () => {
    const reversedOrder = [...DEFAULT_ORDER].reverse();
    localStorage.setItem('ots-toolbar-section-order', JSON.stringify(reversedOrder));
    localStorage.setItem(
      'ots-toolbar-snap-config',
      JSON.stringify({ file: 'right', help: 'right' }),
    );

    const { result } = renderHook(() => useToolbarOrder());

    expect(result.current.orderedIds).toEqual(reversedOrder);
    expect(result.current.snapConfig).toEqual({ file: 'right', help: 'right' });
  });

  it('rejects incomplete orders and unsupported snap values', () => {
    localStorage.setItem('ots-toolbar-section-order', JSON.stringify(['file']));
    localStorage.setItem('ots-toolbar-snap-config', JSON.stringify({ view: 'left' }));

    const { result } = renderHook(() => useToolbarOrder());

    expect(result.current.orderedIds).toEqual(DEFAULT_ORDER);
    expect(result.current.snapConfig).toEqual({ view: 'right', help: 'right' });
  });

  it('updates every mounted consumer and persists snap changes', () => {
    const first = renderHook(() => useToolbarOrder());
    const second = renderHook(() => useToolbarOrder());

    act(() => first.result.current.toggleSnap('tempo'));

    expect(first.result.current.snapConfig.tempo).toBe('right');
    expect(second.result.current.snapConfig.tempo).toBe('right');
    expect(JSON.parse(localStorage.getItem('ots-toolbar-snap-config') || '{}')).toMatchObject({
      tempo: 'right',
    });

    act(() => first.result.current.toggleSnap('view'));

    expect(first.result.current.snapConfig.view).toBeUndefined();
    expect(second.result.current.snapConfig.view).toBeUndefined();
  });

  it('resets persisted order and snap configuration together', () => {
    localStorage.setItem('ots-toolbar-section-order', JSON.stringify([...DEFAULT_ORDER].reverse()));
    localStorage.setItem('ots-toolbar-snap-config', JSON.stringify({ file: 'right' }));
    const { result } = renderHook(() => useToolbarOrder());

    act(() => result.current.resetOrder());

    expect(result.current.orderedIds).toEqual(DEFAULT_ORDER);
    expect(result.current.snapConfig).toEqual({ view: 'right', help: 'right' });
  });
});
