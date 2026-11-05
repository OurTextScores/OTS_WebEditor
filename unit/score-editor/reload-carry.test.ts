import { describe, expect, it, vi } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';
import {
  captureForReload,
  captureStyleForReload,
  instrumentMap,
  mapSystemLocks,
  measurePositionMap,
  musicXmlDefaults,
  musicXmlInstrumentNames,
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
        parts: [],
        droppedParts: [],
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

  describe('parts (roadmap E18)', () => {
    const partList = (...names: string[]) =>
      `<?xml version="1.0"?><score-partwise><part-list>${names
        .map((name, i) => `<score-part id="P${i + 1}"><part-name>${name}</part-name></score-part>`)
        .join('')}</part-list></score-partwise>`;

    it("reads the instruments' names and maps them by name: in place, else the first unused match, else nowhere", () => {
      expect(musicXmlInstrumentNames(partList('Violin', 'Cello'))).toEqual(['Violin', 'Cello']);
      // A Viola inserted before the Cello; the Flute removed; two Violins keep their order.
      const map = instrumentMap(
        ['Violin', 'Violin', 'Flute', 'Cello'],
        ['Violin', 'Violin', 'Viola', 'Cello'],
      );
      expect([0, 1, 2, 3].map(map)).toEqual([0, 1, null, 3]);
      const moved = instrumentMap(['Flute', 'Cello'], ['Cello', 'Oboe', 'Flute']);
      expect([0, 1].map(moved)).toEqual([2, 0]);
    });

    it('captures each part with its own style, re-creates them, and reports a part with no instrument left', async () => {
      const styles = [new Uint8Array([10]), new Uint8Array([11]), new Uint8Array([12])];
      let shown = -1;
      const score = {
        saveStyle: vi.fn(async () => (shown < 0 ? style : styles[shown])),
        listExcerpts: vi.fn(async () => [
          { name: 'Flute', instruments: ['Flute'], partIndices: [0] },
          { name: 'Cello', instruments: ['Cello'], partIndices: [1] },
          { name: 'Duo', instruments: ['Flute', 'Cello'], partIndices: [0, 1] },
        ]),
        setExcerptId: vi.fn(async (id: number) => {
          shown = id;
        }),
        restoreExcerpts: vi.fn(async (parts: unknown[]) => parts.length),
        restoreStyle: vi.fn(async () => true),
      } as unknown as Score;
      // The edit drops the Flute and adds an Oboe before the Cello.
      const carry = await captureForReload(
        score,
        partList('Flute', 'Cello'),
        partList('Oboe', 'Cello'),
      );
      expect(carry.parts).toEqual([
        { name: 'Cello', parts: [1], style: styles[1] },
        { name: 'Duo', parts: [1], style: styles[2] },
      ]);
      expect(carry.droppedParts).toEqual(['Flute']);
      expect(shown).toBe(-1);

      vi.mocked(score.restoreStyle!).mockClear();
      await restoreForReload(score, carry);
      expect(score.restoreExcerpts).toHaveBeenCalledWith([
        { name: 'Cello', parts: [1] },
        { name: 'Duo', parts: [1] },
      ]);
      // The full score's style, then each part's, with that part shown; the full score shown after.
      expect(vi.mocked(score.restoreStyle!).mock.calls.map(([data]) => data)).toEqual([
        style,
        styles[1],
        styles[2],
      ]);
      expect(
        vi
          .mocked(score.setExcerptId!)
          .mock.calls.slice(-3)
          .map(([id]) => id),
      ).toEqual([0, 1, -1]);
      expect(reloadLossNotice(carry)).toBe(
        'The edited score has none of the instruments of the part “Flute”, so it was removed.',
      );
    });

    it('puts no part styles back when not every part came back, and leaves a score without parts alone', async () => {
      const score = {
        setExcerptId: vi.fn(async () => {}),
        restoreExcerpts: vi.fn(async () => 1),
        restoreStyle: vi.fn(async () => true),
      } as unknown as Score;
      await restoreForReload(score, {
        style: null,
        systemLocks: [],
        droppedLocks: [],
        parts: [
          { name: 'A', parts: [0], style },
          { name: 'B', parts: [1], style },
        ],
        omissions: [],
      });
      expect(score.restoreStyle).not.toHaveBeenCalled();
      expect(score.setExcerptId).toHaveBeenLastCalledWith(-1);

      const plain = {
        listExcerpts: vi.fn(async () => []),
        setExcerptId: vi.fn(),
        restoreExcerpts: vi.fn(),
      };
      const carry = await captureForReload(plain as unknown as Score, partList('A'), partList('A'));
      expect(carry.parts).toEqual([]);
      expect(plain.setExcerptId).not.toHaveBeenCalled();
    });
  });
});
