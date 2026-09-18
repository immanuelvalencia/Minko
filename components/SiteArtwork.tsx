export function HeroArtwork() {
  return (
    <svg className="site-hero-art" viewBox="0 0 760 610" role="img" aria-label="Illustration of moving frames forming a three-dimensional block across time">
      <defs>
        <linearGradient id="heroPlane" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#132d52" stopOpacity=".85" /><stop offset="1" stopColor="#07101e" stopOpacity=".24" /></linearGradient>
        <linearGradient id="heroEdge" x1="0" x2="1"><stop stopColor="#366db4" stopOpacity=".18" /><stop offset=".75" stopColor="#90baff" stopOpacity=".9" /><stop offset="1" stopColor="#366db4" stopOpacity=".3" /></linearGradient>
        <radialGradient id="heroBall"><stop stopColor="#e8f4ff" /><stop offset=".32" stopColor="#8ec6ff" /><stop offset="1" stopColor="#2670e8" /></radialGradient>
        <filter id="heroGlow"><feGaussianBlur stdDeviation="18" /></filter>
        <pattern id="heroGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#40577a" strokeOpacity=".18" strokeWidth="1" /></pattern>
      </defs>
      <rect width="760" height="610" fill="url(#heroGrid)" opacity=".55" />
      <ellipse cx="408" cy="323" rx="248" ry="184" fill="#327dea" opacity=".16" filter="url(#heroGlow)" />
      <path d="M92 502 408 567 688 430" fill="none" stroke="#40608d" strokeOpacity=".36" />
      <path d="M408 567V520M688 430v-42" fill="none" stroke="#40608d" strokeOpacity=".36" />
      <g transform="translate(120 146)">
        <path d="M0 72 354 132 535 34 181-26Z" fill="#0c1829" stroke="#5e8bc6" strokeOpacity=".32" />
        <path d="M0 72V304l354 60V132ZM354 132V364l181-98V34Z" fill="#0b1b30" fillOpacity=".68" stroke="#6ba8ff" strokeOpacity=".34" />
        <path d="M0 304 354 364l181-98" fill="none" stroke="#80b4fa" strokeOpacity=".38" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <g key={i} transform={`translate(${i * 58} ${i * 10})`} opacity={0.22 + i * 0.145}>
            <path d="M0 72 181-26V206L0 304Z" fill="url(#heroPlane)" stroke="url(#heroEdge)" strokeWidth={i === 5 ? 2 : 1} />
            <path d="M14 95 166 12M14 281l152-82" stroke="#3f6eaf" strokeOpacity=".16" />
            <circle cx={42 + i * 14} cy={221 - i * 24} r={i === 5 ? 13 : 9} fill="url(#heroBall)" />
          </g>
        ))}
        <path d="M48 258C112 212 158 269 214 204S315 85 397 154" fill="none" stroke="#72b6ff" strokeWidth="15" strokeOpacity=".35" filter="url(#heroGlow)" />
        <path d="M48 258C112 212 158 269 214 204S315 85 397 154" fill="none" stroke="#95caff" strokeWidth="3" strokeLinecap="round" strokeDasharray="3 7" />
        <path d="M0 72 354 132 535 34M0 304l354 60 181-98" fill="none" stroke="#7db4ff" strokeOpacity=".6" />
      </g>
      <g fill="#99aed0" fontFamily="ui-monospace, monospace" fontSize="12" letterSpacing="2">
        <text x="70" y="128">WIDTH</text><text x="62" y="491">HEIGHT</text><text x="626" y="511">TIME</text>
      </g>
      <path d="M113 136h93M113 147v54M112 481h69M124 474v-48M624 489l-62-36" fill="none" stroke="#6f9edc" strokeOpacity=".65" />
      <circle cx="560" cy="451" r="3" fill="#9bc5ff" />
    </svg>
  );
}

export function ProcessArtwork() {
  return (
    <svg className="site-process-art" viewBox="0 0 1020 310" role="img" aria-label="Three steps: a video frame, sampled frames across time, and a navigable three-dimensional frame stack">
      <defs>
        <linearGradient id="processLine"><stop stopColor="#416fba" stopOpacity=".15" /><stop offset=".5" stopColor="#8bbdff" /><stop offset="1" stopColor="#416fba" stopOpacity=".15" /></linearGradient>
        <linearGradient id="processFill" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#173762" /><stop offset="1" stopColor="#0b1323" /></linearGradient>
      </defs>
      <path d="M296 147h71M642 147h70" stroke="url(#processLine)" strokeWidth="2" strokeDasharray="5 7" />
      <g transform="translate(38 55)">
        <rect width="250" height="180" rx="13" fill="#0b1527" stroke="#395a87" />
        <rect x="13" y="13" width="224" height="154" rx="8" fill="url(#processFill)" />
        <path d="M13 119c40-21 87-23 124-5s68 21 100 1v52H13Z" fill="#18345e" />
        <circle cx="95" cy="85" r="23" fill="#72b7ff" /><circle cx="89" cy="78" r="8" fill="#cceaff" opacity=".6" />
        <path d="M13 13h224v154H13Z" fill="none" stroke="#72a8ed" strokeOpacity=".35" />
      </g>
      <g transform="translate(390 61)">
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${i * 34} ${i * 14})`} opacity={.34 + i * .19}>
            <rect width="135" height="134" rx="8" fill="url(#processFill)" stroke="#77aeed" />
            <circle cx={40 + i * 15} cy={94 - i * 18} r="14" fill="#79baff" />
          </g>
        ))}
      </g>
      <g transform="translate(734 52)">
        <path d="M0 51 126 0l194 49-126 52ZM0 51v129l194 51V101ZM194 101v130l126-52V49Z" fill="#102543" stroke="#6199db" strokeOpacity=".65" />
        {[0, 1, 2, 3].map((i) => <path key={i} d={`M${i * 30} ${51 - i * 12}v129l194 51`} fill="none" stroke="#78b7ff" strokeOpacity={.2 + i * .12} />)}
        <path d="M27 117c54-59 102 28 167-12" fill="none" stroke="#9dceff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="193" cy="105" r="9" fill="#a7d6ff" />
      </g>
    </svg>
  );
}
