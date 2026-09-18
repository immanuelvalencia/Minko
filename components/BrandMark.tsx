export default function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 24" aria-hidden="true">
      <rect x="1" y="5" width="17" height="12" rx="1.5" opacity=".28" />
      <rect x="5" y="6.5" width="17" height="12" rx="1.5" opacity=".55" />
      <rect x="9" y="8" width="17" height="12" rx="1.5" />
    </svg>
  );
}
