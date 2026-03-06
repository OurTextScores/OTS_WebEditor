export type MmaGrooveOption = {
  value: string;
  label: string;
  description: string;
};

export type MmaGrooveOptionGroup = {
  id: string;
  label: string;
  options: MmaGrooveOption[];
};

export const MMA_GROOVE_OPTION_GROUPS: MmaGrooveOptionGroup[] = [
  {
    id: 'recommended',
    label: 'Recommended',
    options: [
      { value: 'Swing', label: 'Swing', description: 'Default swing accompaniment with comping, bass, and drums.' },
      { value: 'BossaNova', label: 'Bossa Nova', description: 'Light Latin groove that works well for many lead-sheet style scores.' },
      { value: 'Ballad', label: 'Ballad', description: 'Slow, neutral accompaniment with restrained rhythm section motion.' },
      { value: 'PianoBallad', label: 'Piano Ballad', description: 'Keyboard-centered accompaniment with a gentler texture.' },
      { value: 'SlowRock', label: 'Slow Rock', description: 'Steadier pop/rock backing for modern tonal material.' },
    ],
  },
  {
    id: 'classical-ish',
    label: 'Classical-ish',
    options: [
      { value: 'Waltz', label: 'Waltz', description: 'General triple-meter accompaniment; the safest classical-adjacent option.' },
      { value: 'ArpeggioWaltz', label: 'Arpeggio Waltz', description: 'Broken-chord waltz texture that can suit keyboard reductions.' },
      { value: 'Lullaby', label: 'Lullaby', description: 'Soft, slow accompaniment for lyrical or hymn-like material.' },
      { value: 'March1Slow', label: 'March1 Slow', description: 'Measured march texture for processional or stately music.' },
      { value: 'Serenade', label: 'Serenade', description: 'Light, courtly accompaniment texture from the Casio groove set.' },
    ],
  },
  {
    id: 'jazz',
    label: 'Jazz',
    options: [
      { value: 'SwingWalk', label: 'Swing Walk', description: 'Swing with walking bass instead of a simpler bass pattern.' },
      { value: 'JazzWaltz', label: 'Jazz Waltz', description: 'Triple-meter jazz accompaniment.' },
      { value: 'ModernJazz', label: 'Modern Jazz', description: 'A more contemporary jazz combo feel.' },
      { value: 'Foxtrot', label: 'Foxtrot', description: 'Classic standard-song rhythm that works for older popular repertoire.' },
      { value: 'FastJazzWaltz', label: 'Fast Jazz Waltz', description: 'Faster 3/4 jazz support for more active triple-meter pieces.' },
    ],
  },
  {
    id: 'pop-rock',
    label: 'Pop / Rock',
    options: [
      { value: 'Pop', label: 'Pop', description: 'Straight-ahead pop backing.' },
      { value: 'PopBallad', label: 'Pop Ballad', description: 'Slower pop accompaniment.' },
      { value: 'PopRock1', label: 'Pop Rock 1', description: 'Accessible rock-pop hybrid groove.' },
      { value: 'Rock1', label: 'Rock 1', description: 'Basic rock rhythm section.' },
      { value: 'ShuffleRock', label: 'Shuffle Rock', description: 'Swung rock pattern with more motion.' },
    ],
  },
  {
    id: 'latin-folk',
    label: 'Latin / Folk',
    options: [
      { value: 'BossaNova', label: 'Bossa Nova', description: 'Soft Brazilian-influenced groove.' },
      { value: 'LatinFusion', label: 'Latin Fusion', description: 'Busier Latin accompaniment with more motion.' },
      { value: 'CountryWaltz', label: 'Country Waltz', description: 'Triple-meter folk/country waltz backing.' },
      { value: 'FolkBallad', label: 'Folk Ballad', description: 'Gentle accompaniment for simple tonal melodies.' },
      { value: 'FrenchWaltz', label: 'French Waltz', description: 'More stylized waltz texture with a lighter feel.' },
    ],
  },
];

export const DEFAULT_MMA_GROOVE = 'Swing';

export const findMmaGrooveOption = (value: string) => {
  for (const group of MMA_GROOVE_OPTION_GROUPS) {
    const option = group.options.find((item) => item.value === value);
    if (option) {
      return option;
    }
  }
  return null;
};
