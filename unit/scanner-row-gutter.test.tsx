import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ loadWebMscore: vi.fn() }));

vi.mock('../lib/webmscore-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webmscore-loader')>()),
  loadWebMscore: mocked.loadWebMscore,
}));

import {
  engravedRowWindow,
  overfullMeasures,
  focusedMeasureIndexes,
  lineStartsInMerge,
  mergedBarStatesForRegion,
  placeUnderMerged,
  scannerRegionDifferenceDescriptions,
  ScannerSystemRows,
  type ScannerRowRegion,
  type ScannerSystem,
} from '../components/score-editor/compare/ScannerSystemRows';
import type { MergedScoreState } from '../components/score-editor/compare/useMergedScoreDocument';
import type { WebMscoreInstance } from '../lib/webmscore-loader';

type FetchCall = {
  url: string;
  method: string;
  body?: BodyInit | null;
};

type RenderedSideFixture = NonNullable<Parameters<typeof engravedRowWindow>[0]>;

const renderedSide = (
  measures: RenderedSideFixture['measures'],
  width = 400,
): RenderedSideFixture => ({
  svg: '',
  measures,
  segments: [],
  staffBands: [],
  width,
  pageHeight: 100,
  renderScale: 1,
});

/**
 * The gutter is where a reviewer decides. Two of its rules are not cosmetic:
 * the arrow says where the bar goes, and a difference with no proven place on
 * the scan has no control at all.
 */

const XML =
  '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list>' +
  '<part id="P1"><measure number="1"><note/></measure></part></score-partwise>';

const REGIONS_URL =
  'https://host/api/proxy/scanner/jobs/job-1/pages/1/comparison/regions?baseEngine=homr';

const systems: ScannerSystem[] = [
  { systemIndex: 0, leftMeasureIndexes: [0], rightMeasureIndexes: [0] },
];

const croppedSystems: ScannerSystem[] = [
  { systemIndex: 0, leftMeasureIndexes: [0], rightMeasureIndexes: [0], cropUrl: 'systems/0/crop' },
  { systemIndex: 1, leftMeasureIndexes: [1], rightMeasureIndexes: [1], cropUrl: 'systems/1/crop' },
];

const grounded: ScannerRowRegion = {
  blockIndex: 0,
  leftMeasureIndexes: [0],
  rightMeasureIndexes: [0],
  differenceClasses: ['notation'],
  grounded: true,
  contentSignature: 'scanner-block-content-v2:abc',
};

const ungrounded: ScannerRowRegion = {
  blockIndex: 1,
  leftMeasureIndexes: [0],
  rightMeasureIndexes: [0],
  differenceClasses: ['notation'],
  grounded: false,
};

const secondGrounded: ScannerRowRegion = {
  ...grounded,
  blockIndex: 1,
  contentSignature: 'scanner-block-content-v2:def',
};

describe('durable merged bar states', () => {
  it('distinguishes inherited, taken, markings, edited, and flagged bars', () => {
    const region = { ...grounded, stablePartKey: 'part-cello' };
    const stateFor = (overrides: Record<string, unknown>) =>
      ({
        present: true,
        revision: 1,
        edited: false,
        basisSignature: 'basis',
        stale: false,
        url: '../merged',
        musicXmlUrl: '../merged/musicxml',
        measureMaps: { 'part-cello': [0] },
        ...overrides,
      }) as MergedScoreState;

    expect(mergedBarStatesForRegion(region, 'left', stateFor({}))[0].state).toBe('inherited');
    expect(
      mergedBarStatesForRegion(
        region,
        'left',
        stateFor({
          decisions: [{ blockIndex: 0, engineId: 'transcoda', measureIndexes: [0] }],
        }),
      )[0].state,
    ).toBe('taken');
    expect(
      mergedBarStatesForRegion(
        region,
        'left',
        stateFor({
          decisions: [
            {
              blockIndex: 0,
              engineId: 'transcoda',
              markingsOnly: 'dynamics',
              measureIndexes: [0],
            },
          ],
        }),
      )[0].state,
    ).toBe('markings-merged');
    expect(
      mergedBarStatesForRegion(
        region,
        'left',
        stateFor({
          decisions: [
            {
              blockIndex: 0,
              engineId: 'homr',
              markingsOnly: 'dynamics',
              measureIndexes: [0],
            },
            { blockIndex: 0, engineId: 'transcoda', measureIndexes: [0] },
          ],
        }),
      )[0].state,
    ).toBe('taken');
    expect(
      mergedBarStatesForRegion(
        region,
        'left',
        stateFor({
          editedMeasures: [{ stablePartKey: 'part-cello', measureIndex: 0 }],
        }),
      )[0].state,
    ).toBe('edited');
    expect(
      mergedBarStatesForRegion(
        region,
        'left',
        stateFor({ decisions: [{ blockIndex: 0, flagged: true, measureIndexes: [0] }] }),
      )[0].state,
    ).toBe('flagged');
    expect(
      mergedBarStatesForRegion(
        region,
        'left',
        stateFor({
          decisions: [
            { blockIndex: 0, flagged: true, measureIndexes: [0] },
            { blockIndex: 0, flagged: false, measureIndexes: [0] },
          ],
        }),
      )[0].state,
    ).toBe('inherited');
  });
});

