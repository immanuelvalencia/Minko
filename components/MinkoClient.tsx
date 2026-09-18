'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

function playOpeningTone() {
  if (!window.AudioContext) return;
  const audio = new AudioContext();
  let started = false;
  // Audible autoplay may be blocked. Close the suspended context instead of
  // leaving a pending sound that could unexpectedly play on a later click.
  const blockedTimer = window.setTimeout(() => {
    if (!started) void audio.close().catch(() => {});
  }, 350);
  void audio.resume().then(() => {
    if (audio.state !== 'running') return;
    started = true;
    window.clearTimeout(blockedTimer);
    const start = audio.currentTime;
    const master = audio.createGain();
    master.gain.value = 0.12;
    master.connect(audio.destination);

    [220, 329.63, 440].forEach((frequency, index) => {
      const at = start + index * 0.16;
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.015, at + 0.7);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(0.25, at + 0.08);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
      oscillator.connect(envelope).connect(master);
      oscillator.start(at);
      oscillator.stop(at + 0.92);
    });
    window.setTimeout(() => void audio.close().catch(() => {}), 1600);
  }).catch(() => {
    window.clearTimeout(blockedTimer);
    void audio.close().catch(() => {});
  });
}

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
  const [appReady, setAppReady] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [entered, setEntered] = useState(false);
  const exitTimer = useRef<number | null>(null);
  const transitionStarted = useRef(false);
  const onReady = useCallback(() => setAppReady(true), []);

  useEffect(() => {
    const timer = window.setTimeout(() => setIntroReady(true), 1200);
    const fallback = window.setTimeout(() => setSlowLoad(true), 8000);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(fallback);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, []);

  const canEnter = introReady && (appReady || slowLoad);

  useEffect(() => {
    if (!canEnter || transitionStarted.current) return;
    transitionStarted.current = true;
    playOpeningTone();
    setLeaving(true);
    exitTimer.current = window.setTimeout(() => setEntered(true), 520);
  }, [canEnter]);

  return (
    <div className="minko-root">
      <div className="minko-shell" inert={!entered} aria-hidden={!entered}>
        <Minko onReady={onReady} />
      </div>
      {!entered && (
        <div className={`intro-screen${leaving ? ' intro-leaving' : ''}`} role="status" aria-labelledby="introTitle">
          <div className="intro-ambient" aria-hidden="true">
            <div className="intro-grid" />
            <div className="intro-halo" />
            <div className="intro-frame intro-frame-back" />
            <div className="intro-frame intro-frame-mid" />
            <div className="intro-frame intro-frame-front" />
            <span className="intro-streak intro-streak-one" />
            <span className="intro-streak intro-streak-two" />
          </div>
          <div className="intro-content">
            <svg className="intro-mark brand-mark" viewBox="0 0 32 24" aria-hidden="true">
              <rect x="1" y="5" width="17" height="12" rx="1.5" opacity=".28" />
              <rect x="5" y="6.5" width="17" height="12" rx="1.5" opacity=".55" />
              <rect x="9" y="8" width="17" height="12" rx="1.5" />
            </svg>
            <p className="intro-eyebrow">WIDTH × HEIGHT × TIME</p>
            <h1 id="introTitle">Minko</h1>
            <p className="intro-tagline">See motion beyond the frame.</p>
            <div className="intro-progress" aria-label={canEnter ? 'Ready' : 'Loading Minko'}>
              <span className={canEnter ? 'intro-progress-ready' : ''} />
            </div>
            <p className="intro-status" aria-live="polite">{appReady && introReady ? 'Ready to explore' : slowLoad ? 'Opening Minko…' : 'Preparing your workspace…'}</p>
          </div>
          <p className="intro-footer">A SPATIAL VIEW OF TIME</p>
        </div>
      )}
    </div>
  );
}
