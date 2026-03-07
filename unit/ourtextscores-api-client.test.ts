import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('ourtextscores-api-client', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('derives the OTS API base from the score editor base when no explicit OTS base is configured', async () => {
        vi.stubEnv('NEXT_PUBLIC_SCORE_EDITOR_API_BASE', '/api/score-editor');
        vi.stubEnv('NEXT_PUBLIC_SCORE_EDITOR_OTS_API_BASE', '');

        const { getOurTextScoresApiBase, resolveOurTextScoresApiPath } = await import('../lib/ourtextscores-api-client');

        expect(getOurTextScoresApiBase()).toBe('/api/score-editor/ots');
        expect(resolveOurTextScoresApiPath('/works/10/sources/s1/history')).toBe('/api/score-editor/ots/works/10/sources/s1/history');
    });

    it('prefers an explicit OTS API base when configured', async () => {
        vi.stubEnv('NEXT_PUBLIC_SCORE_EDITOR_API_BASE', '/api/score-editor');
        vi.stubEnv('NEXT_PUBLIC_SCORE_EDITOR_OTS_API_BASE', 'https://editor.example.com/api/score-editor/ots/');

        const { getOurTextScoresApiBase, resolveOurTextScoresApiPath } = await import('../lib/ourtextscores-api-client');

        expect(getOurTextScoresApiBase()).toBe('https://editor.example.com/api/score-editor/ots');
        expect(resolveOurTextScoresApiPath('/api/score-editor/ots/works/10/sources/s1/history')).toBe('https://editor.example.com/api/score-editor/ots/works/10/sources/s1/history');
    });

    it('requests source history with forwarded branch query params', async () => {
        vi.stubEnv('NEXT_PUBLIC_SCORE_EDITOR_API_BASE', '/api/score-editor');
        vi.stubEnv('NEXT_PUBLIC_SCORE_EDITOR_OTS_API_BASE', '');
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => JSON.stringify({
                source: { workId: '10', sourceId: 's1', label: 'Score', sourceType: 'score', defaultBranch: 'trunk' },
                viewer: { authenticated: true, canCreateBranch: true, canCommitToSelectedBranch: true },
                selectedBranch: { name: 'trunk', policy: 'public', commitCount: 1, empty: false },
                branches: [{ name: 'trunk', policy: 'public', commitCount: 1, empty: false }],
                revisions: [],
                nextCursor: null,
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const { getSourceHistory } = await import('../lib/ourtextscores-api-client');
        const result = await getSourceHistory({ workId: '10', sourceId: 's1', branch: 'feature-a', limit: 25, cursor: 'abc' });

        expect(fetchMock).toHaveBeenCalledWith(
            '/api/score-editor/ots/works/10/sources/s1/history?branch=feature-a&limit=25&cursor=abc',
            expect.objectContaining({ method: 'GET', cache: 'no-store' }),
        );
        expect(result.source.workId).toBe('10');
    });
});
