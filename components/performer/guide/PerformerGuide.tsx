'use client';

import React from 'react';
import { performHref } from '../platform/performPath';

const SECTIONS: { title: string; items: string[] }[] = [
  {
    title: 'Install it on your iPad',
    items: [
      'Open this page in Safari (iPadOS 18.4 or later).',
      'Tap Share, then Add to Home Screen. Open Perform from its Home Screen icon: it fills the screen and keeps working without the network.',
      'Open it once while online so the app is saved on the iPad. The library says “The app is saved on this device and opens offline.”',
    ],
  },
  {
    title: 'Turn pages',
    items: [
      'Tap the right two thirds of the page to turn forward, the left third to turn back.',
      'A Bluetooth page-turning pedal works out of the box (arrow keys, Page Up/Down, Space). To use other keys, open the controls and choose Pedals…, then press the pedal.',
      'Nothing happens when you press a pedal? Turn off Full Keyboard Access (Settings ▸ Accessibility ▸ Keyboards).',
      'Half pages: the top of the next page appears above the bottom of this one, so you can read ahead before the full turn. Turn it on in the controls.',
    ],
  },
  {
    title: 'The controls',
    items: [
      'Press and hold near the top of the page, or tap with two fingers. (On a keyboard: Escape.)',
      'From there: the part, the music size (A− and A+), half pages, Play-through, the display, annotations, pedals, setlists and backups. Done hides them again.',
      'Display: High contrast for a bright room, Dark (the page inverted) for a dim stage.',
    ],
  },
  {
    title: 'Repeats',
    items: [
      'Tap a repeat sign (or a D.C., D.S. or Coda) to go where the music goes next; the bar you land on lights up for a moment.',
      'Play-through writes the repeats out in playing order, so you can simply turn pages.',
    ],
  },
  {
    title: 'Mark up the music',
    items: [
      'Open the controls and choose Annotate. Draw with the Apple Pencil; to draw with a finger, tick “Draw with finger”.',
      'Pen, highlighter, text, stamps (fingerings, bowings, breath marks, glasses, accidentals, dynamics) and the eraser. Undo takes back the last change.',
      'Marks stay on their notes when you change the music size, the part or the orientation.',
      'In Play-through a mark shows at each repeat; erasing one asks whether to erase it everywhere or only there.',
    ],
  },
  {
    title: 'Setlists and offline',
    items: [
      'In the library, make a setlist and add pieces (or choose “Add to setlist…” while a score is open).',
      'Turning past the last page shows the next piece; turn again to go there.',
      'Before going somewhere without internet, choose Make available offline on the setlist. Each piece shows “On device” when saved.',
    ],
  },
  {
    title: 'Keep your marks safe',
    items: [
      'Your marks and setlists are kept on this iPad only. Use “Back up marks” in the controls now and then, and keep the file (for example in Files or iCloud Drive).',
      '“Restore marks…” brings them back, also on another iPad.',
    ],
  },
];

/** `/perform?guide`: how to use performer mode on an iPad, in plain words. */
export function PerformerGuide() {
  return (
    <main
      data-testid="performer-guide"
      data-performer-controls
      className="mx-auto max-w-2xl space-y-6 p-6 text-slate-800"
    >
      <h1 className="text-2xl font-semibold">Performing from OTS scores</h1>
      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.title}</h2>
          <ul className="list-disc space-y-1 pl-5">
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
      <p className="text-sm text-slate-500">
        Something not working? Run the{' '}
        <a className="underline" href={performHref({ selftest: true })}>
          device self-test
        </a>{' '}
        and send its report.{' '}
        <a className="underline" href={performHref()}>
          Back to the library
        </a>
      </p>
    </main>
  );
}