function renderRows(
  regions: ScannerRowRegion[],
  calls: FetchCall[],
  options: {
    systems?: ScannerSystem[];
    onlyBlockIndex?: number;
    present?: boolean;
    sourceEngineId?: string;
    decisions?: Array<{
      blockIndex?: number;
      stablePartKey?: string;
      engineId?: string;
      markingsOnly?: 'dynamics' | 'lyrics';
      flagged?: boolean;
      measureIndexes?: number[];
    }>;
    editedMeasures?: Array<{ measureIndex: number; stablePartKey?: string }>;
    measureMap?: number[];
    measureMaps?: Record<string, Array<number | null>>;
    score?: Record<string, unknown>;
  } = {},
) {
  const score = {
    saveSvg: vi.fn(async () => '<svg><g/></svg>'),
    measurePositions: vi.fn(async () => ({
      // Five bars across the page, so a row can be narrowed to some of them.
      elements: [0, 1, 2, 3, 4].map((index) => ({
        id: index,
        x: index * 100,
        y: 0,
        sx: 100,
        sy: 40,
        page: 0,
      })),
      events: [],
      pageSize: { width: 500, height: 40 },
    })),
    // Four rhythmic positions across the one measure above.
    // Four rhythmic positions inside the first measure above.
    segmentPositions: vi.fn(async () => ({
      elements: [0, 1, 2, 3].map((index) => ({
        id: index,
        x: index * 25,
        y: 5,
        sx: 8,
        sy: 30,
        page: 0,
      })),
      events: [],
      pageSize: { width: 500, height: 40 },
    })),
    saveXml: vi.fn(async () => new TextEncoder().encode(XML)),
    relayout: vi.fn(async () => undefined),
    destroy: vi.fn(),
    ...(options.score || {}),
  };
  mocked.loadWebMscore.mockResolvedValue({
    load: vi.fn(async () => score),
  } as unknown as WebMscoreInstance);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method || 'GET', body: init?.body });
      return init?.method === 'POST'
        ? new Response(JSON.stringify({ present: true, revision: 2, repairs: [] }), {
            status: 200,
          })
        : new Response(XML, { status: 200 });
    }),
  );

  return render(
    <ScannerSystemRows
      systems={options.systems || systems}
      onlyBlockIndex={options.onlyBlockIndex}
      regions={regions}
      leftXml={XML}
      rightXml={XML}
      leftLabel="HOMR"
      rightLabel="Transcoda"
      leftEngineId="homr"
      rightEngineId="transcoda"
      merged={{
        present: options.present ?? true,
        sourceEngineId:
          options.sourceEngineId ?? ((options.present ?? true) ? 'transcoda' : undefined),
        decisions: options.decisions,
        editedMeasures: options.editedMeasures,
        measureMap: options.measureMap,
        measureMaps: options.measureMaps,
        revision: 1,
        edited: false,
        basisSignature: 'basis',
        stale: false,
        url: '../merged',
        musicXmlUrl: '../merged/musicxml?revision=1',
      }}
      resolveUrl={(relative) => new URL(relative, REGIONS_URL).toString()}
    />,
  );
}

describe('the system pane', () => {
  beforeEach(() => {
    mocked.loadWebMscore.mockReset();
    vi.unstubAllGlobals();
  });

  it('scales the drawing to its own box, not to a container above it', async () => {
    // The pane used to be handed the scroll container's `clientWidth`,
    // which counts that container's padding and knows nothing about the row
    // card's — so every pane was scaled ~58px wider than the box it had to
    // fit in and the music ran off a clipped edge. Measuring itself cannot
    // drift from the layout however much padding is added above.
    const observed: Element[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe(node: Element) {
          observed.push(node);
          this.callback();
        }
        disconnect() {}
      },
    );
    const calls: FetchCall[] = [];
    renderRows([grounded], calls);

    await screen.findByTestId('btn-take-down-0');
    // The pane itself — the element the drawing lands in — is observed, not
    // only the scroll container it happens to sit inside.
    const panes = observed.filter(
      (node) => node.className.includes('overflow-clip') && node.className.includes('w-full'),
    );
    expect(panes.length).toBeGreaterThan(0);
  });
});

describe('choosing the bars a pane draws', () => {
  it('keeps one bar of context either side of the difference', () => {
    // A barline join is part of what a reviewer is judging: whether a bar
    // was split, and whether the bar after it still starts where it should.
    expect(focusedMeasureIndexes([0, 1, 2, 3, 4], [2])).toEqual([1, 2, 3]);
    expect(focusedMeasureIndexes([0, 1, 2, 3, 4], [0])).toEqual([0, 1]);
    expect(focusedMeasureIndexes([0, 1, 2, 3, 4], [4])).toEqual([3, 4]);
  });

  it('joins two differences on one line rather than showing each alone', () => {
    expect(focusedMeasureIndexes([0, 1, 2, 3, 4], [1, 3])).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the whole line for a side with nothing in the difference', () => {
    // The empty half of an insertion or a removal. There is nothing there
    // to narrow to, and what that side is missing can only be judged
    // against what it has instead.
    expect(focusedMeasureIndexes([0, 1, 2, 3], [])).toEqual([0, 1, 2, 3]);
  });
});

describe('clicking the merged pane', () => {
  beforeEach(() => {
    mocked.loadWebMscore.mockReset();
    vi.unstubAllGlobals();
  });

  it('lets the engine paint the selection, and reserves the crosshair for note input', async () => {
    // MuseScore colours the selected elements itself and the colour comes
    // back in the SVG — the editor passes `highlightSelection` for exactly
    // that reason. This view passed `false` and then wondered why clicking
    // a note did nothing: it was selecting correctly and drawing the score
    // without the selection in it.
    const calls: FetchCall[] = [];
    const saveSvg = vi.fn<
      (page: number, drawBackground: boolean, highlightSelection: boolean) => Promise<string>
    >(async () => '<svg><g/></svg>');
    const selectElementAtPoint = vi.fn(async () => undefined);
    renderRows([grounded], calls, { score: { saveSvg, selectElementAtPoint } });

    const pane = await screen.findByTestId('merged-system-pane');
    // Selecting is an ordinary click; only placing notes takes a crosshair.
    expect(pane.className).not.toContain('cursor-crosshair');

    fireEvent.click(pane);
    await waitFor(() => expect(selectElementAtPoint).toHaveBeenCalled());
    // The merged pane is drawn with the selection in it; the readings are
    // evidence and cannot be selected, so they are not.
    await waitFor(() => expect(saveSvg.mock.calls.some((call) => call[2] === true)).toBe(true));
    expect(saveSvg.mock.calls.some((call) => call[2] === false)).toBe(true);
  });

  it('starts note input from the selection, so the engine puts its cursor there', async () => {
    // `setInputStateFromSelection` is what puts the engine's input position
    // on the selected note. Entering note-entry mode without it leaves the
    // input state wherever it was, so the cursor is somewhere else entirely.
    const calls: FetchCall[] = [];
    const order: string[] = [];
    renderRows([grounded], calls, {
      score: {
        setInputStateFromSelection: vi.fn(async () => order.push('from-selection')),
        setNoteEntryMode: vi.fn(async () => order.push('note-entry')),
      },
    });

    const controls = await screen.findByTestId('merged-pane-controls');
    const noteInputButton = screen.getByTestId('btn-merged-note-input');
    expect(controls).toContainElement(noteInputButton);
    await userEvent.click(noteInputButton);
    await waitFor(() => expect(order).toEqual(['from-selection', 'note-entry']));
  });

  it('applies palette items to the selected merged score', async () => {
    const calls: FetchCall[] = [];
    const selectElementAtPoint = vi.fn(async () => undefined);
    const setBeamMode = vi.fn(async () => true);
    renderRows([grounded], calls, { score: { selectElementAtPoint, setBeamMode } });

    fireEvent.click(await screen.findByTestId('merged-system-pane'));
    await waitFor(() => expect(selectElementAtPoint).toHaveBeenCalled());
    const paletteButton = screen.getByTestId('btn-merged-palettes');
    expect(screen.getByTestId('merged-pane-controls')).toContainElement(paletteButton);
    await userEvent.click(paletteButton);
    await userEvent.click(await screen.findByTestId('palette-item-beam-1'));

    await waitFor(() => expect(setBeamMode).toHaveBeenCalledWith(1));
  });
});

