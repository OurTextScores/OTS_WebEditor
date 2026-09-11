import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebMscoreInstance } from '../lib/webmscore-loader';

const mocked = vi.hoisted(() => ({ loadWebMscore: vi.fn() }));

vi.mock('../lib/webmscore-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/webmscore-loader')>()),
  loadWebMscore: mocked.loadWebMscore,
}));

import {
  useMergedScoreDocument,
  type MergedScoreState,
} from '../components/score-editor/compare/useMergedScoreDocument';

/**
 * The contract between the embed and the scanner, exercised without a browser,
 * a database, or WASM.
 *
 * Every bug this file covers was found the expensive way — a full embed build,
 * a Docker image rebuild and a Playwright sign-in, to learn that a fetch used
 * the wrong path. None of them needed any of that: they are all questions about
 * what request this hook makes and what it does with the answer.
 */

const XML =
  '<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"/></part-list>' +
  '<part id="P1"><measure number="1"><note/></measure></part></score-partwise>';

/** What MuseScore actually exports: the same score behind a DTD reference. */
const EXPORTED =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" ' +
  '"http://www.musicxml.org/dtds/partwise.dtd">\n' +
  '<score-partwise><part-list><score-part id="P1"/></part-list>' +
  '<part id="P1"><measure number="1"><note/></measure></part></score-partwise>';

/** Where the regions document lives; every relative URL resolves against it. */
const REGIONS_URL =
  'https://host/api/proxy/scanner/jobs/job-1/pages/1/comparison/regions?baseEngine=homr';

const resolveUrl = (relative: string) => new URL(relative, REGIONS_URL).toString();

const state = (overrides: Partial<MergedScoreState> = {}): MergedScoreState => ({
  present: false,
  revision: 0,
  edited: false,
  basisSignature: 'scanner-merged-basis-v1:abc',
  stale: false,
  url: '../merged',
  musicXmlUrl: '../merged/musicxml?revision=0',
  ...overrides,
});

/**
 * A score that returns its XML the way the real engine does across a realm
 * boundary: a typed array whose prototype is not this realm's `Uint8Array`.
 */
function fakeScore(xml = EXPORTED) {
  const bytes = new TextEncoder().encode(xml);
  return {
    saveXml: vi.fn(async () => bytes),
    relayout: vi.fn(async () => undefined),
    destroy: vi.fn(),
    setNoteEntryMode: vi.fn(async () => undefined),
  };
}

