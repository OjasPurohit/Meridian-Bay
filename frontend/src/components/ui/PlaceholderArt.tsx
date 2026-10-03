import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Art-directed stand-in for photography. The repo has no club photos yet (every image_url is null), so each slot
 * renders an illustrated scene and an explicit "Photo placeholder" tag. Pass `src` once real photos exist.
 */
export type ArtVariant = 'tennis-clay' | 'tennis-hard' | 'padel' | 'cricket' | 'badminton' | 'shop' | 'bar' | 'social';

interface Props {
  variant: ArtVariant;
  caption: string;
  src?: string | null;
  className?: string;
  /** Court rotation in degrees for varied crops. */
  tilt?: number;
  /** Court scale multiplier (1 = fits, >1 = tighter crop). */
  zoom?: number;
  showTag?: boolean;
  slats?: boolean;
  animate?: boolean;
}

const GROUND: Record<ArtVariant, [string, string]> = {
  'tennis-clay': ['#cf9271', '#b4694a'],
  'tennis-hard': ['#6b8468', '#4c6450'],
  padel: ['#3f5747', '#2d4034'],
  cricket: ['#6f8a62', '#526c4b'],
  badminton: ['#cf9d62', '#ae7b45'],
  shop: ['#e8d9c7', '#d8c2a8'],
  bar: ['#efe5d6', '#dccab2'],
  social: ['#2b3a30', '#1b241e'],
};

const LINE = 'rgba(252,250,246,0.88)';

function Lines({ children }: { children: ReactNode }) {
  return (
    <g className="court-lines" fill="none" stroke={LINE} strokeWidth={5} strokeLinecap="square">
      {children}
    </g>
  );
}

function Court({ w, h, scale, tilt, children }: { w: number; h: number; scale: number; tilt: number; children: ReactNode }) {
  return <g transform={`translate(600 400) rotate(${tilt}) scale(${scale}) translate(${-w / 2} ${-h / 2})`}>{children}</g>;
}

function TennisCourt({ tilt, zoom }: { tilt: number; zoom: number }) {
  return (
    <Court w={78} h={36} scale={13.2 * zoom} tilt={tilt}>
      <Lines>
        <rect x={0} y={0} width={78} height={36} />
        <path d="M0 4.5H78M0 31.5H78M18 4.5V31.5M60 4.5V31.5M18 18H60M0 18H0.8M77.2 18H78" />
      </Lines>
      <path d="M39 -2V38" stroke="rgba(30,37,32,0.55)" strokeWidth={9} vectorEffect="non-scaling-stroke" />
      <path d="M39.6 -2V38" stroke="rgba(30,37,32,0.18)" strokeWidth={22} vectorEffect="non-scaling-stroke" />
    </Court>
  );
}

function PadelCourt({ tilt, zoom }: { tilt: number; zoom: number }) {
  return (
    <Court w={20} h={10} scale={50 * zoom} tilt={tilt}>
      <rect x={-0.4} y={-0.4} width={20.8} height={10.8} fill="none" stroke="rgba(201,218,221,0.55)" strokeWidth={18} vectorEffect="non-scaling-stroke" />
      <Lines>
        <rect x={0} y={0} width={20} height={10} />
        <path d="M3.05 0V10M16.95 0V10M3.05 5H16.95" />
      </Lines>
      <path d="M10 -0.6V10.6" stroke="rgba(30,37,32,0.6)" strokeWidth={9} vectorEffect="non-scaling-stroke" />
    </Court>
  );
}

function BadmintonCourt({ tilt, zoom }: { tilt: number; zoom: number }) {
  return (
    <Court w={13.4} h={6.1} scale={76 * zoom} tilt={tilt}>
      <Lines>
        <rect x={0} y={0} width={13.4} height={6.1} />
        <path d="M0 0.46H13.4M0 5.64H13.4M4.72 0V6.1M8.68 0V6.1M0.76 0V6.1M12.64 0V6.1M0 3.05H4.72M8.68 3.05H13.4" />
      </Lines>
      <path d="M6.7 -0.4V6.5" stroke="rgba(30,37,32,0.55)" strokeWidth={7} vectorEffect="non-scaling-stroke" />
    </Court>
  );
}

