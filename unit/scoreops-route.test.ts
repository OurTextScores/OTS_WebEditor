import { describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  runMusicScoreOpsService: vi.fn(),
}));

vi.mock('../lib/music-services/scoreops-service', () => ({
  runMusicScoreOpsService: mocked.runMusicScoreOpsService,
}));

import { POST as openPOST } from '../app/api/music/scoreops/session/open/route';
import { POST as inspectPOST } from '../app/api/music/scoreops/inspect/route';
import { POST as applyPOST } from '../app/api/music/scoreops/apply/route';
import { POST as syncPOST } from '../app/api/music/scoreops/sync/route';

describe('scoreops routes', () => {
  it('forces open action for session open route', async () => {
    mocked.runMusicScoreOpsService.mockResolvedValue({
      status: 200,
      body: { ok: true, scoreSessionId: 'sess_1' },
    });

    const response = await openPOST(new Request('http://localhost/api/music/scoreops/session/open', {
      method: 'POST',
      body: JSON.stringify({ content: '<score-partwise />' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, scoreSessionId: 'sess_1' });
    expect(mocked.runMusicScoreOpsService).toHaveBeenCalledWith(
      { content: '<score-partwise />' },
      'open',
    );
  });

  it('forces inspect action for inspect route', async () => {
    mocked.runMusicScoreOpsService.mockResolvedValue({
      status: 200,
      body: { ok: true, revision: 1 },
    });

    const response = await inspectPOST(new Request('http://localhost/api/music/scoreops/inspect', {
      method: 'POST',
      body: JSON.stringify({ scoreSessionId: 'sess_1' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, revision: 1 });
    expect(mocked.runMusicScoreOpsService).toHaveBeenCalledWith(
      { scoreSessionId: 'sess_1' },
      'inspect',
    );
  });

  it('forces apply action for apply route', async () => {
    mocked.runMusicScoreOpsService.mockResolvedValue({
      status: 422,
      body: { ok: false, error: { code: 'execution_failure' } },
    });

    const response = await applyPOST(new Request('http://localhost/api/music/scoreops/apply', {
      method: 'POST',
      body: JSON.stringify({ scoreSessionId: 'sess_1', ops: [] }),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
    expect(mocked.runMusicScoreOpsService).toHaveBeenCalledWith(
      { scoreSessionId: 'sess_1', ops: [] },
      'apply',
    );
  });

  it('forces sync action for sync route', async () => {
    mocked.runMusicScoreOpsService.mockResolvedValue({
      status: 200,
      body: { ok: true, newRevision: 2 },
    });

    const response = await syncPOST(new Request('http://localhost/api/music/scoreops/sync', {
      method: 'POST',
      body: JSON.stringify({ scoreSessionId: 'sess_1', content: '<score-partwise />' }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, newRevision: 2 });
    expect(mocked.runMusicScoreOpsService).toHaveBeenCalledWith(
      { scoreSessionId: 'sess_1', content: '<score-partwise />' },
      'sync',
    );
  });
});
