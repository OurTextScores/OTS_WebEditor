'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AI_EDIT_EFFORT_PROFILES, type AiEditEffort } from '../../lib/ai-edit-effort';
import { type AiEditProgressUpdate } from '../../lib/ai-edit-progress';

export type AiEditWorkKind = 'patch' | 'deep' | 'feedback';
export type AiEditPhase =
  'idle' | 'preparing' | 'requesting' | 'feedback' | 'succeeded' | 'failed' | 'cancelled';

export type AiEditRequestHandle = {
  requestId: number;
  kind: AiEditWorkKind;
  controller: AbortController;
  startedAt: number;
};

export type AiEditLifecycleState = {
  phase: AiEditPhase;
  kind: AiEditWorkKind | null;
  requestId: number | null;
  startedAt: number | null;
  message: string;
};

const IDLE_STATE: AiEditLifecycleState = {
  phase: 'idle',
  kind: null,
  requestId: null,
  startedAt: null,
  message: '',
};

const isActivePhase = (phase: AiEditPhase) =>
  phase === 'preparing' || phase === 'requesting' || phase === 'feedback';

export function useAiEditController(effort: AiEditEffort) {
  const [state, setState] = useState<AiEditLifecycleState>(IDLE_STATE);
  const [elapsedMs, setElapsedMs] = useState(0);
  const activeHandleRef = useRef<AiEditRequestHandle | null>(null);
  const requestIdRef = useRef(0);

  const begin = useCallback((kind: AiEditWorkKind, message: string): AiEditRequestHandle => {
    const previous = activeHandleRef.current;
    if (previous && !previous.controller.signal.aborted) {
      previous.controller.abort(
        new DOMException('Superseded by a new AI edit request.', 'AbortError'),
      );
    }
    const handle: AiEditRequestHandle = {
      requestId: requestIdRef.current + 1,
      kind,
      controller: new AbortController(),
      startedAt: Date.now(),
    };
    requestIdRef.current = handle.requestId;
    activeHandleRef.current = handle;
    setElapsedMs(0);
    setState({
      phase: kind === 'feedback' ? 'feedback' : 'preparing',
      kind,
      requestId: handle.requestId,
      startedAt: handle.startedAt,
      message,
    });
    return handle;
  }, []);

  const updateProgress = useCallback(
    (handle: AiEditRequestHandle, update: AiEditProgressUpdate) => {
      if (activeHandleRef.current?.requestId !== handle.requestId) {
        return;
      }
      setState((current) => ({
        ...current,
        phase: handle.kind === 'feedback' ? 'feedback' : 'requesting',
        message: update.message,
      }));
    },
    [],
  );

  const finish = useCallback(
    (handle: AiEditRequestHandle, outcome: 'success' | 'failure' | 'cancelled', message = '') => {
      if (activeHandleRef.current?.requestId !== handle.requestId) {
        return;
      }
      activeHandleRef.current = null;
      setElapsedMs(Math.max(0, Date.now() - handle.startedAt));
      setState({
        phase:
          outcome === 'success' ? 'succeeded' : outcome === 'cancelled' ? 'cancelled' : 'failed',
        kind: handle.kind,
        requestId: handle.requestId,
        startedAt: handle.startedAt,
        message,
      });
    },
    [],
  );

  const cancel = useCallback(() => {
    const handle = activeHandleRef.current;
    if (handle && !handle.controller.signal.aborted) {
      handle.controller.abort(new DOMException('Request cancelled by user.', 'AbortError'));
    }
  }, []);

  const reset = useCallback(() => {
    if (!activeHandleRef.current) {
      setElapsedMs(0);
      setState(IDLE_STATE);
    }
  }, []);

  const active = isActivePhase(state.phase);
  useEffect(() => {
    if (!active || state.startedAt === null) {
      return;
    }
    const updateElapsed = () => setElapsedMs(Math.max(0, Date.now() - state.startedAt!));
    const interval = window.setInterval(updateElapsed, 500);
    return () => window.clearInterval(interval);
  }, [active, state.startedAt]);

  useEffect(
    () => () => {
      const handle = activeHandleRef.current;
      if (handle && !handle.controller.signal.aborted) {
        handle.controller.abort(new DOMException('Editor closed.', 'AbortError'));
      }
    },
    [],
  );

  const budgetMs = useMemo(() => {
    if (!active || !state.kind) {
      return 0;
    }
    return state.kind === 'deep'
      ? AI_EDIT_EFFORT_PROFILES[effort].deep.budgetMs
      : AI_EDIT_EFFORT_PROFILES[effort].patch.budgetMs;
  }, [active, effort, state.kind]);

  return {
    state,
    active,
    activeKind: active ? state.kind : null,
    work:
      active && state.kind && state.startedAt !== null
        ? { kind: state.kind, startedAt: state.startedAt, message: state.message }
        : null,
    elapsedMs,
    budgetMs,
    begin,
    updateProgress,
    finish,
    cancel,
    reset,
  };
}