describe('a bar that holds the wrong amount of music', () => {
  beforeEach(() => {
    mocked.loadWebMscore.mockReset();
    vi.unstubAllGlobals();
  });

  it('calls a first short bar pickup measure 0 and does not offer to pad it', async () => {
    // MuseScore marks these with a small plus in the corner, which says
    // something is wrong but not what. On one Klengel page eighteen of
    // fifty-one bars held something other than the 2/4 they were written
    // in, and a reviewer had no way to find them except hunting for marks.
    const calls: FetchCall[] = [];
    const setMeasureLengthToTimeSignature = vi.fn<(measureIndex: number) => Promise<boolean>>(
      async () => true,
    );
    renderRows([grounded], calls, {
      score: {
        irregularMeasures: vi.fn(async () => [
          { index: 0, number: '1', actual: '1/8', nominal: '2/4', irregular: false },
        ]),
        setMeasureLengthToTimeSignature,
      },
    });

    const warning = await screen.findByTestId('irregular-bar');
    expect(warning.textContent).toContain('pickup measure 0 holds 1/8, not 2/4');
    expect(screen.queryByTestId('btn-fix-bar-0')).not.toBeInTheDocument();
    expect(setMeasureLengthToTimeSignature).not.toHaveBeenCalled();
  });

  it('offers to repair an ordinary under-full bar', async () => {
    const calls: FetchCall[] = [];
    const setMeasureLengthToTimeSignature = vi.fn<(measureIndex: number) => Promise<boolean>>(
      async () => true,
    );
    renderRows([{ ...grounded, leftMeasureIndexes: [1], rightMeasureIndexes: [1] }], calls, {
      systems: [{ systemIndex: 0, leftMeasureIndexes: [1], rightMeasureIndexes: [1] }],
      score: {
        irregularMeasures: vi.fn(async () => [
          { index: 1, number: '2', actual: '1/8', nominal: '2/4', irregular: false },
        ]),
        setMeasureLengthToTimeSignature,
      },
    });

    expect((await screen.findByTestId('irregular-bar')).textContent).toContain(
      'bar 2 holds 1/8, not 2/4',
    );
    await userEvent.click(screen.getByTestId('btn-fix-bar-1'));
    await waitFor(() => expect(setMeasureLengthToTimeSignature).toHaveBeenCalledWith(1));
  });

  it('corrects every over-full bar at once, and leaves short ones alone', async () => {
    // A pickup is short by definition, and so is the last bar of a piece
    // that answers one; padding those out would invent rests where the
    // music does not start yet. A bar holding *more* than its time
    // signature has no such reading.
    expect(
      overfullMeasures([
        { index: 0, number: '1', actual: '1/8', nominal: '2/4', irregular: false },
        { index: 4, number: '5', actual: '3/4', nominal: '2/4', irregular: false },
        { index: 9, number: '10', actual: '2/4', nominal: '2/4', irregular: true },
      ]).map((bar) => bar.number),
    ).toEqual(['5']);

    const calls: FetchCall[] = [];
    const setMeasureLengthToTimeSignature = vi.fn<(measureIndex: number) => Promise<boolean>>(
      async () => true,
    );
    renderRows([grounded], calls, {
      score: {
        irregularMeasures: vi.fn(async () => [
          { index: 0, number: '1', actual: '1/8', nominal: '2/4', irregular: false },
          { index: 2, number: '3', actual: '3/4', nominal: '2/4', irregular: false },
          { index: 5, number: '6', actual: '4/4', nominal: '2/4', irregular: false },
        ]),
        setMeasureLengthToTimeSignature,
      },
    });

    const all = await screen.findByTestId('btn-fix-all-overfull');
    expect(all.textContent).toContain('2 over-full bars');

    await userEvent.click(all);
    // Descending, so an earlier fix cannot renumber a later target, and the
    // short bar 1 is not touched.
    await waitFor(() =>
      expect(setMeasureLengthToTimeSignature.mock.calls.map((call) => call[0])).toEqual([5, 2]),
    );
  });

  it('says nothing about bars that hold what they should', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, {
      score: { irregularMeasures: vi.fn(async () => []) },
    });

    await screen.findByTestId('merged-system-pane');
    expect(screen.queryByTestId('irregular-bar')).toBeNull();
  });
});

describe('a merged line that would not fit on one system', () => {
  const box = (left: number, top: number) => ({ left, top, width: 100, height: 40 });
  // Five bars imposed as one line, engraved as four then one.
  const split = renderedSide([box(0, 0), box(100, 0), box(200, 0), box(300, 0), box(0, 120)]);

  it('drops the bars that spilled onto a second system', () => {
    // Neither page width nor staff size fixes the spill — quartering the
    // staff left a Klengel line split in exactly the same place — so the
    // pane shows one engraved row rather than pretending the line is whole.
    expect(engravedRowWindow(split, [0, 1, 2, 3, 4], [])).toEqual([0, 1, 2, 3]);
  });

  it('drops from the front instead when the difference is in the spill', () => {
    // The reader is here to judge a difference; a window that leaves it off
    // screen is no use however tidy it looks.
    expect(engravedRowWindow(split, [0, 1, 2, 3, 4], [4])).toEqual([4]);
  });

  it('keeps the row holding all of the difference when one does', () => {
    expect(engravedRowWindow(split, [0, 1, 2, 3, 4], [1, 2])).toEqual([0, 1, 2, 3]);
    // Spanning the break, the row holding the first of them wins.
    expect(engravedRowWindow(split, [0, 1, 2, 3, 4], [3, 4])).toEqual([0, 1, 2, 3]);
  });

  it('leaves a line that fits exactly as it is', () => {
    const whole = renderedSide([box(0, 0), box(100, 0), box(200, 0)]);
    expect(engravedRowWindow(whole, [0, 1, 2], [1])).toEqual([0, 1, 2]);
  });
});

describe('holding the merged line still', () => {
  it('follows a line start through a take that changed the bar count', () => {
    // The starts are positions in the engine reading. A take that inserts
    // or removes bars renumbers everything after it, so breaking at the old
    // number puts a different bar at the head of the line — the line
    // reflowing under a reader who did not ask it to.
    //
    // One bar inserted before the reading's bar 2, so that bar is now the
    // merge's bar 3.
    expect(lineStartsInMerge([0, 2, 4], [0, 1, -1, 2, 3, 4])).toEqual([0, 3, 5]);
  });

  it('drops a line whose first bar a decision removed', () => {
    // Breaking at whatever now sits at that number would begin the line in
    // the wrong place; one line too few is the smaller lie.
    expect(lineStartsInMerge([0, 2, 4], [0, 1, 4])).toEqual([0, 2]);
  });

  it('leaves the starts alone before there is a merged document', () => {
    // Until one is saved the merged score *is* the reading, so its bars are
    // already numbered the way the starts expect.
    expect(lineStartsInMerge([0, 2, 4], undefined)).toEqual([0, 2, 4]);
  });
});

