import { useReveal } from "@/hooks/useReveal";

/** Animated truss showing compression (top chord) and tension (bottom chord) load flow. */
export function LoadPath() {
  const { ref, shown } = useReveal<HTMLDivElement>(0.25);

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-lg border border-border bg-ink p-6 md:p-10"
    >
      <svg viewBox="0 0 640 240" className="w-full" role="img" aria-label="Truss load path diagram">
        <defs>
          <linearGradient id="lp-comp" x1="0" x2="1">
            <stop offset="0%" stopColor="oklch(0.68 0.15 55)" stopOpacity="0.2" />
            <stop offset="50%" stopColor="oklch(0.68 0.15 55)" stopOpacity="1" />
            <stop offset="100%" stopColor="oklch(0.68 0.15 55)" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* bottom chord — tension */}
        <line x1="60" y1="180" x2="580" y2="180" stroke="oklch(1 0 0 / 0.35)" strokeWidth="3" />
        {/* top chord — compression */}
        <polyline
          points="60,180 190,80 450,80 580,180"
          fill="none"
          stroke="url(#lp-comp)"
          strokeWidth="4"
          strokeDasharray="1000"
          strokeDashoffset={shown ? 0 : 1000}
          style={{ transition: "stroke-dashoffset 1.8s ease-out" }}
        />
        {/* web members */}
        {[
          [190, 80, 60, 180],
          [190, 80, 320, 180],
          [320, 80, 320, 180],
          [450, 80, 320, 180],
          [450, 80, 580, 180],
        ].map(([x1, y1, x2, y2], i) => (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="oklch(1 0 0 / 0.28)"
            strokeWidth="2"
            opacity={shown ? 1 : 0}
            style={{ transition: `opacity 600ms ease ${300 + i * 120}ms` }}
          />
        ))}
        {/* nodes */}
        {[
          [60, 180],
          [190, 80],
          [320, 80],
          [450, 80],
          [580, 180],
          [320, 180],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="5" fill="oklch(0.68 0.15 55)" />
        ))}

        {/* travelling force pulse along the load path */}
        <circle r="5" fill="oklch(0.99 0.005 85)">
          <animateMotion
            dur="4.2s"
            repeatCount="indefinite"
            path="M 320 40 L 320 80 L 190 80 L 60 180 L 320 180 L 580 180 L 450 80 L 320 80"
          />
        </circle>

        <text x="320" y="30" textAnchor="middle" fill="oklch(1 0 0 / 0.55)" fontSize="12">
          applied load
        </text>
        <text x="320" y="70" textAnchor="middle" fill="oklch(0.68 0.15 55)" fontSize="11">
          COMPRESSION
        </text>
        <text x="320" y="204" textAnchor="middle" fill="oklch(1 0 0 / 0.5)" fontSize="11">
          TENSION
        </text>
        {/* reactions */}
        {[60, 580].map((x) => (
          <g key={x}>
            <polygon points={`${x - 12},198 ${x + 12},198 ${x},182`} fill="oklch(1 0 0 / 0.4)" />
            <line
              x1={x - 26}
              y1="200"
              x2={x + 26}
              y2="200"
              stroke="oklch(1 0 0 / 0.25)"
              strokeWidth="2"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
