import { getScoreArtifact, type ScoreArtifact } from '../score-artifacts';
import { getScoreOpsSession, type ScoreOpsSessionState } from './scoreops-session-store';

export type ServiceResult = {
  status: number;
  body: Record<string, unknown>;
};

export type ScoreContentResolution = {
  xml: string;
  artifact: ScoreArtifact | null;
  session: ScoreOpsSessionState | null;
  error?: ServiceResult;
};

export const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' ? value as Record<string, unknown> : null
);

export function readBoolean(camel: unknown, snake: unknown, fallback: boolean) {
  if (typeof camel === 'boolean') {
    return camel;
  }
  if (typeof snake === 'boolean') {
    return snake;
  }
  return fallback;
}

export function readContent(data: Record<string, unknown> | null): string {
  if (typeof data?.content === 'string' && data.content.trim()) {
    return data.content;
  }
  if (typeof data?.text === 'string' && data.text.trim()) {
    return data.text;
  }
  return '';
}

export function normalizeInputArtifactId(data: Record<string, unknown> | null): string {
  if (typeof data?.inputArtifactId === 'string' && data.inputArtifactId.trim()) {
    return data.inputArtifactId.trim();
  }
  if (typeof data?.input_artifact_id === 'string' && data.input_artifact_id.trim()) {
    return data.input_artifact_id.trim();
  }
  if (typeof data?.initialArtifactId === 'string' && data.initialArtifactId.trim()) {
    return data.initialArtifactId.trim();
  }
  if (typeof data?.initial_artifact_id === 'string' && data.initial_artifact_id.trim()) {
    return data.initial_artifact_id.trim();
  }
  return '';
}

export function normalizeScoreSessionId(data: Record<string, unknown> | null): string {
  if (typeof data?.scoreSessionId === 'string' && data.scoreSessionId.trim()) {
    return data.scoreSessionId.trim();
  }
  if (typeof data?.score_session_id === 'string' && data.score_session_id.trim()) {
    return data.score_session_id.trim();
  }
  return '';
}

export function looksLikeMusicXml(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('<') && (
    trimmed.includes('<score-partwise') || 
    trimmed.includes('<score-timewise') || 
    trimmed.includes('<?xml')
  );
}

export function errorResult(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
): ServiceResult {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...details,
      },
    },
  };
}

/**
 * Unified helper to resolve score content from multiple possible sources:
 * 1. Active ScoreOps Session (scoreSessionId)
 * 2. Stored Artifact (inputArtifactId)
 * 3. Direct Content (content/text string)
 */
export async function resolveScoreContent(body: unknown): Promise<ScoreContentResolution> {
  const data = asRecord(body);
  
  // 1. Resolve via Score Session
  const sessionId = normalizeScoreSessionId(data);
  if (sessionId) {
    const session = getScoreOpsSession(sessionId);
    if (!session) {
      return {
        xml: '',
        artifact: null,
        session: null,
        error: errorResult(404, 'session_not_found', `Score session ${sessionId} not found.`),
      };
    }
    
    // Revision check if baseRevision is provided
    const baseRevision = typeof data?.baseRevision === 'number' ? data.baseRevision : (typeof data?.base_revision === 'number' ? data.base_revision : undefined);
    if (baseRevision !== undefined && baseRevision !== session.revision) {
      return {
        xml: '',
        artifact: null,
        session: null,
        error: errorResult(409, 'stale_revision', `baseRevision=${baseRevision} is stale; latest is ${session.revision}`, {
          latestRevision: session.revision,
          scoreSessionId: session.scoreSessionId,
        }),
      };
    }
    
    return { xml: session.content, artifact: null, session };
  }

  // 2. Resolve via Artifact
  const artifactId = normalizeInputArtifactId(data);
  if (artifactId) {
    const artifact = await getScoreArtifact(artifactId);
    if (!artifact) {
      return {
        xml: '',
        artifact: null,
        session: null,
        error: errorResult(404, 'target_not_found', 'Input artifact not found.', { artifactId }),
      };
    }
    if (artifact.format !== 'musicxml') {
      return {
        xml: '',
        artifact: null,
        session: null,
        error: errorResult(400, 'invalid_request', 'Input artifact must be musicxml format.', {
          artifactId,
          format: artifact.format,
        }),
      };
    }
    return { xml: artifact.content, artifact, session: null };
  }

  // 3. Resolve via Direct Content
  const xml = readContent(data);
  if (!xml.trim()) {
    return {
      xml: '',
      artifact: null,
      session: null,
      error: errorResult(400, 'invalid_request', 'Missing score content, session, or input artifact.'),
    };
  }
  if (!looksLikeMusicXml(xml)) {
    return {
      xml: '',
      artifact: null,
      session: null,
      error: errorResult(400, 'invalid_request', 'Input does not look like MusicXML.'),
    };
  }
  
  return { xml, artifact: null, session: null };
}
