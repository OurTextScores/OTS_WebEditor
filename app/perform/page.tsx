'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// The engine needs the browser (WASM, workers): no server rendering
const PerformerView = dynamic(() => import('@/components/performer').then((m) => m.PerformerView), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center text-slate-500">Loading…</div>
  ),
});
const DeviceSelfTest = dynamic(
  () => import('@/components/performer').then((m) => m.DeviceSelfTest),
  {
    ssr: false,
  },
);

function Perform() {
  const params = useSearchParams();
  if (params.has('selftest')) return <DeviceSelfTest />;
  const score = params.get('score');
  // A different score starts the view afresh
  return <PerformerView key={score ?? ''} scoreUrl={score} />;
}

/**
 * Performer mode: `/perform?score=<url>`, and the device self-test at `/perform?selftest`
 * (docs/private/PERFORMER_MODE_IMPLEMENTATION_PLAN_2026-11-05.md). Every performer view stays at this path: the
 * engine's worker resolves its WASM and data relative to the page, so a nested route (/perform/x) cannot load it.
 */
export default function PerformPage() {
  return (
    <Suspense fallback={null}>
      <Perform />
    </Suspense>
  );
}