function CricketPitch({ tilt, zoom }: { tilt: number; zoom: number }) {
  return (
    <Court w={22} h={3.05} scale={46 * zoom} tilt={tilt}>
      <rect x={0} y={0} width={22} height={3.05} fill="#d9c4a2" />
      <Lines>
        <path d="M1 0V3.05M21 0V3.05M2.22 -0.4V3.45M19.78 -0.4V3.45M1 0.2H2.22M1 2.85H2.22M19.78 0.2H21M19.78 2.85H21" />
      </Lines>
      {[1, 21].map((x) => (
        <g key={x} fill="#f1e6d2">
          {[1.36, 1.525, 1.69].map((y) => (
            <circle key={y} cx={x} cy={y} r={0.07} />
          ))}
        </g>
      ))}
    </Court>
  );
}

function Balls() {
  const balls = [
    [250, 300, 120],
    [470, 520, 96],
    [760, 260, 132],
    [980, 560, 104],
    [600, 720, 88],
    [140, 640, 80],
  ];
  return (
    <g>
      {balls.map(([x, y, r], i) => (
        <g key={i} transform={`translate(${x} ${y}) rotate(${i * 47})`}>
          <ellipse cx={r * 0.35} cy={r * 0.5} rx={r} ry={r * 0.86} fill="rgba(30,37,32,0.14)" />
          <circle r={r} fill={i % 2 ? '#d2a14e' : '#d79b43'} />
          <circle r={r} fill="url(#ball-light)" />
          <path
            d={`M${-r * 0.72} ${-r * 0.7} C ${-r * 0.1} ${-r * 0.25}, ${-r * 0.1} ${r * 0.25}, ${-r * 0.72} ${r * 0.7} M${r * 0.72} ${-r * 0.7} C ${r * 0.1} ${-r * 0.25}, ${r * 0.1} ${r * 0.25}, ${r * 0.72} ${r * 0.7}`}
            fill="none"
            stroke="rgba(252,250,246,0.9)"
            strokeWidth={r * 0.06}
          />
        </g>
      ))}
    </g>
  );
}

function Table() {
  return (
    <g>
      <circle cx={430} cy={380} r={210} fill="none" stroke="rgba(120,80,50,0.12)" strokeWidth={10} />
      <g transform="translate(760 330)">
        <ellipse cx={30} cy={40} rx={150} ry={140} fill="rgba(30,37,32,0.10)" />
        <circle r={150} fill="#fcfaf6" />
        <circle r={150} fill="none" stroke="#e1d3c0" strokeWidth={4} />
        <circle r={78} fill="#7a4a2e" />
        <circle r={78} fill="url(#ball-light)" opacity={0.6} />
        <path d="M150 -10h70a30 30 0 0 1 0 60h-40" fill="none" stroke="#fcfaf6" strokeWidth={18} strokeLinecap="round" />
      </g>
      <g transform="translate(380 560)">
        <ellipse cx={20} cy={30} rx={96} ry={92} fill="rgba(30,37,32,0.10)" />
        <circle r={96} fill="rgba(201,218,221,0.55)" stroke="rgba(252,250,246,0.9)" strokeWidth={6} />
        <circle cx={-20} cy={-14} r={34} fill="#b9c46a" opacity={0.85} />
        <circle cx={-20} cy={-14} r={26} fill="none" stroke="#f4f0d8" strokeWidth={3} />
      </g>
      <g transform="translate(260 250)" opacity={0.9}>
        <rect x={-120} y={-34} width={240} height={68} rx={34} fill="#c98a6a" opacity={0.35} transform="rotate(-18)" />
      </g>
    </g>
  );
}

