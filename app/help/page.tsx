import Link from 'next/link';
import type { Metadata } from 'next';
import { formatShortcutGeneric } from '../../components/shell/shortcutDisplay';
import { buildShortcutSections } from '../../components/shell/shortcutList';

export const metadata: Metadata = {
  title: 'Help · OurTextScores Editor',
  description:
    'How to edit scores in the OurTextScores web editor: the canvas, toolbar, Inspector, palettes, playback, and keyboard shortcuts.',
};

type Item = { term: string; detail: string };
type Section = { id: string; title: string; blurb: string; items: Item[] };

const sections: Section[] = [
  {
    id: 'canvas',
    title: 'The score canvas',
    blurb:
      'Editing happens directly on the page — select something, then act on it with the toolbar, the Inspector, or the keyboard.',
    items: [
      {
        term: 'Select',
        detail:
          'Click a note, rest, or element. Drag on empty space to rubber-band a range; click a measure to select it.',
      },
      {
        term: 'Drag to repitch',
        detail:
          'Drag a selected notehead up or down to change its pitch. A preview follows the cursor — release to commit, Escape to cancel.',
      },
      {
        term: 'Note input',
        detail:
          'Toggle note-input mode (the pencil, or press N) and click in a staff to place notes at the chosen duration.',
      },
      {
        term: 'Grips',
        detail:
          'Double-click a slur, hairpin, or line to show its grips, then drag a grip to reshape or extend it.',
      },
      {
        term: 'Edit text in place',
        detail:
          'Double-click a text element to edit it on the page. The editor stays at 100% regardless of zoom. Ctrl/Cmd + Enter saves, Escape cancels.',
      },
    ],
  },
  {
    id: 'notes',
    title: 'Notes, lines & chord marks',
    blurb:
      'Durations, grace notes, voices, and the spanner and chord-mark menus live in the Notes row.',
    items: [
      {
        term: 'Lines',
        detail:
          'Ottava (8va/8vb/15ma…), trill lines, and glissandos, applied across the selected note range. Created lines expose grips immediately.',
      },
      {
        term: 'Chord',
        detail:
          'Arpeggios and single- or two-note tremolos. A two-note tremolo needs exactly two equal-duration chords in one voice.',
      },
      {
        term: 'Accidentals',
        detail:
          'Sharp, flat, natural, double sharp, and double flat, drawn with notation-font glyphs. Applies to the selection or the note-input cursor.',
      },
    ],
  },
  {
    id: 'expression',
    title: 'Expression & articulations',
    blurb: 'Dynamics, hairpins, articulations, fermatas, breaths, pedals, and score text.',
    items: [
      {
        term: 'Articulations',
        detail:
          'Staccato, tenuto, marcato, accent, and more, plus fermatas and breaths/caesuras grouped as Common and Other.',
      },
      {
        term: 'Dynamics & hairpins',
        detail: 'Insert dynamic marks and crescendo/diminuendo hairpins across the selection.',
      },
      {
        term: 'Pedal',
        detail: 'Pedal line and text variants, including sostenuto, una corda, and pedal change.',
      },
      {
        term: 'Text',
        detail:
          'Title, staff, system, tempo, rehearsal, expression, fingering, sticking, lyrics, figured bass, and chord symbols.',
      },
    ],
  },
  {
    id: 'structure',
    title: 'Score structure & navigation',
    blurb: 'Instruments, key, clef, repeats, and playback navigation marks.',
    items: [
      {
        term: 'Key & Clef',
        detail:
          'Set the key signature or clef, both drawn with notation-font glyphs. Clefs can also be dragged onto a measure.',
      },
      { term: 'Repeats', detail: 'Start/end repeats, repeat counts, barline types, and voltas.' },
      {
        term: 'Navigation',
        detail:
          'Markers (segno, coda, fine, to coda) and jumps (D.C., D.S., and their al Fine/Coda variants). Defaults carry real playback targets, not just text.',
      },
      {
        term: 'Instruments & parts',
        detail: 'Add instruments, remove parts, and toggle per-part visibility.',
      },
    ],
  },
  {
    id: 'measures',
    title: 'Measures',
    blurb: 'Add, remove, and reshape bars.',
    items: [
      {
        term: 'Add / pickup bars',
        detail:
          'Insert measures at the beginning, after the selection, or at the end, and add a pickup (anacrusis) measure.',
      },
      {
        term: 'Measure repeat & multi-bar rests',
        detail:
          'Turn empty bars into 1-, 2-, or 4-bar repeats, and toggle multi-measure rests (see below).',
      },
      {
        term: 'Delete bars',
        detail:
          '“Delete Selected Bars” removes the measures in the selection; “Delete Trailing Empty Bars” trims empty measures from the end.',
      },
    ],
  },
  {
    id: 'panels',
    title: 'Side panels',
    blurb:
      'All side panels live on the right edge. When collapsed they share one narrow strip of stacked, binder-style tabs — click a tab to open that panel, or use the Panels button in the View toolbar to hide them all and maximise the score.',
    items: [
      {
        term: 'Inspector',
        detail:
          'Edits properties of the selection: visible, color, placement, horizontal/vertical offset (staff spaces), small, stem direction, and line style. Shows only the properties that apply, reports “Mixed” for a disagreeing multi-selection, and each change is a single undo step.',
      },
      {
        term: 'Fretboard editor',
        detail:
          'Part of the Inspector: when a fret diagram is selected it shows a fret grid — set strings/frets, click a cell to toggle a fingering, and cycle the top row for open/muted strings.',
      },
      {
        term: 'MusicXML',
        detail:
          'A live MusicXML editor for the score. Edit the XML and Apply, or Reload to pull the latest from the score.',
      },
      {
        term: 'AI Tools',
        detail: 'A tabbed panel of AI-assisted tools — see the next section for each one.',
      },
      {
        term: 'History',
        detail:
          'Local checkpoints and score versions. Save a checkpoint, then Restore, Compare, Rename, or Delete it.',
      },
    ],
  },
  {
    id: 'ai-tools',
    title: 'AI Tools',
    blurb:
      'Each tool lives on its own tab in the AI Tools panel. They call server-side models, so they need those services configured to run.',
    items: [
      {
        term: 'Assistant',
        detail:
          'Describe a change in plain language and the assistant proposes an edit as a reviewable MusicXML patch. You see a diff, can give feedback for another pass, and apply it as one undoable step (auto-checkpointing first).',
      },
      {
        term: 'NotaGen',
        detail:
          'Generative model that composes or continues musical material, which you can bring into the score.',
      },
      {
        term: 'Transcoda',
        detail:
          'Transcoda is an End-to-end zero-shot Optical Music Recognition engine, creating engravings from scanned images.',
      },
      { term: 'Chordify', detail: 'Analyses the harmony and adds chord symbols above the staff.' },
      {
        term: 'Harmony',
        detail:
          'Functional-harmony analysis — labels chords with their Roman-numeral / functional role.',
      },
      {
        term: 'MMA',
        detail:
          'Musical MIDI Accompaniment — generates a backing accompaniment from the score’s chords and structure.',
      },
    ],
  },
  {
    id: 'tools',
    title: 'Specialized & bulk tools',
    blurb: 'Fret diagrams, ambitus, and range operations, plus the floating palettes.',
    items: [
      {
        term: 'Fret diagrams & ambitus',
        detail:
          'Add a fret diagram to a chord and edit it in the Inspector, or add an ambitus to a staff.',
      },
      {
        term: 'Explode / implode',
        detail: 'Explode spreads a range across staves; implode collapses it back.',
      },
      {
        term: 'Regroup & resequence',
        detail: 'Regroup rhythms in a range, or resequence rehearsal marks into order.',
      },
      {
        term: 'Palettes',
        detail:
          'Open the floating, searchable palettes to browse elements by category and click to apply them to the selection.',
      },
    ],
  },
  {
    id: 'playback',
    title: 'Playback & export',
    blurb: 'Hear the score and get it out of the editor.',
    items: [
      {
        term: 'Playback',
        detail:
          'Play the whole score or just the selection; navigation marks and repeats are followed during playback.',
      },
      { term: 'Export', detail: 'Save to MSCZ, MusicXML/MXL, MIDI, PDF, PNG, SVG, or audio.' },
    ],
  },
];

