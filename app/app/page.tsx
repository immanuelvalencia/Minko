import type { Metadata } from 'next';
import MinkoClient from '@/components/MinkoClient';

export const metadata: Metadata = {
  title: 'Minko App — Explore video through time',
  description: 'Open a video or try a demo, then explore its full frame stack in three dimensions.',
  alternates: { canonical: '/app' },
};

export default function AppPage() {
  return <MinkoClient />;
}
