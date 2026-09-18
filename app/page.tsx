import type { Metadata } from 'next';
import Link from 'next/link';
import SiteShell from '@/components/SiteShell';
import { HeroArtwork, ProcessArtwork } from '@/components/SiteArtwork';

export const metadata: Metadata = {
  title: 'Minko — See motion beyond the frame',
  description: 'Turn a video into a navigable frame stack. Explore width, height, and time together in your browser.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <SiteShell>
      <main id="main-content">
        <section className="site-hero">
          <div className="site-wrap site-hero-grid">
            <div className="site-hero-copy">
              <p className="site-eyebrow"><span className="site-eyebrow-dot" /> VIDEO, SEEN DIFFERENTLY</p>
              <h1>See the shape<br />of <em>motion.</em></h1>
              <p className="site-hero-lead">A video is more than a sequence of still frames. Minko turns it into a navigable space, where width and height form the picture and depth reveals time.</p>
              <div className="site-hero-actions">
                <Link href="/app" className="site-button">Open Minko <span aria-hidden="true">↗</span></Link>
                <Link href="#how-it-works" className="site-text-link">See how it works <span aria-hidden="true">↓</span></Link>
              </div>
              <div className="site-hero-facts" aria-label="Minko highlights">
                <span><strong>01</strong> Open a video</span>
                <span><strong>02</strong> Build its frame stack</span>
                <span><strong>03</strong> Explore through time</span>
              </div>
            </div>
            <div className="site-hero-visual">
              <div className="site-visual-topline"><span>SPATIOTEMPORAL VIEW</span><span className="site-live-dot">FRAME STACK</span></div>
              <HeroArtwork />
              <div className="site-visual-bottomline"><span>WIDTH × HEIGHT × TIME</span><span>ILLUSTRATED VIEW</span></div>
            </div>
          </div>
        </section>

        <section className="site-section site-intro-section" id="how-it-works">
          <div className="site-wrap">
            <div className="site-section-heading">
              <p className="site-eyebrow">THE IDEA</p>
              <h2>From a clip to a space you can explore.</h2>
              <p>Instead of looking at one moment at a time, Minko places frames along a time axis. Motion becomes a form you can orbit, scrub, and inspect.</p>
            </div>
            <div className="site-process-figure"><ProcessArtwork /></div>
            <div className="site-steps">
              <article><span className="site-step-index">01 / OPEN</span><h3>Choose a video</h3><p>Use your own file or one of the included demos. Your file stays on your device; Minko processes it in the browser.</p></article>
              <article><span className="site-step-index">02 / BUILD</span><h3>Place frames in time</h3><p>Frames become slices of a 3D texture. Detail settings balance the number of slices against processing time and memory.</p></article>
              <article><span className="site-step-index">03 / EXPLORE</span><h3>Look through motion</h3><p>Orbit the stack, move the current slice, and compare it with the original video playing alongside it.</p></article>
            </div>
          </div>
        </section>

        <section className="site-section site-features-section">
          <div className="site-wrap">
            <div className="site-section-heading site-section-heading-split">
              <div><p className="site-eyebrow">WHAT YOU CAN SEE</p><h2>Follow a path. Find a pattern.</h2></div>
              <p>A changing image leaves a structure across time. Minko gives you controls to examine that structure from more than one angle.</p>
            </div>
            <div className="site-feature-grid">
              <article className="site-feature-card">
                <div className="site-feature-art site-feature-art-path" aria-hidden="true"><span className="site-orbit site-orbit-a" /><span className="site-orbit site-orbit-b" /><span className="site-path-line" /><i /></div>
                <span className="site-feature-number">01 — MOTION PATHS</span><h3>Trace movement through time.</h3><p>A moving object draws a path through the frame stack, making direction and repetition easier to inspect.</p>
              </article>
              <article className="site-feature-card">
                <div className="site-feature-art site-feature-art-cube" aria-hidden="true"><span /><span /><span /><i>↗</i></div>
                <span className="site-feature-number">02 — PERSPECTIVE</span><h3>Change your point of view.</h3><p>Orbit freely, switch to a front view, or let the camera follow the current time slice.</p>
              </article>
              <article className="site-feature-card">
                <div className="site-feature-art site-feature-art-compare" aria-hidden="true"><div><span /></div><div><span /></div><i>00:04</i></div>
                <span className="site-feature-number">03 — CONTEXT</span><h3>Keep the source beside you.</h3><p>Play the original video next to the frame stack so the visual structure stays connected to the clip.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="site-section site-demo-section" id="demos">
          <div className="site-wrap site-demo-grid">
            <div className="site-demo-copy"><p className="site-eyebrow">START EXPLORING</p><h2>Try it before choosing a file.</h2><p>Two small demo videos are built into Minko. Watch the motion here, then open the app to see how each clip becomes a frame stack.</p><Link href="/app" className="site-button site-button-outline">Explore the demos <span aria-hidden="true">↗</span></Link></div>
            <div className="site-demo-cards">
              <figure className="site-demo-card"><video src="/demos/kinetic-bounce.mp4" autoPlay muted loop playsInline preload="metadata" aria-label="Kinetic Bounce demo video" /><figcaption><strong>Kinetic Bounce</strong><span>A ball moving through space</span></figcaption></figure>
              <figure className="site-demo-card"><video src="/demos/dvd-corner-chase.mp4" autoPlay muted loop playsInline preload="metadata" aria-label="DVD Corner Chase demo video" /><figcaption><strong>DVD Corner Chase</strong><span>A repeating screensaver path</span></figcaption></figure>
            </div>
          </div>
        </section>

        <section className="site-final-section">
          <div className="site-wrap site-final-inner"><div><p className="site-eyebrow">READY WHEN YOU ARE</p><h2>One video. Another perspective.</h2><p>Open Minko and see what your clip looks like when time becomes visible.</p></div><Link href="/app" className="site-button">Launch the app <span aria-hidden="true">↗</span></Link></div>
        </section>
      </main>
    </SiteShell>
  );
}
