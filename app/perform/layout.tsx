import type { Metadata, Viewport } from 'next';

/** Performer mode is its own installable web app (scope /perform), full screen on iPad (standalone). */
export const metadata: Metadata = {
  title: 'OTS Perform',
  description: 'Perform from OTS scores: page turns, half pages, annotations, setlists.',
  manifest: '/perform/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'OTS Perform', statusBarStyle: 'black-translucent' },
  icons: { apple: '/perform/apple-touch-icon.png' },
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
