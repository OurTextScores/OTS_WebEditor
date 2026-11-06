'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { registerPerformWorker } from '@/components/performer/platform/serviceWorker';

// The engine needs the browser (WASM, workers): no server rendering
const PerformerView = dynamic(() => import('@/components/performer').then((m) => m.PerformerView), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>
  ),
});
const PerformerLibrary = dynamic(
  () => import('@/components/performer').then((m) => m.PerformerLibrary),
  { ssr: false },
);
const SetlistPerformer = dynamic(
  () => import('@/components/performer').then((m) => m.SetlistPerformer),
  { ssr: false },
);
const DeviceSelfTest = dynamic(
  () => import('@/components/performer').then((m) => m.DeviceSelfTest),
  {
    ssr: false,
  },
);

function Perform() {
  const params = useSearchParams();
  if (params.has('selftest')) return <DeviceSelfTest />;
  const setlist = params.get('setlist');
  if (setlist)
    return <SetlistPerformer setlistId={setlist} item={Number(params.get('item') ?? 0) || 0} />;
  const score = params.get('score');
  if (!score) return <PerformerLibrary />;
  // A different score starts the view afresh
  return <PerformerView key={score ?? ''} scoreUrl={score} />;
}

/**
 * Performer mode: the library at `/perform`, a score at `/perform?score=<url>`, a setlist's piece at
 * `/perform?setlist=<id>&item=<n>`, and the device self-test at `/perform?selftest`
 * (docs/private/PERFORMER_MODE_IMPLEMENTATION_PLAN_2026-11-05.md). Every performer view stays at this path: the
 * engine's worker resolves its WASM and data relative to the page, so a nested route (/perform/x) cannot load it.
 */
export default function PerformPage() {
  // Offline: the perform app's service worker (production builds)
  useEffect(() => {
    void registerPerformWorker();
  }, []);
  return (
    <Suspense fallback={null}>
      <Perform />
    </Suspense>
  );
}
