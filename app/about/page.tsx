import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import SiteShell from '@/components/SiteShell';
import BrandMark from '@/components/BrandMark';
import SiteAmbient from '@/components/SiteAmbient';
import MinkowskiDiagram from '@/components/MinkowskiDiagram';

export const metadata: Metadata = {
  title: 'About — Minko',
  description: 'Meet Immanuel Valencia, the developer of Minko, and learn about the idea behind the project.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <SiteShell>
      <main id="main-content" className="site-about-main">
        <section className="site-wrap site-about-hero">
          <SiteAmbient compact />
          <div className="site-about-copy"><p className="site-eyebrow">ABOUT THE PROJECT</p><h1>The idea<br />behind <em>Minko.</em></h1><p className="site-about-lead">Minko began with a simple question: what might a video reveal if you could look through its full timeline, not just play it frame by frame?</p></div>
          <div className="site-about-emblem" role="img" aria-label="Minko layered-frame logo illustrated across space and time"><div className="site-about-emblem-halo" /><span /><span /><span /><BrandMark className="site-about-large-mark" /><small>WIDTH × HEIGHT × TIME</small></div>
        </section>

        <section className="site-section site-about-story"><div className="site-wrap site-about-columns" data-reveal><div><p className="site-eyebrow">THE IDEA</p><h2>A different way to read motion.</h2></div><div><p>Inspired by Hermann Minkowski&apos;s way of thinking about space and time together, Minko treats a video as a three-dimensional frame stack: image width, image height, and time.</p><p>It is a visual exploration tool, not a physics simulation. It places video frames along a depth axis so paths, changes, and repeated movements can be viewed from different perspectives.</p><Link href="/app" className="site-text-link">Explore the app <span aria-hidden="true">↗</span></Link></div></div></section>

        <section className="site-section site-minkowski-section" id="minkowski">
          <div className="site-wrap">
            <div className="site-minkowski-intro" data-reveal>
              <figure className="site-minkowski-portrait site-minkowski-portrait-large">
                <Image src="/images/hermann-minkowski.jpg" alt="Historical portrait of mathematician Hermann Minkowski" width={813} height={1093} sizes="(max-width: 640px) 150px, 240px" />
                <figcaption>Hermann Minkowski<br /><a href="https://commons.wikimedia.org/wiki/File:Hermann_Minkowski_Portrait.jpg" target="_blank" rel="noreferrer">Public-domain portrait ↗</a></figcaption>
              </figure>
              <div>
                <p className="site-eyebrow">THE NAMESAKE</p>
                <h2>Hermann Minkowski</h2>
                <p>In his 1908 lecture <em>Space and Time</em>, Minkowski described events as positions at particular times. The path of a moving point becomes a worldline: its history drawn through space and time.</p>
                <p>Minko borrows that visual way of thinking. Its frame stack places video width and height alongside time, but it is not a model of relativity or a scientific space-time measurement.</p>
                <a href="https://en.wikisource.org/wiki/Translation:Space_and_Time" target="_blank" rel="noreferrer" className="site-text-link">Read the 1908 lecture <span aria-hidden="true">↗</span></a>
              </div>
            </div>
            <div className="site-minkowski-explainer" data-reveal>
              <div className="site-minkowski-explainer-head"><p className="site-eyebrow">SPACE + TIME, AT A GLANCE</p><h3>One event. A path through time.</h3><p>This simplified diagram shows one spatial direction horizontally and time vertically. The diagonal boundaries represent paths traveled by light.</p></div>
              <MinkowskiDiagram />
              <div className="site-minkowski-key">
                <div><strong>01 / EVENT</strong><span>A single where-and-when, marked by the bright point.</span></div>
                <div><strong>02 / WORLDLINE</strong><span>The curved path connects successive events of a moving point.</span></div>
                <div><strong>03 / LIGHT CONE</strong><span>The dashed diagonals show light paths from the event; they bound its past and future cones.</span></div>
              </div>
            </div>
          </div>
        </section>

        <section className="site-section site-about-person"><div className="site-wrap site-person-grid" data-reveal><div className="site-person-monogram" aria-hidden="true"><span>IV</span><i /><i /></div><div><p className="site-eyebrow">CREATED BY</p><h2>Immanuel Valencia</h2><p>Minko was developed by Immanuel Valencia at De La Salle University, Department of Biomedical, Manufacturing, and Robotics Engineering.</p><p>The project brings together video, spatial visualization, and interactive exploration in a browser-based tool.</p><a href="https://immanuelvalencia.dev" target="_blank" rel="noreferrer" className="site-button site-button-outline">Visit Immanuel&apos;s website <span aria-hidden="true">↗</span></a></div></div></section>

        <section className="site-final-section"><div className="site-wrap site-final-inner"><div><p className="site-eyebrow">SEE IT FOR YOURSELF</p><h2>Explore motion in Minko.</h2><p>Try a demo or bring your own video. Your file is processed in your browser.</p></div><Link href="/app" className="site-button">Open the app <span aria-hidden="true">↗</span></Link></div></section>
      </main>
    </SiteShell>
  );
}
