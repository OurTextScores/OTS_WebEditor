import type { Metadata, Viewport } from 'next';

/** The embed build is a static export under /score-editor; metadata links are not basePath-prefixed by Next. */
const base = process.env.NEXT_PUBLIC_BUILD_MODE === 'embed' ? '/score-editor' : '';

/** Performer mode is its own installable web app (scope /perform), full screen on iPad (standalone). */
export const metadata: Metadata = {
  title: 'OTS Perform',
  description: 'Perform from OTS scores: page turns, half pages, annotations, setlists.',
  manifest: `${base}/perform/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'OTS Perform', statusBarStyle: 'black-translucent' },
  icons: { apple: `${base}/perform/apple-touch-icon.png` },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: 'white',
};

export default function PerformLayout({ children }: { children: React.ReactNode }) {
  return children;
}