describe('placing a reading under the merged line', () => {
  // A merged line of four equal bars across a 400px pane: 100px a bar.
  const merged = renderedSide(
    [0, 1, 2, 3].map((index) => ({
      left: index * 100,
      width: 100,
      top: 0,
      height: 40,
    })),
  );

  it("draws at the merged score's scale, over the bars it would replace", () => {
    // Forced to fill the pane, two contested bars of a twelve-bar line blew
    // up to the full width and sat nowhere near the merged bars they
    // replace. Handed the box its counterpart occupies, a reading is drawn
    // at that size, in that place — so the reader compares by looking up and
    // down a column rather than across two differently-zoomed pictures.
    expect(placeUnderMerged(merged, [0, 1, 2, 3], [1, 2], 400)).toEqual({
      left: 100,
      width: 200,
    });
    // The last bar of the line sits at the right-hand end of the pane.
    expect(placeUnderMerged(merged, [0, 1, 2, 3], [3], 400)).toEqual({
      left: 300,
      width: 100,
    });
  });

  it('gives no box when there is nothing to line up against', () => {
    // The merged score does not draw this line, or the bars are not in it.
    // The pane then fills its own width, as it did before there was
    // anything to align to.
    expect(placeUnderMerged(null, [0, 1], [0], 400)).toBeNull();
    expect(placeUnderMerged(merged, [], [0], 400)).toBeNull();
    expect(placeUnderMerged(merged, [0, 1, 2, 3], [9], 400)).toBeNull();
  });
});

