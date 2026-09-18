'use client';

import { useEffect } from 'react';

export default function SiteMotion() {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const targets = Array.from(document.querySelectorAll<HTMLElement>('.site [data-reveal]'));
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('site-revealed');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });

    for (const target of targets) {
      // Never hide content already in view while the client component starts.
      if (target.getBoundingClientRect().top > window.innerHeight - 24) {
        target.classList.add('site-reveal-pending');
        observer.observe(target);
      }
    }

    return () => {
      observer.disconnect();
      for (const target of targets) target.classList.remove('site-reveal-pending', 'site-revealed');
    };
  }, []);

  return null;
}
