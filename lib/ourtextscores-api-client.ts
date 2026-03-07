import { getScoreEditorApiBase } from './score-editor-api-client';

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');
const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);

const SCORE_EDITOR_OTS_API_BASE = trimTrailingSlashes((process.env.NEXT_PUBLIC_SCORE_EDITOR_OTS_API_BASE || '').trim());

export type SourceHistoryBranch = {
    name: string;
    policy: 'public' | 'owner_approval';
    ownerUserId?: string;
    ownerUsername?: string;
    baseRevisionId?: string;
    headRevisionId?: string;
    headSequenceNumber?: number;
    commitCount: number;
    empty: boolean;
};

export type SourceHistoryRevision = {
    revisionId: string;
    sequenceNumber: number;
    createdAt: string;
    createdBy: string;
    createdByUsername?: string;
    changeSummary?: string;
    branchName: string;
    fossilBranch?: string;
    fossilArtifactId?: string;
    status: 'approved' | 'pending_approval' | 'rejected' | 'withdrawn';
    canonicalXmlAvailable: boolean;
    manifestAvailable: boolean;
    isBranchHead: boolean;
};

export type SourceHistoryResponse = {
    source: {
        workId: string;
        sourceId: string;
        label: string;
        sourceType: string;
        workTitle?: string;
        composer?: string;
        defaultBranch: 'trunk';
    };
    viewer: {
        authenticated: boolean;
        canCreateBranch: boolean;
        canCommitToSelectedBranch: boolean;
    };
    selectedBranch: SourceHistoryBranch;
    branches: SourceHistoryBranch[];
    revisions: SourceHistoryRevision[];
    nextCursor?: string | null;
};

export type CreateSourceBranchRequest = {
    name: string;
    policy: 'public' | 'owner_approval';
    ownerUserId?: string;
    baseRevisionId?: string;
};

const stripKnownApiPrefix = (path: string) => (
    ensureLeadingSlash(path).replace(/^\/api\/score-editor\/ots(?=\/|$)/, '')
);

export const getOurTextScoresApiBase = () => {
    if (SCORE_EDITOR_OTS_API_BASE) {
        return SCORE_EDITOR_OTS_API_BASE;
    }
    const scoreEditorApiBase = getScoreEditorApiBase();
    if (scoreEditorApiBase) {
        return `${scoreEditorApiBase}/ots`;
    }
    return '/api/score-editor/ots';
};

export const resolveOurTextScoresApiPath = (path: string) => (
    `${getOurTextScoresApiBase()}${stripKnownApiPrefix(path)}`
);

const readJsonResponse = async <T>(response: Response): Promise<T> => {
    const payload = await response.text();
    let data: unknown = null;
    if (payload) {
        try {
            data = JSON.parse(payload);
        } catch {
            data = payload;
        }
    }

    if (!response.ok) {
        const message = typeof data === 'string'
            ? data
            : (data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string')
                ? (data as any).error
                : `Request failed with status ${response.status}`;
        throw new Error(message);
    }

    return data as T;
};

const buildHistoryQuery = (input?: { branch?: string; limit?: number; cursor?: string }) => {
    const params = new URLSearchParams();
    if (input?.branch?.trim()) {
        params.set('branch', input.branch.trim());
    }
    if (typeof input?.limit === 'number' && Number.isFinite(input.limit)) {
        params.set('limit', String(input.limit));
    }
    if (input?.cursor?.trim()) {
        params.set('cursor', input.cursor.trim());
    }
    const query = params.toString();
    return query ? `?${query}` : '';
};

export const getSourceHistory = async (input: {
    workId: string;
    sourceId: string;
    branch?: string;
    limit?: number;
    cursor?: string;
    signal?: AbortSignal;
}): Promise<SourceHistoryResponse> => {
    const path = resolveOurTextScoresApiPath(
        `/works/${encodeURIComponent(input.workId)}/sources/${encodeURIComponent(input.sourceId)}/history${buildHistoryQuery(input)}`
    );
    const response = await fetch(path, {
        method: 'GET',
        cache: 'no-store',
        signal: input.signal,
    });
    return readJsonResponse<SourceHistoryResponse>(response);
};

export const createSourceBranch = async (input: {
    workId: string;
    sourceId: string;
    request: CreateSourceBranchRequest;
    signal?: AbortSignal;
}) => {
    const response = await fetch(
        resolveOurTextScoresApiPath(`/works/${encodeURIComponent(input.workId)}/sources/${encodeURIComponent(input.sourceId)}/branches`),
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input.request),
            signal: input.signal,
        }
    );
    return readJsonResponse<{ branch: SourceHistoryBranch }>(response);
};

export const commitSourceRevision = async (input: {
    workId: string;
    sourceId: string;
    body: FormData;
    signal?: AbortSignal;
}) => {
    const response = await fetch(
        resolveOurTextScoresApiPath(`/works/${encodeURIComponent(input.workId)}/sources/${encodeURIComponent(input.sourceId)}/revisions`),
        {
            method: 'POST',
            body: input.body,
            signal: input.signal,
        }
    );
    return readJsonResponse<{
        workId: string;
        sourceId: string;
        revisionId: string;
        status: 'accepted' | 'pending';
        message: string;
    }>(response);
};

export const getSourceTextDiff = async (input: {
    workId: string;
    sourceId: string;
    revA: string;
    revB: string;
    file: 'canonical' | 'xml' | 'manifest' | 'json';
    signal?: AbortSignal;
}) => {
    const params = new URLSearchParams({
        revA: input.revA,
        revB: input.revB,
        file: input.file,
    });
    const response = await fetch(
        resolveOurTextScoresApiPath(`/works/${encodeURIComponent(input.workId)}/sources/${encodeURIComponent(input.sourceId)}/textdiff?${params.toString()}`),
        {
            method: 'GET',
            cache: 'no-store',
            signal: input.signal,
        }
    );
    if (!response.ok) {
        throw new Error(await response.text() || `Request failed with status ${response.status}`);
    }
    return response.text();
};

export const buildSourceCanonicalXmlUrl = (input: {
    workId: string;
    sourceId: string;
    revisionId?: string;
}) => {
    const params = new URLSearchParams();
    if (input.revisionId?.trim()) {
        params.set('r', input.revisionId.trim());
    }
    const query = params.toString();
    return resolveOurTextScoresApiPath(
        `/works/${encodeURIComponent(input.workId)}/sources/${encodeURIComponent(input.sourceId)}/canonical.xml${query ? `?${query}` : ''}`
    );
};

export const getSourceCanonicalXml = async (input: {
    workId: string;
    sourceId: string;
    revisionId?: string;
    signal?: AbortSignal;
}) => {
    const response = await fetch(buildSourceCanonicalXmlUrl(input), {
        method: 'GET',
        cache: 'no-store',
        signal: input.signal,
    });
    if (!response.ok) {
        throw new Error(await response.text() || `Request failed with status ${response.status}`);
    }
    return response.text();
};
