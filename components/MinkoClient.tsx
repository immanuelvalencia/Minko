'use client';

import dynamic from 'next/dynamic';

/**
 * The viewer touches WebGL, canvas and MediaRecorder, none of which exist on the
 * server, so it is loaded client-side only. `ssr: false` is not allowed in a
 * Server Component, which is why this thin client wrapper exists rather than the
 * page importing the viewer directly.
 */
const Minko = dynamic(() => import('./Minko'), {
  ssr: false,
  loading: () => (
    <div className="boot">
      <div className="boot-mark" />
      <p>Starting Minko…</p>
    </div>
  ),
});

export default function MinkoClient() {
  return <Minko />;
}
