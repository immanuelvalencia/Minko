export default function SiteAmbient({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? 'site-ambient site-ambient-compact' : 'site-ambient'} aria-hidden="true">
      <div className="site-ambient-grid" />
      <div className="site-ambient-halo" />
      <div className="site-ambient-frame site-ambient-frame-back" />
      <div className="site-ambient-frame site-ambient-frame-mid" />
      <div className="site-ambient-frame site-ambient-frame-front" />
      <span className="site-ambient-streak site-ambient-streak-one" />
      <span className="site-ambient-streak site-ambient-streak-two" />
    </div>
  );
}
