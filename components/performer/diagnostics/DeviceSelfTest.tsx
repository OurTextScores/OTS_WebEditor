'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../ui/Button';
import {
  engineRun,
  environment,
  fullscreen,
  storage,
  wakeLock,
  type CheckResult,
} from './selfTestChecks';

type KeyEntry = { key: string; code: string; focused: string; at: number };
type PointerSummary = {
  pointerTypes: string[];
  maxPressure: number;
  maxTiltX: number;
  coalesced: number | null;
  touchesWhilePen: number;
  events: number;
};

/** A large served score (&score= picks another). */
const LARGE_SCORE = '/test_scores/men-base.musicxml';

/**
 * The device self-test for performer mode (`/perform?selftest`): runs what it can by itself, guides the pedal and
 * Pencil checks, and gives a report to copy or share. For the one device session the plan has (Phase 6), and anyone
 * else with an iPad.
 */
export function DeviceSelfTest() {
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [keys, setKeys] = useState<KeyEntry[]>([]);
  const [pointer, setPointer] = useState<PointerSummary>({
    pointerTypes: [],
    maxPressure: 0,
    maxTiltX: 0,
    coalesced: null,
    touchesWhilePen: 0,
    events: 0,
  });
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const penDown = useRef(false);

  useEffect(() => {
    void (async () => {
      setChecks({
        environment: environment(),
        fullscreen: fullscreen(),
        wakeLock: await wakeLock(),
        storage: await storage(),
      });
    })();
    const onKey = (event: KeyboardEvent) => {
      const focused =
        document.activeElement && document.activeElement !== document.body
          ? document.activeElement.tagName
          : 'nothing';
      setKeys((list) => [
        ...list.slice(-19),
        { key: event.key, code: event.code, focused, at: Math.round(event.timeStamp) },
      ]);
      if (event.key.startsWith('Arrow') || event.key.startsWith('Page') || event.key === ' ')
        event.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const runEngine = async () => {
    setRunning(true);
    const chosen = new URLSearchParams(window.location.search).get('score');
    const result = await engineRun(chosen || LARGE_SCORE);
    setChecks((previous) => ({ ...previous, engine: result }));
    setRunning(false);
  };

  const onPointer = (event: React.PointerEvent) => {
    const native = event.nativeEvent as PointerEvent & {
      getCoalescedEvents?: () => PointerEvent[];
    };
    if (event.type === 'pointerdown' && event.pointerType === 'pen') penDown.current = true;
    if (event.type === 'pointerup' && event.pointerType === 'pen') penDown.current = false;
    setPointer((previous) => ({
      pointerTypes: previous.pointerTypes.includes(event.pointerType)
        ? previous.pointerTypes
        : [...previous.pointerTypes, event.pointerType],
      maxPressure: Math.max(previous.maxPressure, event.pressure),
      maxTiltX: Math.max(previous.maxTiltX, Math.abs(event.tiltX)),
      coalesced:
        typeof native.getCoalescedEvents === 'function'
          ? (previous.coalesced ?? 0) + native.getCoalescedEvents().length
          : previous.coalesced,
      touchesWhilePen:
        previous.touchesWhilePen + (event.pointerType === 'touch' && penDown.current ? 1 : 0),
      events: previous.events + 1,
    }));
  };

  const report = JSON.stringify(
    { when: new Date().toISOString(), ...checks, pedalKeys: keys, pencil: pointer },
    null,
    2,
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const share = () =>
    void navigator.share?.({ title: 'OTS Perform self-test', text: report }).catch(() => {});

  return (
    <div
      className="min-h-screen bg-white p-4 text-sm text-slate-800"
      data-testid="self-test"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <h1 className="text-lg font-semibold">OTS Perform — device self-test</h1>
      <p className="mt-1 text-slate-600">
        Best run from the Home Screen (Share ▸ Add to Home Screen, then open it). It takes about
        five minutes.
      </p>

      <section className="mt-4">
        <h2 className="font-semibold">1. Automatic checks</h2>
        <p className="text-slate-600">
          Done when the page opened. Then run the large-score test (it may take a minute).
        </p>
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={running}
          data-testid="self-test-engine"
          onClick={() => void runEngine()}
        >
          {running ? 'Running…' : 'Run the large-score test'}
        </Button>
      </section>

      <section className="mt-4">
        <h2 className="font-semibold">2. Page turner (if you have one)</h2>
        <p className="text-slate-600">
          Press each pedal a few times. Each press should appear below.
        </p>
        <ul className="mt-2 font-mono text-xs" data-testid="self-test-keys">
          {keys.length === 0 && <li className="text-slate-500">No key yet</li>}
          {keys.map((entry, index) => (
            <li key={index}>
              {entry.key} ({entry.code}), focused: {entry.focused}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="font-semibold">3. Apple Pencil (if you have one)</h2>
        <p className="text-slate-600">
          Draw in the box with the Pencil, pressing lightly and then hard, with your hand resting on
          the screen.
        </p>
        <div
          data-testid="self-test-pad"
          className="mt-2 h-40 w-full touch-none rounded border border-dashed border-slate-400"
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerUp={onPointer}
        />
        <p className="mt-1 font-mono text-xs">
          types: {pointer.pointerTypes.join(', ') || '—'}; max pressure{' '}
          {pointer.maxPressure.toFixed(2)}; max tilt {pointer.maxTiltX}; coalesced{' '}
          {pointer.coalesced ?? 'n/a'}; touches while drawing {pointer.touchesWhilePen}
        </p>
      </section>

      <section className="mt-4">
        <h2 className="font-semibold">4. Send the report</h2>
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            data-testid="self-test-copy"
            onClick={() => void copy()}
          >
            {copied ? 'Copied' : 'Copy report'}
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button type="button" size="sm" onClick={share}>
              Share report
            </Button>
          )}
        </div>
        <pre
          className="mt-2 max-h-80 overflow-auto rounded bg-slate-50 p-2 text-xs"
          data-testid="self-test-report"
        >
          {report}
        </pre>
      </section>
    </div>
  );
}
