import { useId, useMemo, useRef, useState, type ReactNode } from "react";

// Small, dependency-free SVG charts for the Health view. Specs follow the
// dataviz guide: 2px lines, ~10% area wash, hairline recessive grid, ≥8px
// markers with a 2px surface ring, 4px rounded column ends, one axis only,
// crosshair + tooltip on lines, per-mark tooltip on columns, keyboard focus,
// and every value also reachable without hovering (tables / text).

const SURFACE = "#ffffff";
const GRID = "#e8e8ed";
const AXIS_TEXT = "#6e6e73";
export const STATUS_CRITICAL = "#d03b3b";

export type Point = { x: number; y: number; label: string; flag?: string };

type LineProps = {
  points: Point[];
  /** X domain in the same unit as point.x (e.g. minutes of day 0–1440). */
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: { at: number; label: string }[];
  yTicks: number[];
  color: string;
  unit: string;
  /** Shaded "expected range" band. */
  band?: [number, number];
  /** Dashed? No — a solid hairline threshold with a label. */
  threshold?: { y: number; label: string };
  height?: number;
  title: string;
  /** Formats the tooltip value. */
  fmt?: (y: number) => string;
};

export function LineChart({ points, xDomain, yDomain, xTicks, yTicks, color, unit, band, threshold, height = 200, title, fmt = (y) => String(y) }: LineProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const m = { t: 12, r: 12, b: 26, l: 36 };
  const sx = (x: number) => m.l + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (W - m.l - m.r);
  const sy = (y: number) => m.t + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - m.t - m.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join("");
  const area = points.length ? `${path}L${sx(points.at(-1)!.x)},${sy(yDomain[0])}L${sx(points[0].x)},${sy(yDomain[0])}Z` : "";
  const gid = useId().replace(/:/g, "");

  const nearest = (clientX: number) => {
    const svg = ref.current;
    if (!svg || !points.length) return null;
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(sx(p.x) - x) < Math.abs(sx(points[best].x) - x)) best = i; });
    return best;
  };
  const hp = hover !== null ? points[hover] : null;
  const flagged = points.filter((p) => p.flag);

  return (
    <figure className="chart" aria-label={title}>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${title}. ${points.length} readings. ${flagged.length ? `${flagged.length} unusual.` : "No unusual readings."}`}
        tabIndex={0}
        onPointerMove={(e) => setHover(nearest(e.clientX))}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(points.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? points.length) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1));
        }}
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.14" />
            <stop offset="1" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {band && <rect x={m.l} width={W - m.l - m.r} y={sy(band[1])} height={sy(band[0]) - sy(band[1])} fill="#f2f2f7" />}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={sy(t)} y2={sy(t)} stroke={GRID} strokeWidth={1} />
            <text x={m.l - 8} y={sy(t) + 4} textAnchor="end" fontSize="11" fill={AXIS_TEXT} className="tnum">{t}</text>
          </g>
        ))}
        {xTicks.map((t, i) => (
          <text key={t.at} x={sx(t.at)} y={H - 8} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} fontSize="11" fill={AXIS_TEXT}>{t.label}</text>
        ))}
        {threshold && (
          <g>
            <line x1={m.l} x2={W - m.r} y1={sy(threshold.y)} y2={sy(threshold.y)} stroke={STATUS_CRITICAL} strokeOpacity={0.45} strokeWidth={1} />
            <text x={W - m.r} y={sy(threshold.y) - 4} textAnchor="end" fontSize="11" fill={AXIS_TEXT}>{threshold.label}</text>
          </g>
        )}
        {area && <path d={area} fill={`url(#g${gid})`} />}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length > 0 && !points.at(-1)!.flag && <circle cx={sx(points.at(-1)!.x)} cy={sy(points.at(-1)!.y)} r={4.5} fill={color} stroke={SURFACE} strokeWidth={2} />}
        {flagged.map((p) => (
          <g key={p.x}>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={6} fill={STATUS_CRITICAL} stroke={SURFACE} strokeWidth={2} />
            <text x={sx(p.x) + 10} y={sy(p.y) + 4} textAnchor="start" fontSize="11" fontWeight={600} fill="#1d1d1f" stroke={SURFACE} strokeWidth={3} paintOrder="stroke">{fmt(p.y)}</text>
          </g>
        ))}
        {hp && (
          <g pointerEvents="none">
            <line x1={sx(hp.x)} x2={sx(hp.x)} y1={m.t} y2={H - m.b} stroke="#c7c7cc" strokeWidth={1} />
            <circle cx={sx(hp.x)} cy={sy(hp.y)} r={5} fill={hp.flag ? STATUS_CRITICAL : color} stroke={SURFACE} strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div className="chart-tip" style={{ left: `${(sx(hp.x) / W) * 100}%` }} role="status">
          <b>{fmt(hp.y)} {unit}</b>
          <span>{hp.label}</span>
          {hp.flag && <span className="chart-tip-flag">⚠ {hp.flag}</span>}
        </div>
      )}
    </figure>
  );
}

