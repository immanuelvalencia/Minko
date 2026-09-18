import Link from 'next/link';
import BrandMark from './BrandMark';
import SiteMotion from './SiteMotion';

export default function SiteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="site">
      <SiteMotion />
      <header className="site-header">
        <div className="site-wrap site-nav">
          <Link href="/" className="site-brand" aria-label="Minko website home">
            <BrandMark />
            <span className="site-brand-type"><strong>Minko</strong><small>WIDTH × HEIGHT × TIME</small></span>
          </Link>
          <nav className="site-links" aria-label="Main navigation">
            <Link href="/#how-it-works">How it works</Link>
            <Link href="/about">About</Link>
            <Link href="/app" className="site-button site-button-small">Open app <span aria-hidden="true">↗</span></Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="site-wrap site-footer-inner">
          <Link href="/" className="site-footer-brand"><BrandMark /><span>Minko<small>WIDTH × HEIGHT × TIME</small></span></Link>
          <p>Explore motion as it unfolds through time.</p>
          <div><Link href="/about">About</Link><Link href="/app">Open app</Link></div>
        </div>
      </footer>
    </div>
  );
}
