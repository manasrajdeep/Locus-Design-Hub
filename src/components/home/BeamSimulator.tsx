import { useMemo, useState } from "react";
import { useReveal } from "@/hooks/useReveal";

/**
 * Simply-supported RC beam under a uniform load.
 *   I  = b·h³/12                     (second moment of area)
 *   δ  = 5wL⁴ / (384·E·I)            (mid-span deflection)
 *   M  = wL²/8                       (max bending moment)
 * Serviceability check: δ ≤ L/250
 */
const E_CONCRETE = 25e9; // Pa (M25 grade, short-term)
const WIDTH_M = 0.3; // 300 mm web

export function BeamSimulator() {
  const [span, setSpan] = useState(7); // m
  const [load, setLoad] = useState(18); // kN/m
  const [depth, setDepth] = useState(450); // mm
  const { ref, shown } = useReveal<HTMLDivElement>(0.2);

  const r = useMemo(() => {
    const L = span;
    const w = load * 1000; // N/m
    const h = depth / 1000; // m
    const I = (WIDTH_M * h ** 3) / 12;
    const delta = (5 * w * L ** 4) / (384 * E_CONCRETE * I); // m
    const moment = (w * L ** 2) / 8 / 1000; // kNm
    const shear = (w * L) / 2 / 1000; // kN
    const limit = L / 250;
    return {
      deltaMm: delta * 1000,
      limitMm: limit * 1000,
      ratio: delta > 0 ? L / delta : Infinity,
      moment,
      shear,
      pass: delta <= limit,
      I,
    };
  }, [span, load, depth]);

  // Visual sag, exaggerated for legibility but proportional to the real result.
  const sag = Math.min(46, (r.deltaMm / r.limitMm) * 22);
  const path = `M 40 60 Q 220 ${60 + sag * 2} 400 60`;

  return (
    <div
      ref={ref}
      className={`grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center transition-all duration-700 ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
    >
      {/* Diagram */}
      <div className="relative overflow-hidden rounded-lg border border-border bg-card blueprint-grid p-6">
        <svg
          viewBox="0 0 440 140"
          className="w-full"
          role="img"
          aria-label="Deflected beam diagram"
        >
          {/* distributed load arrows */}
          {Array.from({ length: 13 }).map((_, i) => {
            const x = 40 + i * 30;
            return (
              <g key={i} className="text-amber-brand" stroke="currentColor" strokeWidth="1.2">
                <line x1={x} y1={16} x2={x} y2={44} />
                <polyline points={`${x - 3},38 ${x},45 ${x + 3},38`} fill="none" />
              </g>
            );
          })}
          <line
            x1="34"
            y1="14"
            x2="406"
            y2="14"
            className="text-amber-brand"
            stroke="currentColor"
            strokeWidth="1.6"
          />

          {/* deflected beam */}
          <path
            d={path}
            fill="none"
            className="text-foreground"
            stroke="currentColor"
            strokeWidth="7"
            strokeLinecap="round"
            style={{ transition: "d 320ms ease" }}
          />
          {/* supports */}
          {[40, 400].map((x) => (
            <polygon
              key={x}
              points={`${x - 11},80 ${x + 11},80 ${x},62`}
              className="text-muted-foreground"
              fill="currentColor"
            />
          ))}
          <line
            x1="20"
            y1="82"
            x2="420"
            y2="82"
            className="text-border"
            stroke="currentColor"
            strokeWidth="2"
          />

          {/* dimension line */}
          <g className="text-muted-foreground" stroke="currentColor" strokeWidth="1">
            <line x1="40" y1="104" x2="400" y2="104" strokeDasharray="4 4" />
            <line x1="40" y1="98" x2="40" y2="110" />
            <line x1="400" y1="98" x2="400" y2="110" />
          </g>
          <text x="220" y="126" textAnchor="middle" className="fill-muted-foreground" fontSize="11">
            L = {span.toFixed(1)} m
          </text>
        </svg>

        <div className="mt-2 flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <span>δ = 5wL⁴ / 384EI</span>
          <span className="text-border">|</span>
          <span>I = {(r.I * 1e6).toFixed(1)}×10⁻⁶ m⁴</span>
        </div>
      </div>

      {/* Controls + read-out */}
      <div>
        <div className="space-y-6">
          <Slider
            label="Clear span"
            unit="m"
            value={span}
            min={3}
            max={12}
            step={0.5}
            onChange={setSpan}
          />
          <Slider
            label="Uniform load"
            unit="kN/m"
            value={load}
            min={5}
            max={45}
            step={1}
            onChange={setLoad}
          />
          <Slider
            label="Section depth"
            unit="mm"
            value={depth}
            min={200}
            max={800}
            step={25}
            onChange={setDepth}
          />
        </div>

        <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
          <Readout label="Deflection" value={`${r.deltaMm.toFixed(1)} mm`} />
          <Readout label="Max moment" value={`${r.moment.toFixed(0)} kNm`} />
          <Readout label="End shear" value={`${r.shear.toFixed(0)} kN`} />
        </dl>

        <div
          className={`mt-4 flex items-center justify-between rounded-md border px-4 py-3 text-sm ${
            r.pass
              ? "border-amber-brand/40 bg-amber-brand/10 text-foreground"
              : "border-destructive/50 bg-destructive/10 text-foreground"
          }`}
        >
          <span className="font-medium">
            {r.pass ? "Serviceability satisfied" : "Exceeds deflection limit"}
          </span>
          <span className="font-mono text-xs text-muted-foreground">
            L/{Number.isFinite(r.ratio) ? Math.round(r.ratio) : "∞"} vs limit L/250
          </span>
        </div>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Depth beats span every time: stiffness grows with the cube of the section depth, so 100 mm
          of extra beam does more than doubling the concrete width. This is the arithmetic behind
          every column grid we set.
        </p>
      </div>
    </div>
  );
}

function Slider({
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </label>
        <span className="font-mono text-sm text-foreground">
          {value} <span className="text-muted-foreground">{unit}</span>
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} in ${unit}`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-[var(--amber-brand)]"
      />
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-4 py-4 text-center">
      <dt className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-lg text-foreground">{value}</dd>
    </div>
  );
}