export function PlaceholderArt({ variant, caption, src, className, tilt = -6, zoom = 1, showTag = true, slats = false, animate = false }: Props) {
  const id = useId().replace(/:/g, '');
  const [g0, g1] = GROUND[variant];

  if (src) {
    return (
      <div className={cn('relative overflow-hidden', className)}>
        <img src={src} alt={caption} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      </div>
    );
  }

  return (
    <div className={cn('grain relative overflow-hidden', className)} role="img" aria-label={`Photo placeholder: ${caption}`}>
      <svg className={cn('absolute inset-0 h-full w-full', animate && 'hero-drift')} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={`g-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={g0} />
            <stop offset="1" stopColor={g1} />
          </linearGradient>
          <radialGradient id={`sun-${id}`} cx="0.82" cy="0.08" r="0.9">
            <stop offset="0" stopColor="#ffe9c2" stopOpacity={variant === 'social' ? 0 : 0.55} />
            <stop offset="0.55" stopColor="#ffe9c2" stopOpacity={0} />
          </radialGradient>
          <radialGradient id="ball-light" cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#fff6dc" stopOpacity={0.55} />
            <stop offset="1" stopColor="#5a3b1e" stopOpacity={0.25} />
          </radialGradient>
          <pattern id={`planks-${id}`} width="1200" height="64" patternUnits="userSpaceOnUse">
            <path d="M0 63.5H1200" stroke="rgba(90,55,25,0.22)" strokeWidth={2} />
          </pattern>
          <pattern id={`mesh-${id}`} width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V34M0 0H34" stroke="rgba(30,37,32,0.22)" strokeWidth={1.5} />
          </pattern>
          <pattern id={`slats-${id}`} width="150" height="150" patternUnits="userSpaceOnUse" patternTransform="rotate(-32)">
            <rect width="46" height="150" fill="rgba(40,30,22,0.24)" />
          </pattern>
          <filter id={`soft-${id}`}>
            <feGaussianBlur stdDeviation="9" />
          </filter>
          {variant === 'social' && (
            <radialGradient id={`flood-${id}`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f3d79e" stopOpacity={0.42} />
              <stop offset="1" stopColor="#f3d79e" stopOpacity={0} />
            </radialGradient>
          )}
        </defs>

        <rect width="1200" height="800" fill={`url(#g-${id})`} />
        {variant === 'badminton' && <rect width="1200" height="800" fill={`url(#planks-${id})`} transform={`rotate(${tilt} 600 400) scale(1.4) translate(-170 -115)`} />}

        {(variant === 'tennis-clay' || variant === 'tennis-hard') && <TennisCourt tilt={tilt} zoom={zoom} />}
        {variant === 'padel' && <PadelCourt tilt={tilt} zoom={zoom} />}
        {variant === 'badminton' && <BadmintonCourt tilt={tilt} zoom={zoom} />}
        {variant === 'cricket' && (
          <>
            <CricketPitch tilt={tilt} zoom={zoom} />
            <rect width="1200" height="800" fill={`url(#mesh-${id})`} />
          </>
        )}
        {variant === 'social' && (
          <>
            <TennisCourt tilt={tilt} zoom={zoom} />
            {[
              [220, 160],
              [980, 160],
              [220, 660],
              [980, 660],
            ].map(([x, y]) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r={360} fill={`url(#flood-${id})`} />
            ))}
          </>
        )}
        {variant === 'shop' && <Balls />}
        {variant === 'bar' && <Table />}

        {slats && <rect width="1200" height="800" fill={`url(#slats-${id})`} filter={`url(#soft-${id})`} />}
        <rect width="1200" height="800" fill={`url(#sun-${id})`} />
      </svg>

      {showTag && (
        <span className="absolute bottom-3 left-3 z-10 inline-flex items-center gap-2 bg-chalk/85 px-2.5 py-1 text-[0.66rem] font-semibold tracking-[0.14em] text-ink/80 uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-terracotta" aria-hidden="true" />
          Photo placeholder · {caption}
        </span>
      )}
    </div>
  );
}
