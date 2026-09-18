import type { Metadata, Viewport } from 'next';
import './globals.css';
import './site.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://minko-viewer.vercel.app'),
  title: 'Minko',
  description:
    'Explore motion as it unfolds through time. Minko turns video into a navigable width × height × time frame stack.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07080c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
