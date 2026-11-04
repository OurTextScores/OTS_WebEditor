import { describe, expect, it, vi } from 'vitest';
import type { Score } from '../../lib/webmscore-loader';
import {
  findMusicXmlOmissions,
  omissionsLossNotice,
  omissionsPromptSection,
  readMusicXmlOmissions,
} from '../../components/score-editor/musicxml-omissions';

// MSCX as the engine writes these (scripts/musicxml-preservation-probe.mjs cases).
const MSCX = `<museScore><Score>
<SystemLocks><systemLock><startMeasure>a</startMeasure><endMeasure>a</endMeasure></systemLock>
<systemLock><startMeasure>b</startMeasure><endMeasure>c</endMeasure></systemLock></SystemLocks>
<StaffText><swing unit="eighth" ratio="66"/><text>Swing</text></StaffText>
<HarpPedalDiagram>
  <isDiagram>0</isDiagram><pedalState/></HarpPedalDiagram>
<HarpPedalDiagram><isDiagram>1</isDiagram></HarpPedalDiagram>
<Accidental><subtype>accidentalSharp</subtype><bracket>3</bracket></Accidental>
<Accidental><subtype>accidentalFlat</subtype><bracket>2</bracket></Accidental>
<Accidental><subtype>accidentalNatural</subtype></Accidental><Fingering><bracket>3</bracket></Fingering>
</Score></museScore>`;

describe('what the MusicXML leaves out (roadmap E23)', () => {
  it('finds system locks, swing ratios, text harp pedals and braced accidentals, and nothing else', () => {
    expect(findMusicXmlOmissions(MSCX)).toEqual([
      { kind: 'systemLock', count: 2 },
      { kind: 'swing', count: 1 },
      { kind: 'harpPedalText', count: 1 },
      { kind: 'accidentalBraces', count: 1 },
    ]);
    expect(findMusicXmlOmissions('<museScore><Score><Note/></Score></museScore>')).toEqual([]);
  });

  it('tells the AI about Style always, and lists what an applied edit resets', () => {
    const plain = omissionsPromptSection([]);
    expect(plain).toMatch(/Style settings .* are not in the MusicXML\. They are kept/);
    expect(plain).not.toMatch(/applied edit resets/);
    const section = omissionsPromptSection(findMusicXmlOmissions(MSCX));
    expect(section).toContain('- 2 system locks (measures kept together on a system)');
    expect(section).toContain('- 1 swing setting with a ratio (MusicXML has only the word)');
  });

  it('tells the user what an applied edit reset, and how to get it back', () => {
    expect(omissionsLossNotice([])).toBeNull();
    expect(omissionsLossNotice([{ kind: 'accidentalBraces', count: 3 }])).toBe(
      'MusicXML cannot hold these, so the applied edit reset them: 3 accidentals in braces. Restore the checkpoint taken before the edit to get them back.',
    );
  });

  it('reads the live score through the engine queue, and finds nothing when it cannot', async () => {
    const saveMsc = vi.fn(async () => new TextEncoder().encode(MSCX));
    const run = vi.fn((operation: () => Promise<unknown>) => operation());
    await expect(
      readMusicXmlOmissions({ saveMsc } as unknown as Score, run as never),
    ).resolves.toHaveLength(4);
    expect(saveMsc).toHaveBeenCalledWith('mscx');
    expect(run).toHaveBeenCalledWith(expect.any(Function), 'saveMsc(omissions)');
    await expect(readMusicXmlOmissions(null)).resolves.toEqual([]);
  });
});