type ColumnProps = {
  values: number[];
  labels: string[];
  xTicks: { i: number; label: string }[];
  color: string;
  unit: string;
  title: string;
  height?: number;
  /** Index of the "current" column, drawn in the full color; others lighter. */
  highlight?: number;
};

export function ColumnChart({ values, labels, xTicks, color, unit, title, height = 150, highlight }: ColumnProps) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const m = { t: 22, r: 8, b: 24, l: 8 };
  const max = Math.max(1, ...values);
  const nice = useMemo(() => {
    const step = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / step) * step;
  }, [max]);
  const band = (W - m.l - m.r) / values.length;
  const bw = Math.min(24, band - 2);
  const sy = (v: number) => m.t + (1 - v / nice) * (H - m.t - m.b);
  return (
    <figure className="chart" aria-label={title}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Highest ${Math.max(...values)} ${unit}.`}>
        <line x1={m.l} x2={W - m.r} y1={sy(0)} y2={sy(0)} stroke="#c7c7cc" strokeWidth={1} />
        <line x1={m.l} x2={W - m.r} y1={sy(nice)} y2={sy(nice)} stroke={GRID} strokeWidth={1} />
        <text x={m.l} y={sy(nice) - 6} textAnchor="start" fontSize="11" fill={AXIS_TEXT}>{nice.toLocaleString()} {unit}</text>
        {values.map((v, i) => {
          const x = m.l + i * band + (band - bw) / 2;
          const h = Math.max(0, sy(0) - sy(v));
          const r = Math.min(4, h);
          const d = h > 0 ? `M${x},${sy(0)}V${sy(v) + r}Q${x},${sy(v)} ${x + r},${sy(v)}H${x + bw - r}Q${x + bw},${sy(v)} ${x + bw},${sy(v) + r}V${sy(0)}Z` : "";
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={v ? 0 : -1} aria-label={`${labels[i]}: ${v.toLocaleString()} ${unit}`}>
              <rect x={m.l + i * band} y={m.t} width={band} height={H - m.t - m.b} fill="transparent" />
              {d && <path d={d} fill={color} opacity={highlight === undefined || highlight === i || hover === i ? 1 : 0.55} />}
            </g>
          );
        })}
        {xTicks.map((t) => <text key={t.i} x={m.l + t.i * band + band / 2} y={H - 7} textAnchor="middle" fontSize="11" fill={AXIS_TEXT}>{t.label}</text>)}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((m.l + hover * band + band / 2) / W) * 100}%` }} role="status">
          <b>{values[hover].toLocaleString()} {unit}</b>
          <span>{labels[hover]}</span>
        </div>
      )}
    </figure>
  );
}

/** Sparkline for summary cards: de-emphasised line, latest point in the accent. */
export function Sparkline({ values, color, width = 120, height = 34 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const sx = (i: number) => 2 + (i / (values.length - 1)) * (width - 6);
  const sy = (v: number) => 3 + (1 - (v - min) / (max - min || 1)) * (height - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke="#c7c7cc" strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={sx(values.length - 1)} cy={sy(values.at(-1)!)} r={3.5} fill={color} stroke={SURFACE} strokeWidth={1.5} />
    </svg>
  );
}

/** Horizontal meter (fill + lighter track of the same hue). */
export function Meter({ value, goal, color, track, label }: { value: number; goal: number; color: string; track: string; label: string }) {
  const pct = Math.min(1, value / goal);
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={goal} aria-valuenow={value} aria-label={label}>
      <span style={{ width: `${pct * 100}%`, background: color }} />
      <i style={{ background: track }} />
    </div>
  );
}

export function ChartLegend({ items }: { items: { color: string; label: ReactNode }[] }) {
  return (
    <div className="chart-legend">
      {items.map((it, i) => <span key={i}><i style={{ background: it.color }} />{it.label}</span>)}
    </div>
  );
}
