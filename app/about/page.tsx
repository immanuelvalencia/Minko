import type { Metadata } from 'next';
import Link from 'next/link';
import SiteShell from '@/components/SiteShell';
import BrandMark from '@/components/BrandMark';

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
          <div><p className="site-eyebrow">ABOUT THE PROJECT</p><h1>Making time<br /><em>visible.</em></h1><p className="site-about-lead">Minko began with a simple question: what might a video reveal if you could look through its full timeline, not just play it frame by frame?</p></div>
          <div className="site-about-emblem" role="img" aria-label="Minko layered-frame logo illustrated across space and time"><div className="site-about-emblem-halo" /><span /><span /><span /><BrandMark className="site-about-large-mark" /><small>WIDTH × HEIGHT × TIME</small></div>
        </section>

        <section className="site-section site-about-story"><div className="site-wrap site-about-columns"><div><p className="site-eyebrow">THE IDEA</p><h2>A different way to read motion.</h2></div><div><p>Inspired by Hermann Minkowski&apos;s way of thinking about space and time together, Minko treats a video as a three-dimensional frame stack: image width, image height, and time.</p><p>It is a visual exploration tool, not a physics simulation. It places video frames along a depth axis so paths, changes, and repeated movements can be viewed from different perspectives.</p><Link href="/app" className="site-text-link">Explore the app <span aria-hidden="true">↗</span></Link></div></div></section>

        <section className="site-section site-about-person"><div className="site-wrap site-person-grid"><div className="site-person-monogram" aria-hidden="true"><span>IV</span><i /><i /></div><div><p className="site-eyebrow">CREATED BY</p><h2>Immanuel Valencia</h2><p>Minko was developed by Immanuel Valencia at De La Salle University, Department of Biomedical, Manufacturing, and Robotics Engineering.</p><p>The project brings together video, spatial visualization, and interactive exploration in a browser-based tool.</p><a href="https://immanuelvalencia.dev" target="_blank" rel="noreferrer" className="site-button site-button-outline">Visit Immanuel&apos;s website <span aria-hidden="true">↗</span></a></div></div></section>

        <section className="site-final-section"><div className="site-wrap site-final-inner"><div><p className="site-eyebrow">SEE IT FOR YOURSELF</p><h2>Explore motion in Minko.</h2><p>Try a demo or bring your own video. Your file is processed in your browser.</p></div><Link href="/app" className="site-button">Open the app <span aria-hidden="true">↗</span></Link></div></section>
      </main>
    </SiteShell>
  );
}
