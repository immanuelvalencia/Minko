export default function MinkowskiDiagram({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      className={compact ? 'minkowski-diagram minkowski-diagram-compact' : 'minkowski-diagram'}
      viewBox="0 0 760 480"
      role="img"
      aria-labelledby="minkowskiDiagramTitle minkowskiDiagramDescription"
    >
      <title id="minkowskiDiagramTitle">A simplified Minkowski space-time diagram</title>
      <desc id="minkowskiDiagramDescription">Time runs upward and one spatial dimension runs horizontally. A point is an event, a curved worldline connects an object&apos;s events, and diagonal light paths bound the past and future light cones.</desc>
      <defs>
        <pattern id="spacetimeGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" fill="none" stroke="#60779d" strokeOpacity=".13" />
        </pattern>
        <linearGradient id="futureCone" x1="0" x2="0" y1="1" y2="0">
          <stop stopColor="#5b9cff" stopOpacity=".02" />
          <stop offset="1" stopColor="#5b9cff" stopOpacity=".22" />
        </linearGradient>
        <linearGradient id="pastCone" x1="0" x2="0" y1="0" y2="1">
          <stop stopColor="#72aaf8" stopOpacity=".025" />
          <stop offset="1" stopColor="#72aaf8" stopOpacity=".13" />
        </linearGradient>
        <filter id="eventGlow"><feGaussianBlur stdDeviation="8" /></filter>
      </defs>
      <rect width="760" height="480" fill="#0b1524" />
      <rect width="760" height="480" fill="url(#spacetimeGrid)" />
      <path d="M380 250 198 48h364Z" fill="url(#futureCone)" />
      <path d="M380 250 198 432h364Z" fill="url(#pastCone)" />
      <path d="M380 250 198 48M380 250 562 48M380 250 198 432M380 250 562 432" fill="none" stroke="#76b3ff" strokeOpacity=".7" strokeWidth="1.6" strokeDasharray="5 7" />
      <path d="M92 250h576M380 446V34" fill="none" stroke="#a5bbd8" strokeOpacity=".62" strokeWidth="1.4" />
      <path d="m661 246 7 4-7 4M376 42l4-8 4 8" fill="none" stroke="#a5bbd8" strokeOpacity=".75" strokeWidth="1.4" />
      <path className="minkowski-worldline" d="M336 412C341 348 350 304 380 250S421 154 431 74" fill="none" stroke="#9cd0ff" strokeWidth="4" strokeLinecap="round" />
      <path d="M336 412C341 348 350 304 380 250S421 154 431 74" fill="none" stroke="#70b4ff" strokeOpacity=".35" strokeWidth="14" filter="url(#eventGlow)" />
      <circle cx="380" cy="250" r="17" fill="#8ac3ff" opacity=".44" filter="url(#eventGlow)" />
      <circle cx="380" cy="250" r="5.5" fill="#eaf6ff" />
      <circle cx="405" cy="186" r="5" fill="#a4d5ff" />
      <circle cx="356" cy="337" r="4" fill="#a4d5ff" opacity=".8" />
      <path d="M391 246h70M415 183h56M482 128h42" fill="none" stroke="#8fb9ee" strokeOpacity=".5" />
      <g fill="#b9cae2" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="12" letterSpacing="1.6">
        <text x="464" y="254">EVENT</text>
        <text x="475" y="187">WORLDLINE</text>
        <text x="528" y="132">LIGHT PATH</text>
        <text x="314" y="116">FUTURE</text>
        <text x="333" y="389">PAST</text>
        <text x="686" y="254">SPACE x</text>
        <text x="392" y="36">TIME ct</text>
      </g>
      <text x="24" y="459" fill="#7f94b3" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" letterSpacing="1.2">ONE SPACE DIMENSION SHOWN · CONCEPTUAL DIAGRAM</text>
    </svg>
  );
}