const tocEntries = [
  ...sections.map((s) => ({ id: s.id, title: s.title })),
  { id: 'shortcuts', title: 'Keyboard shortcuts' },
  { id: 'community', title: 'Community & contributing' },
];

function renderKbd(label: string, keys: readonly string[]) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-slate-200 bg-white p-3">
      <span className="text-sm font-medium text-slate-800">{label}</span>
      <span className="flex flex-wrap gap-1">
        {keys.map((chord) => (
          <kbd
            key={chord}
            className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-caption font-semibold text-slate-600"
          >
            {formatShortcutGeneric(chord)}
          </kbd>
        ))}
      </span>
    </div>
  );
}

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Hero */}
      <header className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-6 px-6 py-10">
          <div>
            <div className="mb-2 inline-flex items-center rounded-full border border-line bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
              Editor guide
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">OurTextScores Help</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              A click-then-act editor: select something on the page, then apply a change from the
              toolbar, the Inspector, or the keyboard. Every change is a single undoable step.
            </p>
          </div>
          <Link
            href="/"
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            ← Back to editor
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-10 px-6 py-10">
        {/* Sticky sidebar TOC */}
        <aside className="hidden shrink-0 lg:block" style={{ width: 208 }}>
          <nav aria-label="Contents" className="sticky top-8">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              On this page
            </div>
            <ul className="space-y-1 border-l border-slate-200">
              {tocEntries.map((entry) => (
                <li key={entry.id}>
                  <a
                    href={`#${entry.id}`}
                    className="-ml-px block border-l-2 border-transparent py-1 pl-4 text-sm text-slate-600 transition hover:border-line-strong hover:text-ink"
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 space-y-12">
          {sections.map((section, index) => (
            <section key={section.id} id={section.id} className="scroll-mt-8">
              <div className="mb-3 flex items-center gap-3">
                <span
                  style={{ width: 28, height: 28 }}
                  className="flex shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white"
                >
                  {index + 1}
                </span>
                <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
              </div>
              <p className="mb-5 text-sm leading-6 text-slate-600">{section.blurb}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {section.items.map((item) => (
                  <div
                    key={item.term}
                    className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-raised"
                  >
                    <div className="text-sm font-semibold text-slate-900">{item.term}</div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ))}

          <section id="shortcuts" className="scroll-mt-8">
            <div className="mb-3 flex items-center gap-3">
              <span
                style={{ width: 28, height: 28 }}
                className="flex shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white"
              >
                ⌘
              </span>
              <h2 className="text-xl font-semibold text-slate-900">Keyboard shortcuts</h2>
            </div>
            <p className="mb-5 text-sm leading-6 text-slate-600">
              Also under Help ▸ Keyboard Shortcuts in the editor.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {buildShortcutSections().flatMap((section) =>
                section.rows.map((row) => (
                  <div key={`${section.title}:${row.label}`} title={section.title}>
                    {renderKbd(row.label, row.keys)}
                  </div>
                )),
              )}
            </div>
          </section>

          <section id="community" className="scroll-mt-8">
            <div className="mb-3 flex items-center gap-3">
              <span
                style={{ width: 28, height: 28 }}
                className="flex shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white"
              >
                ♦
              </span>
              <h2 className="text-xl font-semibold text-slate-900">Community & contributing</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-raised">
                <div className="text-sm font-semibold text-slate-900">Report Bugs or Send PRs</div>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Open issues or submit pull requests for the website or score editor.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href="https://github.com/OurTextScores/OurTextScores/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-150 hover:-translate-y-px hover:bg-slate-100 hover:shadow-raised"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                    OurTextScores Website Repo
                  </a>
                  <a
                    href="https://github.com/OurTextScores/OTS_WebEditor/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all duration-150 hover:-translate-y-px hover:bg-slate-100 hover:shadow-raised"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                    OTS_WebEditor Repo
                  </a>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-raised">
                <div className="text-sm font-semibold text-slate-900">Join us on Discord</div>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  Ask questions, share progress, and connect with other contributors.
                </p>
                <div className="mt-3">
                  <a
                    href="https://discord.gg/T3BuWeWGqt"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-md border border-line-control bg-surface-sunken px-3 py-1.5 text-xs font-semibold text-ink transition-all duration-150 hover:-translate-y-px hover:bg-surface-hover hover:shadow-raised"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                    </svg>
                    Join Discord Server
                  </a>
                </div>
              </div>
            </div>
          </section>

          <footer className="border-t border-slate-200 pt-6 text-xs text-slate-400">
            OurTextScores editor · built on the MuseScore 4 engine.
          </footer>
        </main>
      </div>
    </div>
  );
}