describe('the difference navigator', () => {
  beforeEach(() => {
    mocked.loadWebMscore.mockReset();
    vi.unstubAllGlobals();
  });

  const twoDifferences: ScannerRowRegion[] = [
    {
      ...grounded,
      blockIndex: 0,
      leftMeasureIndexes: [0],
      rightMeasureIndexes: [0],
      leftMeasureLabel: 'bar 1',
      rightMeasureLabel: 'bar 1',
      cropBoxes: [{ systemIndex: 0, left: 0.25, top: 0, width: 0.5, height: 1 }],
    },
    {
      ...grounded,
      blockIndex: 1,
      leftMeasureIndexes: [1],
      rightMeasureIndexes: [1],
      differenceClasses: ['measure-removed'],
      leftMeasureLabel: 'bar 2',
      rightMeasureLabel: '',
      contentSignature: 'scanner-block-content-v2:def',
    },
  ];

  it('describes concrete semantic deltas and keeps coarse classes only as fallback', () => {
    expect(
      scannerRegionDifferenceDescriptions(
        {
          ...grounded,
          leftMeasureLabel: 'bar 7',
          rightMeasureLabel: 'bar 7',
          differenceClasses: ['notation', 'voice'],
          componentDifferences: [
            {
              leftMeasureIndex: 6,
              rightMeasureIndex: 6,
              leftMeasureLabel: 'bar 7',
              rightMeasureLabel: 'bar 7',
              component: 'notation',
              leftOnly: ['E4 at quarter 2, duration 1 quarter'],
              rightOnly: ['G4 at quarter 2, duration 1 quarter'],
            },
          ],
        },
        'HOMR',
        'Transcoda',
      ),
    ).toEqual([
      'bar 7 · notes or rhythm — HOMR only: E4 at quarter 2, duration 1 quarter · Transcoda only: G4 at quarter 2, duration 1 quarter',
      'voices',
    ]);
  });

  it('names the line under review and moves to the next line with a conflict', async () => {
    // This used to be a card outside the editor: a list of blocks, a
    // cropped scrap of scan, and the editor below — three places to look at
    // one difference. The title says which one it is, and the arrows move.
    const calls: FetchCall[] = [];
    renderRows(twoDifferences, calls, {
      systems: [
        ...croppedSystems,
        {
          systemIndex: 2,
          leftMeasureIndexes: [2],
          rightMeasureIndexes: [2],
          cropUrl: 'systems/2/crop',
        },
      ],
      onlyBlockIndex: 0,
    });

    expect(await screen.findByTestId('difference-title')).toHaveTextContent('Conflict line 1 of 2');
    const header = screen.getByTestId('system-row-header');
    // Nothing to go back to from the first.
    const previous = screen.getByTestId('btn-previous-difference');
    expect(header).toContainElement(previous);
    expect(previous).toBeDisabled();

    await userEvent.click(screen.getByTestId('btn-next-difference'));

    expect(screen.getByTestId('difference-title')).toHaveTextContent('Conflict line 2 of 2');
    expect(screen.queryByText('System 2 of 3')).not.toBeInTheDocument();
    // The physical page still has a third system, but it has no conflict.
    // Next stops on the second and last conflict line.
    expect(screen.getByTestId('btn-next-difference')).toBeDisabled();
  });

  it('groups conflicts by scan line and emphasizes their combined description', async () => {
    const calls: FetchCall[] = [];
    const preciseFirstConflict: ScannerRowRegion = {
      ...twoDifferences[0],
      componentDifferences: [
        {
          leftMeasureIndex: 0,
          rightMeasureIndex: 0,
          leftMeasureLabel: 'bar 1',
          rightMeasureLabel: 'bar 1',
          component: 'notation',
          leftOnly: ['E4 at quarter 2, duration 1 quarter'],
          rightOnly: ['G4 at quarter 2, duration 1 quarter'],
        },
      ],
    };
    const anotherOnFirstLine: ScannerRowRegion = {
      ...grounded,
      blockIndex: 2,
      leftMeasureIndexes: [0],
      rightMeasureIndexes: [0],
      differenceClasses: ['attributes'],
      contentSignature: 'scanner-block-content-v2:ghi',
      cropBoxes: [{ systemIndex: 0, left: 0.7, top: 0, width: 0.2, height: 1 }],
    };
    renderRows([preciseFirstConflict, anotherOnFirstLine, twoDifferences[1]], calls, {
      systems: croppedSystems,
      onlyBlockIndex: 0,
    });

    expect(await screen.findByTestId('difference-title')).toHaveTextContent('Conflict line 1 of 2');
    const header = screen.getByTestId('system-row-header');
    expect(header).not.toHaveTextContent('notes or rhythm');
    expect(header).not.toHaveTextContent('clef, key, time or divisions');
    expect(screen.queryAllByTestId('difference-description')).toHaveLength(0);

    const firstTake = screen.getByTestId('btn-take-down-0');
    fireEvent.mouseEnter(firstTake);
    // One block, below the readings, in either layout.
    expect(
      screen
        .getAllByTestId('difference-description')
        .map((description) => description.dataset.position),
    ).toEqual(['below-row']);

    await userEvent.click(screen.getByTestId('btn-layout-vertical'));
    fireEvent.mouseEnter(screen.getByTestId('btn-take-down-0'));
    const descriptions = screen.getAllByTestId('difference-description');
    expect(descriptions).toHaveLength(1);
    for (const description of descriptions) {
      expect(description).toHaveTextContent('notes or rhythm');
      expect(description).toHaveTextContent('HOMR only: E4 at quarter 2');
      expect(description).toHaveTextContent('Transcoda only: G4 at quarter 2');
      expect(description).not.toHaveTextContent('clef, key, time or divisions');
      expect(description.className).toContain('font-bold');
    }

    // Leaving does not erase the evidence; the next Take hover replaces it.
    fireEvent.mouseLeave(firstTake);
    expect(screen.getAllByTestId('difference-description')[0]).toHaveTextContent(
      'HOMR only: E4 at quarter 2',
    );
    fireEvent.mouseEnter(screen.getByTestId('btn-take-down-2'));
    for (const description of screen.getAllByTestId('difference-description')) {
      expect(description).toHaveTextContent('clef, key, time or divisions');
      expect(description).not.toHaveTextContent('HOMR only: E4 at quarter 2');
    }

    // Block 2 is another conflict on this same line. Next skips it and
    // advances to the next scan line that contains any conflict.
    await userEvent.click(screen.getByTestId('btn-next-difference'));
    expect(screen.getByTestId('difference-title')).toHaveTextContent('Conflict line 2 of 2');
    expect(screen.getByTestId('btn-next-difference')).toBeDisabled();
  });

  it('narrows the engine panes to the contested bars, and nothing else', async () => {
    // A system is up to a dozen bars and a difference is usually one or two
    // of them. Spending the width on music both readings agree about
    // shrinks the bars in question to the point where comparing a beam
    // means leaning at the screen. The scan and the merged score keep their
    // whole line: one is the context the judgement rests on, the other is
    // the thing being built.
    const calls: FetchCall[] = [];
    const wideSystems: ScannerSystem[] = [
      {
        systemIndex: 0,
        leftMeasureIndexes: [0, 1, 2, 3, 4],
        rightMeasureIndexes: [0, 1, 2, 3, 4],
      },
    ];
    renderRows(
      [
        {
          ...grounded,
          blockIndex: 0,
          leftMeasureIndexes: [2],
          rightMeasureIndexes: [2],
        },
      ],
      calls,
      { systems: wideSystems, onlyBlockIndex: 0 },
    );

    await screen.findByTestId('btn-take-down-0');
    await waitFor(() =>
      expect(screen.getAllByTestId('pane-measures').map((node) => node.textContent)).toEqual([
        '1,2,3',
        '1,2,3',
      ]),
    );
  });

  it('boxes the difference on the scan it came from', async () => {
    // The crop is the system, not a cut-out of the bars: the reader keeps
    // the line for context and the box says which part of it is in question.
    const calls: FetchCall[] = [];
    renderRows(twoDifferences, calls, {
      systems: croppedSystems,
      onlyBlockIndex: 0,
    });

    expect(screen.queryAllByTestId('scan-difference-box')).toHaveLength(0);
    fireEvent.mouseEnter(await screen.findByTestId('btn-take-down-0'));
    // Across draws the scan once, above all three lanes.
    const across = await screen.findAllByTestId('scan-difference-box');
    expect(across).toHaveLength(1);
    expect(across[0]).toHaveStyle({ left: '25%', width: '50%' });

    // Stacked draws it once above the first reading and once below the
    // second, so each reading has the page it was read from next to it.
    await userEvent.click(screen.getByTestId('btn-layout-vertical'));
    fireEvent.mouseEnter(screen.getByTestId('btn-take-down-0'));
    const boxes = await screen.findAllByTestId('scan-difference-box');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toHaveStyle({ left: '25%', width: '50%' });
  });

  it('sizes the scan from the padded bitmap, not the semantic system bounds', async () => {
    // The crop endpoint pads the system region before extracting the
    // bitmap. Laying the image out against the unpadded `region` clipped
    // the padding off the bottom and moved every overlay with it.
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, {
      systems: [
        {
          systemIndex: 0,
          leftMeasureIndexes: [0],
          rightMeasureIndexes: [0],
          cropUrl: 'systems/0/crop',
          region: [0, 0, 659, 361],
          cropRegion: [0, 0, 683, 385],
        },
      ],
    });

    const scan = await screen.findByAltText('Scan of system 1');
    expect(scan).toHaveAttribute('width', '683');
    expect(scan).toHaveAttribute('height', '385');
    // And never enlarged past its own pixels.
    expect(scan.parentElement).toHaveStyle({
      aspectRatio: String(683 / 385),
      width: 'min(100%, 683px)',
    });
  });

  it('falls back to the system region when a response predates cropRegion', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, {
      systems: [
        {
          systemIndex: 0,
          leftMeasureIndexes: [0],
          rightMeasureIndexes: [0],
          cropUrl: 'systems/0/crop',
          region: [0, 0, 659, 361],
        },
      ],
    });

    const scan = await screen.findByAltText('Scan of system 1');
    expect(scan).toHaveAttribute('width', '659');
    expect(scan).toHaveAttribute('height', '361');
  });

  it('collapses each pane on its own', async () => {
    // Four readings stacked in one row is more than a laptop shows at once.
    // Hiding the ones a given judgement does not rest on is what makes the
    // rest legible, so each hides independently of the others.
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, { systems: [croppedSystems[0]] });

    await screen.findByAltText('Scan of system 1');
    // Base, merged, candidate.
    await waitFor(() => expect(screen.getAllByTestId('pane-measures')).toHaveLength(3));

    await userEvent.click(screen.getByTestId('btn-toggle-pane-scan'));
    expect(screen.queryByAltText('Scan of system 1')).not.toBeInTheDocument();
    // Hiding the scan leaves the three score panes alone.
    expect(screen.getAllByTestId('pane-measures')).toHaveLength(3);

    await userEvent.click(screen.getByTestId('btn-toggle-pane-left'));
    await waitFor(() => expect(screen.getAllByTestId('pane-measures')).toHaveLength(2));

    // And each toggle says which state it is in, and comes back.
    expect(screen.getByTestId('btn-toggle-pane-scan')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByTestId('btn-toggle-pane-scan'));
    expect(await screen.findByAltText('Scan of system 1')).toBeInTheDocument();
    // The scan coming back does not bring the base reading back with it.
    expect(screen.getAllByTestId('pane-measures')).toHaveLength(2);
  });

  it('does not let a pointer resize the panes', async () => {
    /*
        Pane geometry follows the conflict under review: which bars each pane
        draws, and from those the band it clips to and the height it takes. When
        hovering decided that too, moving the pointer onto a Take control
        rescaled the music beside it -- and in Stacked, where the panes and
        gutters are one flow, a pane that grew pushed the control down and out
        from under the pointer, which fired the next hover.

        What the control would do is still shown, by the preview wash on the
        exact bars. Nothing here should move.
    */
    const calls: FetchCall[] = [];
    const wide: ScannerSystem[] = [
      {
        systemIndex: 0,
        leftMeasureIndexes: [0, 1, 2, 3, 4],
        rightMeasureIndexes: [0, 1, 2, 3, 4],
      },
    ];
    renderRows(
      [
        { ...grounded, blockIndex: 0, leftMeasureIndexes: [1], rightMeasureIndexes: [1] },
        {
          ...grounded,
          blockIndex: 1,
          leftMeasureIndexes: [3],
          rightMeasureIndexes: [3],
          contentSignature: 'scanner-block-content-v2:def',
        },
      ],
      calls,
      { systems: wide },
    );

    await screen.findByTestId('btn-take-down-1');
    const geometry = () =>
      screen.getAllByTestId('pane-measures').map((node) => ({
        bars: node.textContent,
        left: node.dataset.placeLeft,
        width: node.dataset.placeWidth,
        height: (node.parentElement as HTMLElement).style.height,
      }));
    await waitFor(() => expect(geometry()).toHaveLength(3));
    const resting = geometry();
    // Otherwise "unchanged" would be a statement about nothing.
    expect(resting.every((pane) => pane.bars && pane.bars.length > 0)).toBe(true);

    for (const control of ['btn-take-down-1', 'btn-take-up-1', 'btn-take-down-0']) {
      fireEvent.mouseEnter(screen.getByTestId(control));
      expect(geometry(), control).toEqual(resting);
    }

    // And the hover did reach the row -- it is the preview and the description
    // that answer it, not a resize.
    expect(screen.getByTestId('difference-description')).toBeInTheDocument();
  });

  it('keeps the hover description below the controls that summon it', async () => {
    /*
        The description's height varies -- with the number of conflicts on the
        line, with how the prose wraps, and with whether there is one at all --
        and hovering a Take control is what fills it in. Above the row that was
        a feedback loop: the block appeared, everything below it moved, a
        neighbouring button slid under the stationary cursor and fired its own
        preview. Document order is the fix, so assert document order rather
        than any particular height.
    */
    for (const layout of ['horizontal', 'vertical'] as const) {
      const calls: FetchCall[] = [];
      const view = renderRows(twoDifferences, calls, {
        systems: croppedSystems,
        onlyBlockIndex: 0,
      });

      const take = await screen.findByTestId('btn-take-down-0');
      await userEvent.click(screen.getByTestId(`btn-layout-${layout}`));
      fireEvent.mouseEnter(screen.getByTestId('btn-take-down-0'));

      const description = screen.getByTestId('difference-description');
      const controls = screen.getAllByTestId(/^btn-take-(down|up)-/);
      // Otherwise the loop below asserts nothing.
      expect(controls.length, layout).toBeGreaterThan(1);
      for (const control of controls) {
        expect(
          control.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING,
          `${layout}: ${control.dataset.testid ?? control.textContent}`,
        ).toBeTruthy();
      }
      expect(take).toBeTruthy();
      view.unmount();
    }
  });

  it('moves the scan box to the conflict whose Take control is highlighted', async () => {
    const calls: FetchCall[] = [];
    const anotherOnFirstLine: ScannerRowRegion = {
      ...grounded,
      blockIndex: 2,
      leftMeasureIndexes: [0],
      rightMeasureIndexes: [0],
      contentSignature: 'scanner-block-content-v2:ghi',
      cropBoxes: [{ systemIndex: 0, left: 0.7, top: 0, width: 0.2, height: 1 }],
    };
    renderRows([twoDifferences[0], anotherOnFirstLine], calls, {
      systems: [croppedSystems[0]],
      onlyBlockIndex: 0,
    });

    expect(screen.queryAllByTestId('scan-difference-box')).toHaveLength(0);
    const firstTake = await screen.findByTestId('btn-take-down-0');
    fireEvent.mouseEnter(firstTake);
    expect((await screen.findAllByTestId('scan-difference-box'))[0]).toHaveAttribute(
      'data-block-index',
      '0',
    );
    fireEvent.mouseLeave(firstTake);
    expect(screen.getAllByTestId('scan-difference-box')[0]).toHaveAttribute(
      'data-block-index',
      '0',
    );
    fireEvent.mouseEnter(screen.getByTestId('btn-take-down-2'));
    const hovered = await screen.findAllByTestId('scan-difference-box');
    expect(hovered[0]).toHaveAttribute('data-block-index', '2');
    expect(hovered[0]).toHaveStyle({ left: '70%', width: '20%' });
  });

  it('says a scan crop is stale rather than showing a broken image', async () => {
    // The crop is signature-bound and the server refuses it once the job
    // moves on. An <img> cannot read that refusal, so it has to be said.
    const calls: FetchCall[] = [];
    renderRows(twoDifferences, calls, {
      systems: croppedSystems,
      onlyBlockIndex: 0,
    });

    const crop = await screen.findByAltText('Scan of system 1');
    fireEvent.error(crop);

    // Both copies go: it is one crop, shown twice.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent(/This scan crop is no longer current/);
    expect(screen.queryByAltText('Scan of system 1')).toBeNull();
    expect(screen.queryByAltText('Scan of system 1, repeated')).toBeNull();
  });
});

