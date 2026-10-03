import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Chart palette drawn from the site's own theme tokens. */
export const C = {
  olive: '#314237',
  moss: '#58705a',
  terracotta: '#b95f42',
  sun: '#d79b43',
  sky: '#9fbfc4',
  clay: '#c98a6a',
  ink: '#1e2520',
};
export const PALETTE = [C.olive, C.terracotta, C.sun, C.moss, C.sky, C.clay];

const compact = (n: number) => (Math.abs(n) >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : Math.abs(n) >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)));
export const rupeeCompact = (n: number) => `₹${compact(n)}`;

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

/** Catmull-Rom → cubic Bézier smoothing for a polyline. */
function smooth(pts: [number, number][]) {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;
    d += `C${p1[0] + (p2[0] - p0[0]) * t},${p1[1] + (p2[1] - p0[1]) * t} ${p2[0] - (p3[0] - p1[0]) * t},${p2[1] - (p3[1] - p1[1]) * t} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function Sparkline({ data, color = C.moss }: { data: number[]; color?: string }) {
  const id = useId();
  if (data.length < 2) return null;
  const w = 100;
  const h = 32;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i): [number, number] => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const line = smooth(pts);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} className="anim-fade" style={{ ['--d' as string]: '500ms' }} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" pathLength={1} className="anim-draw" />
    </svg>
  );
}

export interface Series {
  name: string;
  color: string;
  data: number[];
}

function Tooltip({ x, children }: { x: number; children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 border border-line bg-ink px-3 py-2 text-xs text-chalk shadow-[0_16px_32px_-16px_rgba(30,37,32,0.8)]" style={{ left: `clamp(5.5rem, ${x}%, calc(100% - 5.5rem))` }}>
      {children}
    </div>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
      {items.map((s) => (
        <li key={s.name} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

const W = 720;
const PAD = { l: 46, r: 14, t: 14, b: 28 };

export function AreaChart({ labels, series, fmt = rupeeCompact, fmtFull, height = 260, fill = true }: { labels: string[]; series: Series[]; fmt?: (n: number) => string; fmtFull?: (n: number) => string; height?: number; fill?: boolean }) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const H = height;
  const n = labels.length;
  const all = series.flatMap((s) => s.data);
  const max = niceMax(Math.max(1, ...all));
  const min = Math.min(...all) < 0 ? -niceMax(-Math.min(...all)) : 0;
  const span = max - min;
  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + ((max - v) / span) * (H - PAD.t - PAD.b);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * span);
  const step = Math.max(1, Math.ceil(n / 8));
  const full = fmtFull ?? fmt;

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (n - 1)))));
  };

  return (
    <div ref={ref} className="relative" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Chart of ${series.map((s) => s.name).join(', ')}`}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.name} id={`${gid}-${i}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#1e2520" strokeOpacity={Math.abs(t) < 1e-9 ? 0.3 : 0.08} strokeDasharray={Math.abs(t) < 1e-9 ? undefined : '3 5'} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {fmt(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
              {l}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = s.data.map((v, i): [number, number] => [x(i), y(v)]);
          const line = smooth(pts);
          return (
            <g key={s.name}>
              {fill && <path d={`${line}L${x(n - 1)},${y(Math.max(0, min))}L${x(0)},${y(Math.max(0, min))}Z`} fill={`url(#${gid}-${si})`} className="anim-fade" style={{ ['--d' as string]: '700ms' }} />}
              <path d={line} fill="none" stroke={s.color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="anim-draw" style={{ ['--d' as string]: `${si * 150}ms` }} />
            </g>
          );
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="#1e2520" strokeOpacity="0.25" strokeDasharray="3 4" />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r="5" fill="#fcfaf6" stroke={s.color} strokeWidth="2.5" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && (
        <Tooltip x={(x(hover) / W) * 100}>
          <p className="mb-1 font-semibold">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular-nums">{full(s.data[hover])}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export function BarChart({ labels, series, stacked = false, fmt = rupeeCompact, fmtFull, height = 240 }: { labels: string[]; series: Series[]; stacked?: boolean; fmt?: (n: number) => string; fmtFull?: (n: number) => string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const H = height;
  const n = labels.length;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.data[i], 0));
  const max = niceMax(Math.max(1, ...(stacked ? totals : series.flatMap((s) => s.data))));
  const slot = (W - PAD.l - PAD.r) / n;
  const bw = stacked ? Math.min(34, slot * 0.6) : Math.min(22, (slot * 0.7) / series.length);
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b);
  const base = y(0);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const step = Math.max(1, Math.ceil(n / 12));
  const full = fmtFull ?? fmt;

  return (
    <div className="relative" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`Bar chart of ${series.map((s) => s.name).join(', ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="#1e2520" strokeOpacity={t === 0 ? 0.25 : 0.08} strokeDasharray={t === 0 ? undefined : '3 5'} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px]">
              {fmt(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          let acc = 0;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.45} className="transition-opacity duration-200">
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              {series.map((s, si) => {
                const v = s.data[i];
                const h = base - y(v);
                const bx = stacked ? cx - bw / 2 : cx - (bw * series.length) / 2 + si * bw;
                const by = stacked ? base - ((acc += v) / max) * (H - PAD.t - PAD.b) : y(v);
                return <rect key={s.name} x={bx} y={by} width={bw - (stacked ? 0 : 2)} height={Math.max(0, h)} rx="2" fill={s.color} className="anim-grow-y" style={{ ['--d' as string]: `${i * 35}ms` }} />;
              })}
              {i % step === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                  {l}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tooltip x={((PAD.l + slot * hover + slot / 2) / W) * 100}>
          <p className="mb-1 font-semibold">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="tabular-nums">{full(s.data[hover])}</span>
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, center, sub, fmt = (n: number) => n.toLocaleString('en-IN'), size = 190 }: { slices: Slice[]; center?: string; sub?: string; fmt?: (n: number) => string; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), 60);
    return () => window.clearTimeout(t);
  }, []);
  const total = useMemo(() => slices.reduce((a, s) => a + s.value, 0), [slices]);
  let acc = 0;
  const r = 38;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" role="img" aria-label="Breakdown chart">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#1e2520" strokeOpacity="0.06" strokeWidth="14" />
          {slices.map((s, i) => {
            const pct = total ? (s.value / total) * 100 : 0;
            const off = acc;
            acc += pct;
            return (
              <circle
                key={s.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? 17 : 14}
                pathLength={100}
                strokeDasharray={`${ready ? Math.max(0, pct - 0.8) : 0} 100`}
                strokeDashoffset={-off}
                className="cursor-pointer transition-[stroke-dasharray,stroke-width] duration-1000 ease-[var(--ease-soft)]"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="display text-2xl leading-none">{hover !== null ? fmt(slices[hover].value) : (center ?? fmt(total))}</p>
            <p className="mt-1 max-w-24 text-[0.7rem] text-muted">{hover !== null ? slices[hover].label : sub}</p>
          </div>
        </div>
      </div>
      <ul className="min-w-40 flex-1 space-y-2 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} className={cn('flex items-center justify-between gap-3 border-b border-line pb-2 transition-opacity last:border-0', hover !== null && hover !== i && 'opacity-45')}>
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
            <span className="tabular-nums text-muted">
              {fmt(s.value)} <span className="text-xs">· {total ? Math.round((s.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal ranked bars (top products, busiest courts…). */
export function HBars({ rows, fmt = (n: number) => n.toLocaleString('en-IN'), color = C.olive }: { rows: { label: string; value: number; sub?: string }[]; fmt?: (n: number) => string; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted">{r.sub ? `${r.sub} · ` : ''}{fmt(r.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/8">
            <div className="anim-grow-x h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color, ['--d' as string]: `${i * 70}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
