'use client';

import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { NoticeHost } from '@/components/shell/notices';

// Dynamically import ScoreEditor to avoid SSR issues with WASM/window
const ScoreEditor = dynamic(() => import('@/components/ScoreEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-xl text-gray-500">Loading Editor...</div>
    </div>
  ),
});

const EmbeddedScorePlayer = dynamic(() => import('@/components/score-player/EmbeddedScorePlayer'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-600">
      Loading player…
    </div>
  ),
});

function AppContent() {
  const searchParams = useSearchParams();
  const hasCompareMode = Boolean(
    (searchParams.get('compareLeft') && searchParams.get('compareRight')) ||
    searchParams.get('reviewScore'),
  );
  const embedMode = searchParams.get('embed');
  const showPlayer = Boolean(
    searchParams.get('score') && !hasCompareMode && (embedMode === 'player' || embedMode === '1'),
  );

  return (
    <main className="min-h-screen bg-white">
      {showPlayer ? <EmbeddedScorePlayer /> : <ScoreEditor />}
      <NoticeHost />
    </main>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-slate-100 text-slate-600">
          Loading…
        </div>
      }
    >
      <AppContent />
    </Suspense>
  );
}