describe('the row gutter', () => {
  beforeEach(() => {
    mocked.loadWebMscore.mockReset();
    vi.unstubAllGlobals();
  });

  it('marks the events that did not match, not the whole bar', async () => {
    // A block names bars, and a bar is a coarse thing to point at. The
    // scanner aligns the two readings event by event, so the row can put
    // the mark on the note rather than around it.
    const calls: FetchCall[] = [];
    renderRows(
      [
        {
          ...grounded,
          symbolDifferences: [
            {
              leftMeasureIndex: 0,
              rightMeasureIndex: 0,
              leftEventIndexes: [2],
              rightEventIndexes: [2],
              leftEventCount: 4,
              rightEventCount: 4,
            },
          ],
        },
      ],
      calls,
    );

    fireEvent.mouseEnter(await screen.findByTestId('btn-take-down-0'));
    // One per pane that renders: both readings and the merged score.
    expect(await screen.findAllByTestId('symbol-highlight')).not.toHaveLength(0);
  });

  it('marks nothing when this drawing counts events differently', async () => {
    // The analysis counts events; the drawing knows where positions sit,
    // and nothing connects them but the ordering. When the totals disagree
    // the two are not counting the same thing, and a confident box on the
    // wrong note is worse than the bar-level mark the row already carries.
    const calls: FetchCall[] = [];
    renderRows(
      [
        {
          ...grounded,
          symbolDifferences: [
            {
              leftMeasureIndex: 0,
              rightMeasureIndex: 0,
              leftEventIndexes: [2],
              rightEventIndexes: [2],
              leftEventCount: 9,
              rightEventCount: 9,
            },
          ],
        },
      ],
      calls,
    );

    fireEvent.mouseEnter(await screen.findByTestId('btn-take-down-0'));
    expect(screen.queryAllByTestId('symbol-highlight')).toHaveLength(0);
  });

  it('points each arrow at the merged score between them', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, { sourceEngineId: 'transcoda' });

    // Across: right from the reading on the left, left from the one on the
    // right.
    expect((await screen.findByTestId('btn-take-down-0')).textContent).toContain('→');
    expect(screen.getByTestId('btn-take-up-0').textContent).toContain('←');

    // Stacked: down from the reading above, up from the reading below.
    await userEvent.click(screen.getByTestId('btn-layout-vertical'));
    expect(screen.getByTestId('btn-take-down-0').textContent).toContain('↓');
    expect(screen.getByTestId('btn-take-up-0').textContent).toContain('↑');
  });

  it('persists the candidate before treating it as the merged score source', async () => {
    const calls: Parameters<typeof renderRows>[1] = [];
    renderRows([grounded], calls, { present: false, sourceEngineId: undefined });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Transcoda' }));

    await waitFor(() =>
      expect(
        calls.some(
          (call) => call.method === 'POST' && new URL(call.url).pathname.endsWith('/merged/source'),
        ),
      ).toBe(true),
    );
    const post = calls.find(
      (call) => call.method === 'POST' && new URL(call.url).pathname.endsWith('/merged/source'),
    )!;
    expect(JSON.parse(String(post.body))).toMatchObject({ engineId: 'transcoda' });
  });

  it('switches to one row per matched part and offers a part-wide take', async () => {
    const calls: Parameters<typeof renderRows>[1] = [];
    const staffSystems: ScannerSystem[] = [
      {
        systemIndex: 0,
        region: [0, 0, 100, 100],
        leftMeasureIndexes: [0],
        rightMeasureIndexes: [0],
        staffRows: [
          {
            stablePartKey: 'violin',
            staffIndices: [0],
            region: [0, 0, 100, 45],
            leftPartIndex: 0,
            rightPartIndex: 0,
            leftMeasureIndexes: [0],
            rightMeasureIndexes: [0],
          },
          {
            stablePartKey: 'cello',
            staffIndices: [1],
            region: [0, 50, 100, 100],
            leftPartIndex: 1,
            rightPartIndex: 1,
            leftMeasureIndexes: [0],
            rightMeasureIndexes: [0],
          },
        ],
      },
    ];
    renderRows([{ ...grounded, stablePartKey: 'cello' }], calls, {
      systems: staffSystems,
      sourceEngineId: 'homr',
    });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('btn-rows-staff'));

    expect(await screen.findByText(/System 1 · part 1/)).toBeInTheDocument();
    expect(screen.getByText(/System 1 · part 2/)).toBeInTheDocument();
    expect(screen.getByTestId('btn-take-part-right-cello')).toBeInTheDocument();
  });

  it('skips a grounded conflict through the neutral persisted flag action', async () => {
    const calls: Parameters<typeof renderRows>[1] = [];
    renderRows([grounded], calls);
    const user = userEvent.setup();

    const skip = await screen.findByTestId('btn-flag-0');
    expect(skip).toHaveTextContent('Skip conflict');
    await user.click(skip);

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === 'POST' && new URL(call.url).pathname.endsWith('/merged/decisions/flag'),
        ),
      ).toBe(true),
    );
    const post = calls.find(
      (call) =>
        call.method === 'POST' && new URL(call.url).pathname.endsWith('/merged/decisions/flag'),
    )!;
    expect(JSON.parse(String(post.body))).toMatchObject({ flagged: true });
  });

  it('calls an active skip reopened and labels its merged bar skipped', async () => {
    const calls: Parameters<typeof renderRows>[1] = [];
    renderRows([grounded], calls, {
      decisions: [{ blockIndex: 0, flagged: true, measureIndexes: [0] }],
    });

    expect(await screen.findByTestId('btn-flag-0')).toHaveTextContent('Reopen conflict');
    expect(screen.getByTestId('merged-bar-state')).toHaveTextContent('bar 1: skipped');
  });

  it('takes only undecided page blocks and preserves explicit decisions', async () => {
    const calls: Parameters<typeof renderRows>[1] = [];
    renderRows([grounded, secondGrounded], calls, {
      sourceEngineId: 'homr',
      decisions: [{ blockIndex: 0, engineId: 'homr', measureIndexes: [0] }],
    });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('btn-take-page-right'));

    await waitFor(() => expect(calls.filter((call) => call.method === 'POST')).toHaveLength(1));
    expect(JSON.parse(String(calls.find((call) => call.method === 'POST')!.body))).toMatchObject({
      blockIndex: 1,
      engineId: 'transcoda',
    });
  });

  it('offers nothing for a difference with no proven place on the scan', async () => {
    // §7's rule, now taken literally: a decision without evidence is not
    // offered at all. It used to be drawn disabled, which is offering it
    // and then refusing — and a disabled control cannot be told apart from
    // one that is merely unavailable just now.
    const calls: FetchCall[] = [];
    renderRows([grounded, ungrounded], calls);

    await screen.findByTestId('btn-take-down-0');
    expect(screen.queryByTestId('btn-take-down-1')).toBeNull();
  });

  it('says which reading the merged bar already follows, and leaves it there', async () => {
    // Removing it made the pair asymmetric: after taking a bar from one
    // reading there was no control to take it back, so a decision could not
    // be undone from where it was made. Left in and disabled, it is also
    // the only thing on screen saying what the merged bar currently reads.
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, { sourceEngineId: 'homr' });

    const already = await screen.findByTestId('btn-take-down-0');
    expect(already).toBeDisabled();
    expect(already).toHaveAttribute('title', expect.stringContaining('already reads'));
    // The other side is the one that would change something.
    expect(screen.getByTestId('btn-take-up-0')).toBeEnabled();
  });

  it('turns the pair around once a decision has moved that bar', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, {
      sourceEngineId: 'homr',
      decisions: [{ blockIndex: 0, engineId: 'transcoda' }],
    });

    // The merged score now reads this block from Transcoda, so taking it
    // back from HOMR is the undo — and it is enabled.
    expect(await screen.findByTestId('btn-take-down-0')).toBeEnabled();
    expect(screen.getByTestId('btn-take-up-0')).toBeDisabled();
  });

  it('does not count a marking take as moving the notes', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, {
      sourceEngineId: 'homr',
      decisions: [{ blockIndex: 0, engineId: 'transcoda', markingsOnly: 'dynamics' }],
    });

    await screen.findByTestId('btn-take-up-0');
    expect(screen.getByTestId('btn-take-down-0')).toBeDisabled();
  });

  it('keeps showing what a take would replace until another Take is hovered', async () => {
    // Hover is a question — "which bars is this one?" — and the panes are
    // the only place it can be answered without words.
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, { sourceEngineId: 'transcoda' });

    const take = await screen.findByTestId('btn-take-down-0');
    expect(screen.queryAllByTestId('take-preview')).toHaveLength(0);

    fireEvent.mouseEnter(take);
    const previews = screen.getAllByTestId('take-preview');
    expect(previews.length).toBeGreaterThan(0);
    for (const preview of previews) {
      expect(preview.className).toContain('bg-amber-300/15');
      expect(preview.className).toContain('ring-amber-500/70');
      expect(preview.className).not.toContain('cyan');
    }

    fireEvent.mouseLeave(take);
    expect(screen.queryAllByTestId('take-preview')).toHaveLength(previews.length);
  });

  it('sends the decision to the scanner with the engine it takes from', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls, { sourceEngineId: 'homr' });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('btn-take-up-0'));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    const post = calls.find((call) => call.method === 'POST')!;
    const body = JSON.parse(String(post.body));
    // The lower gutter takes from the reading below it.
    expect(body).toMatchObject({
      blockIndex: 0,
      engineId: 'transcoda',
      contentSignature: 'scanner-block-content-v2:abc',
      revision: 1,
    });
  });

  it('says what a removal is, so a reviewer is not surprised by it', async () => {
    // A block one reading has no bars for removes them rather than replacing
    // them, and the count changes. Saying "take" alone would understate it.
    const calls: FetchCall[] = [];
    renderRows([{ ...grounded, rightMeasureIndexes: [] }], calls, { sourceEngineId: 'homr' });

    const up = await screen.findByTestId('btn-take-up-0');
    expect(up.textContent).toContain('remove');
  });

  it('offers dynamics and lyrics separately, and only where they exist', async () => {
    // Separate because they are separate judgements: a reviewer may trust
    // one engine's dynamics and the other's words. Gated on availability
    // because a control that would take nothing is worse than none — and a
    // difference class says the readings *disagree* about dynamics, not
    // which of them has any.
    const calls: FetchCall[] = [];
    renderRows(
      [
        {
          ...grounded,
          leftMarkings: { dynamics: true, lyrics: false },
          rightMarkings: { dynamics: false, lyrics: true },
        },
      ],
      calls,
    );

    await screen.findByTestId('btn-take-down-0');
    // HOMR above has dynamics but no lyrics.
    expect(screen.getByTestId('btn-take-down-dynamics-0')).toBeInTheDocument();
    expect(screen.queryByTestId('btn-take-down-lyrics-0')).not.toBeInTheDocument();
  });

  it('offers no marking control when neither reading has any', async () => {
    const calls: FetchCall[] = [];
    renderRows([grounded], calls);

    await screen.findByTestId('btn-take-down-0');
    expect(screen.queryByTestId('btn-take-down-dynamics-0')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-take-up-lyrics-0')).not.toBeInTheDocument();
  });

  it('draws the document a take produced, not the one it replaced', async () => {
    // The merged score's URL is pinned to the revision the caller holds, so
    // reloading from the state captured before the take fetched the
    // revision that had just been superseded — and the pane went on drawing
    // the bar the reviewer had just replaced. Every take looked like it did
    // nothing, while the server had recorded all of them.
    const calls: FetchCall[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), method: init?.method || 'GET', body: init?.body });
        if (init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              present: true,
              revision: 2,
              musicXmlUrl: '../merged/musicxml?revision=2',
              repairs: [],
            }),
            { status: 200 },
          );
        }
        return new Response(XML, { status: 200 });
      }),
    );
    const score = {
      saveSvg: vi.fn(async () => '<svg><g/></svg>'),
      measurePositions: vi.fn(async () => ({
        elements: [{ id: 0, x: 0, y: 0, sx: 100, sy: 40, page: 0 }],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      segmentPositions: vi.fn(async () => ({
        elements: [],
        events: [],
        pageSize: { width: 100, height: 40 },
      })),
      saveXml: vi.fn(async () => new TextEncoder().encode(XML)),
      relayout: vi.fn(async () => undefined),
      destroy: vi.fn(),
    };
    mocked.loadWebMscore.mockResolvedValue({
      load: vi.fn(async () => score),
    } as unknown as WebMscoreInstance);
    render(
      <ScannerSystemRows
        systems={systems}
        onlyBlockIndex={0}
        regions={[grounded]}
        leftXml={XML}
        rightXml={XML}
        leftLabel="HOMR"
        rightLabel="Transcoda"
        leftEngineId="homr"
        rightEngineId="transcoda"
        merged={{
          present: true,
          sourceEngineId: 'homr',
          revision: 1,
          edited: false,
          basisSignature: 'basis',
          stale: false,
          url: '../merged',
          musicXmlUrl: '../merged/musicxml?revision=1',
        }}
        resolveUrl={(relative) => new URL(relative, REGIONS_URL).toString()}
      />,
    );

    await userEvent.click(await screen.findByTestId('btn-take-up-0'));
    await waitFor(() => expect(screen.getByTestId('take-outcome')).toBeInTheDocument());

    const posted = calls.findIndex((call) => call.method === 'POST');
    expect(posted).toBeGreaterThanOrEqual(0);
    // The document is fetched again after the take, at the revision the
    // take produced.
    expect(calls.slice(posted).some((call) => call.url.includes('revision=2'))).toBe(true);
  });
  it('sends a marking take to its own route, naming the kind', async () => {
    const calls: FetchCall[] = [];
    renderRows([{ ...grounded, rightMarkings: { dynamics: true, lyrics: false } }], calls, {
      sourceEngineId: 'homr',
    });
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('btn-take-up-dynamics-0'));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    const post = calls.find((call) => call.method === 'POST')!;
    expect(new URL(post.url).pathname).toContain('/merged/decisions/markings');
    expect(JSON.parse(String(post.body))).toMatchObject({
      blockIndex: 0,
      engineId: 'transcoda',
      kind: 'dynamics',
    });
  });
});
