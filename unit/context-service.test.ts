import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  createScoreArtifact: vi.fn(),
  getScoreArtifact: vi.fn(),
  summarizeScoreArtifact: vi.fn((artifact: { id: string; format: string }) => ({
    id: artifact.id,
    format: artifact.format,
  })),
}));

vi.mock('../lib/score-artifacts', () => ({
  createScoreArtifact: mocked.createScoreArtifact,
  getScoreArtifact: mocked.getScoreArtifact,
  summarizeScoreArtifact: mocked.summarizeScoreArtifact,
}));

import { MusicServiceError } from '../lib/music-services/errors';
import { runMusicContextService } from '../lib/music-services/context-service';

type ContextResponse = {
  context: {
    measureRange: {
      results: Array<{ partId: string; measureNumber: string }>;
    };
    searchHits: {
      results: unknown[];
    };
    fullXml: null | { truncated: boolean };
  };
};

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1"><note><pitch><step>C</step></pitch></note></measure>
    <measure number="2"><note><pitch><step>D</step></pitch></note></measure>
    <measure number="3"><note><pitch><step>E</step></pitch></note></measure>
  </part>
</score-partwise>`;

describe('runMusicContextService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws a 400 error for invalid measure ranges', async () => {
    await expect(
      runMusicContextService({
        content: SAMPLE_XML,
        measureStart: 4,
        measureEnd: 2,
      }),
    ).rejects.toMatchObject<Partial<MusicServiceError>>({
      status: 400,
    });
  });

  it('throws a 400 error for non-MusicXML source artifacts', async () => {
    mocked.getScoreArtifact.mockResolvedValue({
      id: 'a1',
      format: 'abc',
      content: 'X:1\nM:4/4\nK:C\nCDEF|',
    });

    await expect(
      runMusicContextService({
        inputArtifactId: 'a1',
      }),
    ).rejects.toMatchObject<Partial<MusicServiceError>>({
      status: 400,
    });
  });

  it('extracts measure-range and search-hit snippets from MusicXML', async () => {
    const result = await runMusicContextService({
      content: SAMPLE_XML,
      persistArtifact: false,
      measureStart: 2,
      measureEnd: 2,
      query: ['<step>D</step>'],
      includeFullXml: false,
    });

    expect(result.status).toBe(200);
    expect(result.body.inputArtifactId).toBeNull();
    expect(result.body).toMatchObject({
      strategy: 'musicxml-primary',
      context: {
        format: 'musicxml',
        measureRange: {
          start: 2,
          end: 2,
        },
      },
    });

    const context = (result.body as ContextResponse).context;
    expect(context.measureRange.results).toHaveLength(1);
    expect(context.measureRange.results[0]).toMatchObject({
      partId: 'P1',
      measureNumber: '2',
    });
    expect(context.searchHits.results.length).toBeGreaterThan(0);
    expect(context.fullXml).toBeNull();
  });

  it('persists an input artifact by default and can return truncated full xml', async () => {
    mocked.createScoreArtifact.mockResolvedValue({
      id: 'ctx-input-1',
      format: 'musicxml',
      content: SAMPLE_XML,
    });

    const result = await runMusicContextService({
      content: SAMPLE_XML,
      includeFullXml: true,
      maxChars: 80,
    });

    expect(mocked.createScoreArtifact).toHaveBeenCalledTimes(1);
    expect(result.body).toMatchObject({
      inputArtifactId: 'ctx-input-1',
      inputArtifact: {
        id: 'ctx-input-1',
        format: 'musicxml',
      },
    });

    const context = (result.body as ContextResponse).context;
    expect(context.fullXml).toBeTruthy();
    expect(context.fullXml.truncated).toBe(true);
  });

  it('includes source context when provided directly', async () => {
    const result = await runMusicContextService({
      content: SAMPLE_XML,
      launchContext: {
        source: 'ourtextscores',
        workId: '12345',
        sourceId: 'source-1',
        revisionId: 'rev-9',
        workTitle: 'Prelude in C',
        composer: 'J.S. Bach',
        imslpUrl: 'https://imslp.org/wiki/Test_Work',
      },
      includeFullXml: false,
    });

    expect(result.status).toBe(200);
    expect((result.body as any).context.sourceContext).toMatchObject({
      source: 'ourtextscores',
      workId: '12345',
      sourceId: 'source-1',
      revisionId: 'rev-9',
      workTitle: 'Prelude in C',
      composer: 'J.S. Bach',
      imslpUrl: 'https://imslp.org/wiki/Test_Work',
    });
  });
});
