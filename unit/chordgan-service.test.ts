import { describe, expect, it } from 'vitest';
import {
  runChordGanOptionsService,
  runChordGanTransferService,
  runChordGanTransferStreamService,
} from '../lib/music-services/chordgan-service';

describe('chordgan services (phase 0 scaffold)', () => {
  it('returns static options for huggingface-space backend', async () => {
    const result = await runChordGanOptionsService({
      backend: 'huggingface-space',
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      specialist: 'chordgan',
      backend: 'huggingface-space',
      phase: 'phase0',
      capabilities: {
        dryRunOnly: true,
      },
    });
    expect(Array.isArray((result.body.options as { styles?: unknown[] })?.styles)).toBe(true);
  });

  it('rejects transfer requests without a style', async () => {
    const result = await runChordGanTransferService({
      backend: 'huggingface-space',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      dryRun: true,
    });

    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Missing style for ChordGAN transfer.',
      },
    });
  });

  it('rejects non-dry-run transfer requests in phase 0', async () => {
    const result = await runChordGanTransferService({
      backend: 'huggingface-space',
      style: 'jazz',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      dryRun: false,
    });

    expect(result.status).toBe(501);
    expect(result.body).toMatchObject({
      ok: false,
      error: {
        code: 'not_implemented',
      },
    });
  });

  it('returns dry-run request payload when transfer request is valid', async () => {
    const result = await runChordGanTransferService({
      backend: 'huggingface-space',
      style: 'classical',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      includeMidi: true,
      includeMusicXml: true,
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      ready: true,
      specialist: 'chordgan',
      backend: 'huggingface-space',
      phase: 'phase0',
      dryRun: true,
      generation: null,
    });
    expect((result.body.request as { style?: string })?.style).toBe('classical');
  });

  it('returns stream events for valid dry-run requests', async () => {
    const result = await runChordGanTransferStreamService({
      backend: 'huggingface-space',
      style: 'pop',
      content: '<score-partwise version="3.1"></score-partwise>',
      inputFormat: 'musicxml',
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(Array.isArray(result.events)).toBe(true);
    expect(result.events?.map((event) => event.event)).toEqual(['ready', 'status', 'result']);
  });
});

