import { describe, expect, it } from 'vitest';
import { dynamicCandidates, matchDynamic } from '../../components/score-editor/dynamic-entry';

describe('typing a dynamic (roadmap E11)', () => {
  it('matches the dynamic named exactly, ignoring case and spaces', () => {
    expect(matchDynamic('mf')?.value).toBe(8);
    expect(matchDynamic(' SFZ ')?.value).toBe(18);
    expect(matchDynamic('p')?.value).toBe(6);
    expect(matchDynamic('f')?.value).toBe(9);
  });

  it('takes the first dynamic that starts with the letters, in the toolbar order, and nothing for no match', () => {
    expect(matchDynamic('pp')?.label).toBe('pp');
    expect(matchDynamic('sfp')?.label).toBe('sfp');
    expect(matchDynamic('rf')?.label).toBe('rf');
    expect(matchDynamic('x')).toBeNull();
    expect(matchDynamic('')).toBeNull();
  });

  it('lists the candidates for what has been typed', () => {
    expect(dynamicCandidates('sf').map((option) => option.label)).toEqual([
      'sf',
      'sfz',
      'sff',
      'sffz',
      'sfp',
      'sfpp',
    ]);
    expect(dynamicCandidates('').length).toBeGreaterThan(20);
  });
});
