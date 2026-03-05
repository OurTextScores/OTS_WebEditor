import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runChordGanOptionsService: vi.fn(),
  runChordGanTransferService: vi.fn(),
  runChordGanTransferStreamService: vi.fn(),
}));

vi.mock('../lib/music-services/chordgan-service', () => ({
  runChordGanOptionsService: mocked.runChordGanOptionsService,
  runChordGanTransferService: mocked.runChordGanTransferService,
  runChordGanTransferStreamService: mocked.runChordGanTransferStreamService,
}));

import { POST as optionsPost } from '../app/api/music/chordgan/options/route';
import { POST as transferPost } from '../app/api/music/chordgan/transfer/route';
import { POST as transferStreamPost } from '../app/api/music/chordgan/transfer/stream/route';

describe('POST /api/music/chordgan/options route', () => {
  it('returns service payload and status', async () => {
    mocked.runChordGanOptionsService.mockResolvedValue({
      status: 200,
      body: { ok: true, specialist: 'chordgan' },
    });

    const response = await optionsPost(new Request('http://localhost/api/music/chordgan/options', {
      method: 'POST',
      body: JSON.stringify({ backend: 'huggingface-space' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ specialist: 'chordgan' });
  });
});

describe('POST /api/music/chordgan/transfer route', () => {
  it('returns service payload and status', async () => {
    mocked.runChordGanTransferService.mockResolvedValue({
      status: 200,
      body: { ready: true, specialist: 'chordgan', generation: null },
    });

    const response = await transferPost(new Request('http://localhost/api/music/chordgan/transfer', {
      method: 'POST',
      body: JSON.stringify({ style: 'jazz', dryRun: true }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ready: true,
      specialist: 'chordgan',
    });
  });
});

describe('POST /api/music/chordgan/transfer/stream route', () => {
  it('returns SSE payload when stream service succeeds', async () => {
    mocked.runChordGanTransferStreamService.mockResolvedValue({
      status: 200,
      events: [
        { event: 'ready', data: { specialist: 'chordgan' } },
        { event: 'result', data: { ready: true } },
      ],
    });

    const response = await transferStreamPost(new Request('http://localhost/api/music/chordgan/transfer/stream', {
      method: 'POST',
      body: JSON.stringify({ style: 'classical', dryRun: true }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('event: ready');
    expect(body).toContain('event: result');
  });

  it('returns json error when service reports non-200', async () => {
    mocked.runChordGanTransferStreamService.mockResolvedValue({
      status: 400,
      body: { ok: false, error: { code: 'invalid_request', message: 'bad request' } },
    });

    const response = await transferStreamPost(new Request('http://localhost/api/music/chordgan/transfer/stream', {
      method: 'POST',
      body: JSON.stringify({ dryRun: true }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'invalid_request',
      },
    });
  });
});

