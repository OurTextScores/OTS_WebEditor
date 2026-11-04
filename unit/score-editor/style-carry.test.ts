import { describe, expect, it, vi } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';
import {
  captureStyleForReload,
  musicXmlDefaults,
  restoreCarriedStyle,
} from '../../components/score-editor/style-carry';

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
});
