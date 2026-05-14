export function NexoLogo({ size = 38 }: { size?: number }) {
  const id = `ng-${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="40" height="40" rx="11" fill={`url(#${id})`} />
      {/* Outer ring nodes */}
      <circle cx="20" cy="8"  r="2.5" fill="white" fillOpacity="0.95" />
      <circle cx="32" cy="20" r="2.5" fill="white" fillOpacity="0.95" />
      <circle cx="20" cy="32" r="2.5" fill="white" fillOpacity="0.95" />
      <circle cx="8"  cy="20" r="2.5" fill="white" fillOpacity="0.95" />
      {/* Center node */}
      <circle cx="20" cy="20" r="4" fill="white" />
      {/* Spokes */}
      <line x1="20" y1="16" x2="20" y2="10.5"  stroke="white" strokeWidth="1.8" strokeOpacity="0.75" strokeLinecap="round" />
      <line x1="24" y1="20" x2="29.5" y2="20"  stroke="white" strokeWidth="1.8" strokeOpacity="0.75" strokeLinecap="round" />
      <line x1="20" y1="24" x2="20" y2="29.5"  stroke="white" strokeWidth="1.8" strokeOpacity="0.75" strokeLinecap="round" />
      <line x1="16" y1="20" x2="10.5" y2="20"  stroke="white" strokeWidth="1.8" strokeOpacity="0.75" strokeLinecap="round" />
      {/* Outer ring arc (partial) */}
      <circle cx="20" cy="20" r="14" stroke="white" strokeOpacity="0.2" strokeWidth="1" fill="none" strokeDasharray="4 3" />
    </svg>
  );
}
