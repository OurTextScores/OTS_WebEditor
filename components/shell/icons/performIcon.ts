import { createLucideIcon } from 'lucide-react';

/**
 * Performer mode's icon: an iPad with a music note on it, drawn in Lucide's style (24 grid, 2 px round strokes) so
 * it sits with the other toolbar and activity-bar icons.
 */
export const PerformIcon = createLucideIcon('perform-tablet', [
  ['rect', { x: '4', y: '2', width: '16', height: '20', rx: '2.5', key: 'frame' }],
  ['path', { d: 'M11 18.5h2', key: 'home' }],
  ['circle', { cx: '10', cy: '12.5', r: '2', key: 'notehead' }],
  ['path', { d: 'M12 12.5V5.5c1.8.4 3.2 1.5 3.2 3.4', key: 'stem-flag' }],
]);