describe('the merged score contract', () => {
  let calls: Array<{
    url: string;
    method: string;
    body?: BodyInit | null;
    headers?: HeadersInit;
  }>;

  beforeEach(() => {
    calls = [];
    mocked.loadWebMscore.mockReset();
    mocked.loadWebMscore.mockResolvedValue({
      load: vi.fn(async () => fakeScore()),
    } as unknown as WebMscoreInstance);
  });

  afterEach(() => vi.unstubAllGlobals());

  const stubFetch = (responder: (url: string, init?: RequestInit) => Response) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method || 'GET',
          body: init?.body,
          headers: init?.headers,
        });
        return responder(url, init);
      }),
    );
  };

  const render = (
    initial: MergedScoreState,
    finding?: { kind: string; part?: string } | null,
  ) =>
    renderHook(() =>
      useMergedScoreDocument({
        state: initial,
        resolveUrl,
        prepare: (persisted) => ({
          xml: persisted ?? XML,
          baselineMeasures: 1,
        }),
        sourceEngineId: 'homr',
        finding,
      }),
    );

  it('reads the saved score from the page, not from under comparison/', async () => {
    // The regions document sits at `…/pages/1/comparison/regions`, so a
    // bare `merged/musicxml` resolves under `comparison/` — a route that
    // does not exist. The only symptom was a 404 inside the embed.
    stubFetch(() => new Response(XML, { status: 200 }));
    const { result } = render(state({ present: true, revision: 3 }));
    await act(async () => {
      await result.current.load();
    });

    expect(new URL(calls[0].url).pathname).toBe(
      '/api/proxy/scanner/jobs/job-1/pages/1/merged/musicxml',
    );
    await waitFor(() => expect(result.current.score).not.toBeNull());
    expect(result.current.error).toBeNull();
  });

  it('sends the score as a document body, not escaped into JSON', async () => {
    // A JSON envelope both inflates the payload and exceeds the server's
    // default 100 kB body limit on an ordinary page, which reaches the
    // reviewer as a 413 they can do nothing about.
    stubFetch(() => new Response(JSON.stringify({ present: true, revision: 1 }), { status: 200 }));
    const { result } = render(state({ present: false, revision: 0 }));
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.save();
    });

    const put = calls.find((call) => call.method === 'PUT');
    expect(put).toBeDefined();
    expect(new Headers(put!.headers).get('Content-Type')).toBe(
      'application/vnd.recordare.musicxml+xml',
    );
    expect(typeof put!.body).toBe('string');
    expect(put!.body).toContain('<score-partwise');
    // Nothing is wrapped: the body is the score itself.
    expect(() => JSON.parse(String(put!.body))).toThrow();
    // The scanner refuses any document carrying a DOCTYPE — an XXE control
    // it shares with provider-output validation. Sending MuseScore's export
    // unaltered made every save fail as "not usable MusicXML".
    expect(put!.body).not.toMatch(/<!DOCTYPE/i);

    const query = new URL(put!.url).searchParams;
    expect(query.get('sourceEngineId')).toBe('homr');
    expect(query.get('basisSignature')).toBe('scanner-merged-basis-v1:abc');
    expect(query.get('revision')).toBe('0');
  });

  it('saves the exact matched part and bar touched by hand', async () => {
    const score = {
      ...fakeScore(),
      selectionMeasureRange: vi.fn(async () => ({
        startMeasureIndex: 0,
        endMeasureIndex: 0,
      })),
    };
    mocked.loadWebMscore.mockResolvedValue({
      load: vi.fn(async () => score),
    } as unknown as WebMscoreInstance);
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            present: true,
            revision: 1,
            edited: true,
            editedMeasures: [{ stablePartKey: 'part-cello', measureIndex: 0 }],
          }),
          { status: 200 },
        ),
    );
    const { result } = render(state());
    await act(async () => result.current.load());
    await act(async () => {
      await result.current.mutate('edit cello', async () => undefined, {
        stablePartKey: 'part-cello',
      });
      await result.current.save();
    });

    const put = calls.find((call) => call.method === 'PUT')!;
    expect(JSON.parse(new URL(put.url).searchParams.get('editedMeasures') || '[]')).toEqual([
      { stablePartKey: 'part-cello', measureIndex: 0 },
    ]);
  });

  it('decodes what the engine returns across a realm boundary', async () => {
    // `saveXml` hands back bytes from the WASM realm, where
    // `value instanceof Uint8Array` is false. Decoding them naively threw
    // "parameter 1 is not of type 'ArrayBuffer'" and the save silently
    // did nothing.
    stubFetch(() => new Response(JSON.stringify({ present: true, revision: 1 }), { status: 200 }));
    const { result } = render(state());
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      const outcome = await result.current.save();
      expect(outcome.ok).toBe(true);
    });
    expect(result.current.error).toBeNull();
  });

  it('surfaces a refusal instead of pretending the save worked', async () => {
    stubFetch((url, init) =>
      init?.method === 'PUT'
        ? new Response(
            JSON.stringify({
              message: 'The engine readings changed since this merge was made',
            }),
            { status: 409 },
          )
        : new Response(XML, { status: 200 }),
    );
    const { result } = render(state({ present: true, revision: 2 }));
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      const outcome = await result.current.save();
      expect(outcome).toMatchObject({ ok: false, stale: true });
    });
    expect(result.current.error).toMatch(/readings changed/);
    // The reviewer still holds the only copy of their work.
    expect(result.current.dirty).toBe(false);
  });

  it("carries the reviewer's acceptance when they save against new readings", async () => {
    stubFetch(() => new Response(JSON.stringify({ present: true, revision: 3 }), { status: 200 }));
    const { result } = render(state({ present: true, revision: 2, stale: true }));
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.save({ acceptStale: true });
    });
    const put = calls.find((call) => call.method === 'PUT');
    expect(new URL(put!.url).searchParams.get('acceptStale')).toBe('true');
  });

  it('reports an edit, and keeps reporting it after a save', async () => {
    // An edited bar means both engines were wrong there. Once that is true
    // of a page it stays true, or phase E files hand work as an engine win.
    stubFetch(
      () =>
        new Response(JSON.stringify({ present: true, revision: 1, edited: true }), { status: 200 }),
    );
    const { result } = render(state());
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.mutate('edit', async () => undefined);
    });
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      await result.current.save();
    });
    expect(new URL(calls.find((c) => c.method === 'PUT')!.url).searchParams.get('edited')).toBe(
      'true',
    );
    expect(result.current.dirty).toBe(false);
    expect(result.current.state?.edited).toBe(true);
  });

  it('keeps an edit without being asked to', async () => {
    // A take is written to the page the moment it is made, so a button that
    // governed only hand edits persisted the two halves of the same review
    // by different rules — and the half needing a button was the half a
    // reviewer was most likely to lose.
    stubFetch(
      () =>
        new Response(JSON.stringify({ present: true, revision: 2, edited: true }), {
          status: 200,
        }),
    );
    const { result } = render(state());
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.mutate('edit', async () => undefined);
    });
    expect(result.current.dirty).toBe(true);
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);

    // No save() call anywhere: the pause after the edit is what saves it.
    await waitFor(() => expect(calls.some((call) => call.method === 'PUT')).toBe(true), {
      timeout: 4000,
    });
    await waitFor(() => expect(result.current.dirty).toBe(false));
  });

  it('does not save a selection, which changed nothing', async () => {
    stubFetch(() => new Response(XML, { status: 200 }));
    const { result } = render(state());
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.mutate('select', async () => undefined, { mutates: false });
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('does not call a selection an edit', async () => {
    // Selecting a bar changes nothing about the document. Counting it as an
    // edit would file an untouched merge as hand-corrected after a stray
    // click.
    stubFetch(() => new Response(XML, { status: 200 }));
    const { result } = render(state());
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.mutate('select', async () => undefined, { mutates: false });
    });
    expect(result.current.dirty).toBe(false);
  });

  it('discards through the same page-level route, quoting the revision', async () => {
    stubFetch((url) =>
      url.includes('musicxml')
        ? new Response(XML, { status: 200 })
        : new Response(JSON.stringify({ present: false, revision: 0 }), { status: 200 }),
    );
    const { result } = render(state({ present: true, revision: 4 }));
    await act(async () => {
      await result.current.discard();
    });
    const del = calls.find((call) => call.method === 'DELETE')!;
    expect(new URL(del.url).pathname).toBe('/api/proxy/scanner/jobs/job-1/pages/1/merged');
    expect(new URL(del.url).searchParams.get('revision')).toBe('4');
    expect(result.current.state?.present).toBe(false);
  });

  it('says so when the saved score cannot be read, rather than showing an engine', async () => {
    stubFetch(() => new Response('nope', { status: 404 }));
    const { result } = render(state({ present: true, revision: 1 }));
    await act(async () => {
      await result.current.load();
    });
    expect(result.current.error).toMatch(/could not be read \(404\)/);
    expect(result.current.score).toBeNull();
  });

  it('asks the scanner to splice, rather than splicing here', async () => {
    // The scanner holds both readings, the alignment and the safety rules.
    // A decision made in the browser would be a second implementation of
    // all three, and the one that disagreed would be this one.
    stubFetch((url, init) =>
      init?.method === 'POST'
        ? new Response(JSON.stringify({ present: true, revision: 5, repairs: [] }), {
            status: 200,
          })
        : new Response(XML, { status: 200 }),
    );
    const { result } = render(state({ present: true, revision: 4 }));
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      const outcome = await result.current.take({
        blockIndex: 2,
        contentSignature: 'scanner-block-content-v2:abc',
        engineId: 'transcoda',
        baseEngineId: 'homr',
        candidateEngineId: 'transcoda',
      });
      expect(outcome.ok).toBe(true);
    });

    const post = calls.find((call) => call.method === 'POST')!;
    expect(new URL(post.url).pathname).toBe(
      '/api/proxy/scanner/jobs/job-1/pages/1/merged/decisions',
    );
    const body = JSON.parse(String(post.body));
    expect(body).toMatchObject({
      blockIndex: 2,
      contentSignature: 'scanner-block-content-v2:abc',
      engineId: 'transcoda',
      baseEngine: 'homr',
      candidateEngine: 'transcoda',
      // The revision it was decided against, so a second tab cannot
      // overwrite the first.
      revision: 4,
    });
    expect(result.current.state?.revision).toBe(5);
  });

  it('flags a grounded block without changing the score in the browser', async () => {
    stubFetch((_url, init) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              present: true,
              revision: 5,
              decisions: [{ blockIndex: 2, flagged: true, measureIndexes: [0] }],
            }),
            { status: 200 },
          )
        : new Response(XML, { status: 200 }),
    );
    const { result } = render(state({ present: true, revision: 4 }));

    await act(async () => {
      const outcome = await result.current.flag({
        blockIndex: 2,
        contentSignature: 'sig',
        baseEngineId: 'homr',
        candidateEngineId: 'transcoda',
        flagged: true,
      });
      expect(outcome.ok).toBe(true);
    });

    const post = calls.find((call) => call.method === 'POST')!;
    expect(new URL(post.url).pathname).toBe(
      '/api/proxy/scanner/jobs/job-1/pages/1/merged/decisions/flag',
    );
    expect(JSON.parse(String(post.body))).toMatchObject({ flagged: true, revision: 4 });
    expect(result.current.state?.decisions?.[0].flagged).toBe(true);
  });

  it('takes a bulk scope in order and advances the revision for every block', async () => {
    let revision = 4;
    stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        revision += 1;
        return new Response(
          JSON.stringify({
            present: true,
            revision,
            musicXmlUrl: `../merged/musicxml?revision=${revision}`,
            repairs: [],
          }),
          { status: 200 },
        );
      }
      return new Response(XML, { status: 200 });
    });
    const { result } = render(state({ present: true, revision: 4 }));

    await act(async () => {
      const outcome = await result.current.takeMany(
        [2, 5].map((blockIndex) => ({
          blockIndex,
          contentSignature: `sig-${blockIndex}`,
          engineId: 'transcoda',
          baseEngineId: 'homr',
          candidateEngineId: 'transcoda',
        })),
      );
      expect(outcome.ok).toBe(true);
    });

    const posts = calls.filter((call) => call.method === 'POST');
    expect(posts.map((call) => JSON.parse(String(call.body)).revision)).toEqual([4, 5]);
    expect(result.current.state?.revision).toBe(6);
  });

  it('keeps and reports a successful bulk prefix when the next request fails', async () => {
    let posts = 0;
    stubFetch((_url, init) => {
      if (init?.method === 'POST') {
        posts += 1;
        if (posts === 2) throw new Error('connection lost');
        return new Response(
          JSON.stringify({
            present: true,
            revision: 5,
            musicXmlUrl: '../merged/musicxml?revision=5',
            repairs: [],
          }),
          { status: 200 },
        );
      }
      return new Response(XML, { status: 200 });
    });
    const { result } = render(state({ present: true, revision: 4 }));

    await act(async () => {
      const outcome = await result.current.takeMany(
        [2, 5].map((blockIndex) => ({
          blockIndex,
          contentSignature: `sig-${blockIndex}`,
          engineId: 'transcoda',
          baseEngineId: 'homr',
          candidateEngineId: 'transcoda',
        })),
      );
      expect(outcome).toMatchObject({
        ok: false,
        error: '1 difference taken; then stopped: connection lost',
      });
    });

    expect(result.current.state?.revision).toBe(5);
  });

  it('persists a non-default starting reading before the first decision', async () => {
    stubFetch((_url, init) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              present: true,
              revision: 1,
              sourceEngineId: 'transcoda',
              musicXmlUrl: '../merged/musicxml?revision=1',
            }),
            { status: 200 },
          )
        : new Response(XML, { status: 200 }),
    );
    const { result } = render(state());

    await act(async () => {
      const outcome = await result.current.chooseSource({
        engineId: 'transcoda',
        baseEngineId: 'homr',
        candidateEngineId: 'transcoda',
      });
      expect(outcome.ok).toBe(true);
    });

    const post = calls.find((call) => call.method === 'POST')!;
    expect(new URL(post.url).pathname).toBe('/api/proxy/scanner/jobs/job-1/pages/1/merged/source');
    expect(JSON.parse(String(post.body))).toMatchObject({
      engineId: 'transcoda',
      baseEngine: 'homr',
      candidateEngine: 'transcoda',
      revision: 0,
    });
    expect(result.current.state).toMatchObject({
      present: true,
      revision: 1,
      sourceEngineId: 'transcoda',
    });
  });

  it('saves a live hand edit before a server-side take reloads the document', async () => {
    stubFetch((_url, init) => {
      if (init?.method === 'PUT') {
        return new Response(
          JSON.stringify({
            present: true,
            revision: 5,
            edited: true,
            musicXmlUrl: '../merged/musicxml?revision=5',
          }),
          { status: 200 },
        );
      }
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            present: true,
            revision: 6,
            repairs: [],
            musicXmlUrl: '../merged/musicxml?revision=6',
          }),
          { status: 200 },
        );
      }
      return new Response(XML, { status: 200 });
    });
    const { result } = render(
      state({
        present: true,
        revision: 4,
        sourceEngineId: 'homr',
        musicXmlUrl: '../merged/musicxml?revision=4',
      }),
    );
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.mutate('edit', async () => undefined);
    });
    await act(async () => {
      const outcome = await result.current.take({
        blockIndex: 2,
        contentSignature: 'sig',
        engineId: 'transcoda',
        baseEngineId: 'homr',
        candidateEngineId: 'transcoda',
      });
      expect(outcome.ok).toBe(true);
    });

    const writes = calls.filter((call) => call.method === 'PUT' || call.method === 'POST');
    expect(writes.map((call) => call.method)).toEqual(['PUT', 'POST']);
    expect(JSON.parse(String(writes[1].body)).revision).toBe(5);
    expect(result.current.state).toMatchObject({ revision: 6, edited: true });
    expect(result.current.dirty).toBe(false);
  });

  it('surfaces a refusal with its reasons instead of a bare failure', async () => {
    // Refusals are the point of that route: the reviewer is told what about
    // this passage could not be moved.
    stubFetch((url, init) =>
      init?.method === 'POST'
        ? new Response(
            JSON.stringify({
              message: 'This passage cannot be taken from that reading',
              refusals: [{ code: 'tie-crosses-boundary', detail: 'A tie runs out of it.' }],
            }),
            { status: 409 },
          )
        : new Response(XML, { status: 200 }),
    );
    const { result } = render(state({ present: true, revision: 1 }));
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      const outcome = await result.current.take({
        blockIndex: 0,
        contentSignature: 'sig',
        engineId: 'transcoda',
        baseEngineId: 'homr',
        candidateEngineId: 'transcoda',
      });
      expect(outcome).toMatchObject({ ok: false });
      if (!outcome.ok) {
        expect(outcome.refusals?.[0].code).toBe('tie-crosses-boundary');
      }
    });
    expect(result.current.error).toMatch(/cannot be taken/);
    // The merged score is untouched, so nothing has to be undone.
    expect(result.current.state?.revision).toBe(1);
  });

  it('attributes every bar to the finding when opened from one', async () => {
    // The claim this carries: one engine flagged its own reading and a human agreed.
    // Without it the backend files the edit as a comparison edit, asserting that two
    // independent readings disagreed -- on a job where only one reading exists.
    mocked.loadWebMscore.mockResolvedValue({
      ready: Promise.resolve(),
      load: vi.fn(async () => fakeScore()),
    } as never);
    stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { result } = render(
      state({ editedMeasures: [{ measureIndex: 2, stablePartKey: 'P1' }] }),
      { kind: 'clef_profile_mismatch', part: 'cello' },
    );
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.save();
    });

    const query = new URL(calls.find((call) => call.method === 'PUT')!.url).searchParams;
    expect(JSON.parse(query.get('editedMeasures')!)).toEqual([
      { measureIndex: 2, stablePartKey: 'P1', source: 'finding' },
    ]);
    expect(query.get('findingKind')).toBe('clef_profile_mismatch');
    expect(query.get('findingPart')).toBe('cello');
  });

  it('sends no finding attribution for an ordinary merge save', async () => {
    // Absent means comparison, which is what every stored record already means.
    mocked.loadWebMscore.mockResolvedValue({
      ready: Promise.resolve(),
      load: vi.fn(async () => fakeScore()),
    } as never);
    stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { result } = render(
      state({ editedMeasures: [{ measureIndex: 2, stablePartKey: 'P1' }] }),
    );
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.save();
    });

    const query = new URL(calls.find((call) => call.method === 'PUT')!.url).searchParams;
    expect(JSON.parse(query.get('editedMeasures')!)).toEqual([
      { measureIndex: 2, stablePartKey: 'P1' },
    ]);
    expect(query.get('findingKind')).toBeNull();
    expect(query.get('findingPart')).toBeNull();
  });

  it('omits the part when the finding named none', async () => {
    // Six of the seventeen findings on the real job carried no part at all.
    mocked.loadWebMscore.mockResolvedValue({
      ready: Promise.resolve(),
      load: vi.fn(async () => fakeScore()),
    } as never);
    stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const { result } = render(state(), { kind: 'dangling_slur_start' });
    await act(async () => {
      await result.current.load();
    });
    await act(async () => {
      await result.current.save();
    });

    const query = new URL(calls.find((call) => call.method === 'PUT')!.url).searchParams;
    expect(query.get('findingKind')).toBe('dangling_slur_start');
    expect(query.get('findingPart')).toBeNull();
  });
});
