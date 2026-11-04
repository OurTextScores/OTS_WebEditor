import { describe, expect, it, vi } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';
import {
  captureForReload,
  captureStyleForReload,
  mapSystemLocks,
  measurePositionMap,
  musicXmlDefaults,
  reloadLossNotice,
  restoreCarriedStyle,
  restoreForReload,
} from '../../components/score-editor/reload-carry';

const xml = (defaults: string, body = '<part id="P1"/>') =>
  `<?xml version="1.0"?><score-partwise>${defaults}<part-list/>${body}</score-partwise>`;
const DEFAULTS =
  '<defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults>';
const style = new Uint8Array([1, 2, 3]);

describe('style carried across a MusicXML re-import (roadmap E23)', () => {
  it('compares <defaults> ignoring whitespace', () => {
    expect(musicXmlDefaults(xml(DEFAULTS))).toBe(
      musicXmlDefaults(xml(DEFAULTS.replace('><', '>\n  <'))),
    );
    expect(musicXmlDefaults(xml(''))).toBe('');
  });

  it('saves the live style when the edit leaves <defaults> alone, whatever else changed', async () => {
    const score = { saveStyle: vi.fn(async () => style) } as unknown as Score;
    await expect(
      captureStyleForReload(score, xml(DEFAULTS), xml(DEFAULTS, '<part id="P1"><measure/></part>')),
    ).resolves.toBe(style);
  });

  it('does not carry it when the edit changed the page layout in <defaults>', async () => {
    const score = { saveStyle: vi.fn(async () => style) } as unknown as Score;
    const changed = DEFAULTS.replace(
      '<millimeters>7</millimeters>',
      '<millimeters>6</millimeters>',
    );
    await expect(captureStyleForReload(score, xml(DEFAULTS), xml(changed))).resolves.toBeNull();
    expect(score.saveStyle).not.toHaveBeenCalled();
  });

  it('does nothing on an engine without the style exports', async () => {
    const score = {} as Score;
    await expect(captureStyleForReload(score, xml(DEFAULTS), xml(DEFAULTS))).resolves.toBeNull();
    await expect(restoreCarriedStyle(score, style)).resolves.toBe(false);
  });

  it('puts the captured style back, and a failure only warns', async () => {
    const restoreStyle = vi.fn(async () => true);
    await expect(restoreCarriedStyle({ restoreStyle } as unknown as Score, style)).resolves.toBe(
      true,
    );
    expect(restoreStyle).toHaveBeenCalledWith(style);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = {
      restoreStyle: vi.fn(async () => {
        throw new Error('bad style');
      }),
    } as unknown as Score;
    await expect(restoreCarriedStyle(failing, style)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  describe('system locks', () => {
    const measures = (...bodies: string[]) =>
      xml(
        DEFAULTS,
        `<part id="P1">${bodies.map((b, i) => `<measure number="${i + 1}">${b}</measure>`).join('')}</part>`,
      );

    it('maps measures by content: a changed measure pairs with its new version, an insertion shifts the rest', () => {
      const changed = measurePositionMap(
        measures('<a/>', '<b/>', '<c/>'),
        measures('<a/>', '<b2/>', '<c/>', '<d/>'),
      );
      expect([0, 1, 2].map(changed)).toEqual([0, 1, 2]);
      const inserted = measurePositionMap(
        measures('<a/>', '<b/>', '<c/>'),
        measures('<x/>', '<a/>', '<b/>', '<c/>'),
      );
      expect([0, 1, 2].map(inserted)).toEqual([1, 2, 3]);
      const removed = measurePositionMap(
        measures('<a/>', '<b/>', '<c/>'),
        measures('<a/>', '<c/>'),
      );
      expect([0, 1, 2].map(removed)).toEqual([0, null, 1]);
    });

    it('keeps a lock on its measures, shrinks it past removed ends, and drops it when none remain', () => {
      const map = (p: number) =>
        (({ 0: 0, 1: null, 2: 1, 3: 2 }) as Record<number, number | null>)[p] ?? null;
      expect(
        mapSystemLocks(
          [
            { startMeasure: 2, endMeasure: 3 },
            { startMeasure: 0, endMeasure: 1 },
            { startMeasure: 1, endMeasure: 1 },
          ],
          map,
        ),
      ).toEqual({
        kept: [
          { startMeasure: 1, endMeasure: 2 },
          { startMeasure: 0, endMeasure: 0 },
        ],
        dropped: [{ startMeasure: 1, endMeasure: 1 }],
      });
    });

    it('captures style, mapped locks and omissions, and restores style then locks', async () => {
      const current = measures('<a/>', '<b/>', '<c/>');
      const next = measures('<a/>', '<c/>');
      const score = {
        saveStyle: vi.fn(async () => style),
        getSystemLockState: vi.fn(async () => ({
          locks: [
            { startMeasure: 2, endMeasure: 2 },
            { startMeasure: 1, endMeasure: 1 },
          ],
        })),
        saveMsc: vi.fn(async () => new TextEncoder().encode('<museScore/>')),
        restoreStyle: vi.fn(async () => true),
        restoreSystemLocks: vi.fn(async () => 1),
      } as unknown as Score;
      const carry = await captureForReload(score, current, next);
      expect(carry).toEqual({
        style,
        systemLocks: [{ startMeasure: 1, endMeasure: 1 }],
        droppedLocks: [{ startMeasure: 1, endMeasure: 1 }],
        omissions: [],
      });
      await restoreForReload(score, carry);
      expect(score.restoreStyle).toHaveBeenCalledWith(style);
      expect(score.restoreSystemLocks).toHaveBeenCalledWith([{ startMeasure: 1, endMeasure: 1 }]);
      expect(reloadLossNotice(carry)).toBe(
        '1 system lock was removed with the measures the edit deleted.',
      );
      expect(reloadLossNotice({ ...carry, droppedLocks: [] })).toBeNull();
    });
  });
});
