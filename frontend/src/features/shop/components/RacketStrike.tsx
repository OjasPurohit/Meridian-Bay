import { useEffect, useId, useRef } from 'react';

/**
 * Racket-meets-ball scene. Pure SVG; frames are written as attributes inside a single rAF, so React never
 * re-renders while scrolling.
 */

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

const PIVOT = { x: 520, y: 905 };
const LEN = 600;
const GROUND = 690;
const R = 30;
const CONTACT_T = 0.55;
const BOUNCE_T = 0.32;
const THETA_BACK = -75;
const THETA_HIT = 32.9;
const THETA_FOLLOW = 80;
/** Frame shown when motion is reduced: an instant before contact, before the ball squashes. */
export const STATIC_PROGRESS = CONTACT_T - 0.02;

function ballAt(t: number) {
  if (t <= BOUNCE_T) {
    const s = t / BOUNCE_T;
    return { x: 900 - 30 * s, y: 90 + 570 * s * s, scale: 1, opacity: 1 };
  }
  if (t <= CONTACT_T) {
    const s = seg(t, BOUNCE_T, CONTACT_T);
    return { x: 870 - 40 * s, y: 660 - 280 * (1 - (1 - s) ** 2), scale: 1, opacity: 1 };
  }
  const s = seg(t, CONTACT_T, 1);
  const e = easeOut(s);
  return { x: 830 + 470 * e, y: 380 - 340 * e + 60 * e * e, scale: 1 - 0.65 * e, opacity: 1 - seg(s, 0.75, 1) };
}

function thetaAt(t: number) {
  if (t < 0.18) return THETA_BACK;
  if (t <= CONTACT_T) {
    const s = seg(t, 0.18, CONTACT_T);
    return lerp(THETA_BACK, THETA_HIT, s * s);
  }
  return lerp(THETA_HIT, THETA_FOLLOW, easeOut(seg(t, CONTACT_T, 0.8)));
}

/** Squash on the bounce (vertical) and on the strings (horizontal). */
function squashAt(t: number) {
  const g = 1 - clamp(Math.abs(t - BOUNCE_T) / 0.03);
  const h = 1 - clamp(Math.abs(t - CONTACT_T) / 0.025);
  return { sx: 1 + 0.16 * g - 0.22 * h, sy: 1 - 0.22 * g + 0.16 * h };
}

interface Props {
  className?: string;
  /**
   * scroll — scrubbed by `progressFor` (0..1);
   * inview — plays once when the stage is mostly visible (small screens);
   * static — the contact frame only (reduced motion).
   */
  mode: 'scroll' | 'inview' | 'static';
  progressFor?: () => number;
  /** Motion trails and bounce dust (desktop only). */
  rich?: boolean;
  onProgress?: (t: number) => void;
}

const INVIEW_MS = 1500;
/** Small screens settle just after contact, so the last frame still shows racket and ball. */
const INVIEW_END = 0.6;

export function RacketStrike({ className, mode, progressFor, rich = true, onProgress }: Props) {
  const uid = useId().replace(/:/g, '');
  const svg = useRef<SVGSVGElement>(null);
  const racket = useRef<SVGUseElement>(null);
  const ghostA = useRef<SVGUseElement>(null);
  const ghostB = useRef<SVGUseElement>(null);
  const ball = useRef<SVGGElement>(null);
  const ballBody = useRef<SVGGElement>(null);
  const seam = useRef<SVGGElement>(null);
  const shadow = useRef<SVGEllipseElement>(null);
  const ring = useRef<SVGCircleElement>(null);
  const dust = useRef<SVGEllipseElement>(null);
  const strings = useRef<SVGGElement>(null);
  const last = useRef({ t: -1, theta: THETA_BACK });

  useEffect(() => {
    const draw = (t: number) => {
      const theta = thetaAt(t);
      const omega = Math.abs(theta - last.current.theta);
      last.current = { t, theta };

      const px = PIVOT.x - 40 * seg(t, 0.2, 0.7);
      const tr = (a: number) => `translate(${px} ${PIVOT.y}) rotate(${a})`;
      racket.current?.setAttribute('transform', tr(theta));
      const trail = rich && t > 0.2 && t < 0.78 ? clamp(omega / 6, 0, 1) : 0;
      const dir = t < CONTACT_T ? -1 : -0.6;
      ghostA.current?.setAttribute('transform', tr(theta + dir * 7));
      ghostA.current?.setAttribute('opacity', String(0.28 * trail));
      ghostB.current?.setAttribute('transform', tr(theta + dir * 14));
      ghostB.current?.setAttribute('opacity', String(0.14 * trail));

      const deflect = 1 - clamp(Math.abs(t - CONTACT_T) / 0.04);
      strings.current?.setAttribute('transform', `translate(0 ${-LEN}) scale(${1 - 0.03 * deflect} ${1 + 0.02 * deflect}) translate(0 ${LEN})`);

      const b = ballAt(t);
      const { sx, sy } = squashAt(t);
      ball.current?.setAttribute('transform', `translate(${b.x} ${b.y}) scale(${b.scale})`);
      ball.current?.setAttribute('opacity', String(b.opacity));
      ballBody.current?.setAttribute('transform', `scale(${sx} ${sy})`);
      seam.current?.setAttribute('transform', `rotate(${t * 900})`);

      const h = clamp((GROUND - R - b.y) / 600);
      shadow.current?.setAttribute('cx', String(b.x + 18 + h * 40));
      shadow.current?.setAttribute('rx', String(R * (1.1 - 0.55 * h) * b.scale));
      shadow.current?.setAttribute('opacity', String(0.32 * (1 - 0.85 * h) * b.opacity * (t > CONTACT_T ? 1 - seg(t, CONTACT_T, 0.7) : 1)));

      const rs = seg(t, CONTACT_T, 0.7);
      ring.current?.setAttribute('r', String(14 + 150 * easeOut(rs)));
      ring.current?.setAttribute('opacity', String(rs > 0 && rs < 1 ? 0.7 * (1 - rs) : 0));

      const ds = seg(t, BOUNCE_T, 0.46);
      dust.current?.setAttribute('rx', String(20 + 80 * easeOut(ds)));
      dust.current?.setAttribute('ry', String(5 + 9 * easeOut(ds)));
      dust.current?.setAttribute('opacity', String(rich && ds > 0 && ds < 1 ? 0.35 * (1 - ds) : 0));

      onProgress?.(t);
    };

    if (mode === 'static' || (mode === 'scroll' && !progressFor)) {
      draw(STATIC_PROGRESS);
      return;
    }

    let frame = 0;
    if (mode === 'inview') {
      draw(0);
      const io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          const start = performance.now();
          const tick = (now: number) => {
            const k = Math.min(1, (now - start) / INVIEW_MS);
            draw(k * INVIEW_END);
            if (k < 1) frame = requestAnimationFrame(tick);
            else ring.current?.setAttribute('opacity', '0');
          };
          frame = requestAnimationFrame(tick);
        },
        { threshold: 0.6 },
      );
      if (svg.current) io.observe(svg.current);
      return () => {
        io.disconnect();
        cancelAnimationFrame(frame);
      };
    }

    const scrub = progressFor!;
    draw(scrub());
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const t = scrub();
        if (Math.abs(t - last.current.t) > 0.0005) draw(t);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [mode, progressFor, rich, onProgress]);

  const id = (k: string) => `${k}-${uid}`;
  const mains = Array.from({ length: 16 }, (_, i) => -90 + i * 12);
  const crosses = Array.from({ length: 21 }, (_, i) => -720 + i * 12);

  return (
    <svg ref={svg} className={className} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={id('sun')} cx="0.78" cy="0.12" r="0.85">
          <stop offset="0" stopColor="#fff1d6" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#fff1d6" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id('court')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c98a6a" />
          <stop offset="1" stopColor="#a9603f" />
        </linearGradient>
        <linearGradient id={id('frame')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#1e2520" />
          <stop offset="0.45" stopColor="#4a554c" />
          <stop offset="0.55" stopColor="#6c776d" />
          <stop offset="1" stopColor="#1e2520" />
        </linearGradient>
        <linearGradient id={id('grip')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9c6ad" />
          <stop offset="0.5" stopColor="#f3e9da" />
          <stop offset="1" stopColor="#c7b193" />
        </linearGradient>
        <radialGradient id={id('felt')} cx="0.36" cy="0.32" r="0.78">
          <stop offset="0" stopColor="#ecea9a" />
          <stop offset="0.55" stopColor="#cfc95a" />
          <stop offset="1" stopColor="#8f8a34" />
        </radialGradient>
        <filter id={id('fuzz')} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" />
        </filter>
        <filter id={id('lift')} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="10" dy="16" stdDeviation="10" floodColor="#1e2520" floodOpacity="0.28" />
        </filter>
        <filter id={id('ballLift')} x="-150%" y="-150%" width="400%" height="400%">
          <feDropShadow dx="6" dy="10" stdDeviation="6" floodColor="#1e2520" floodOpacity="0.25" />
        </filter>
        <filter id={id('blur')} x="-100%" y="-300%" width="300%" height="700%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <clipPath id={id('bed')}>
          <ellipse cx="0" cy={-LEN} rx="88" ry="116" />
        </clipPath>
        <clipPath id={id('handle')}>
          <path d="M-17 -250 L17 -250 L19 -22 L-19 -22 Z" />
        </clipPath>

        <g id={id('racket')}>
          <g clipPath={`url(#${id('handle')})`}>
            <rect x="-22" y="-252" width="44" height="232" fill={`url(#${id('grip')})`} />
            {Array.from({ length: 14 }, (_, i) => (
              <path key={i} d={`M-24 ${-238 + i * 16} L24 ${-250 + i * 16}`} stroke="#a88f70" strokeWidth="3" opacity="0.55" />
            ))}
          </g>
          <rect x="-22" y="-24" width="44" height="24" rx="6" fill="#1e2520" />
          <rect x="-19" y="-262" width="38" height="16" rx="3" fill="#2b332d" />
          <path d="M-14 -258 C -40 -330, -78 -400, -70 -478 M14 -258 C 40 -330, 78 -400, 70 -478" fill="none" stroke={`url(#${id('frame')})`} strokeWidth="15" strokeLinecap="round" />
          <path d="M-62 -482 Q 0 -462 62 -482" fill="none" stroke="#2b332d" strokeWidth="9" strokeLinecap="round" />
          <g ref={strings} clipPath={`url(#${id('bed')})`}>
            <rect x="-100" y={-LEN - 130} width="200" height="260" fill="rgba(252,250,246,0.06)" />
            {mains.map((x) => (
              <path key={`m${x}`} d={`M${x} -740 V-460`} stroke="rgba(252,250,246,0.8)" strokeWidth="1.7" />
            ))}
            {crosses.map((y) => (
              <path key={`c${y}`} d={`M-100 ${y} H100`} stroke="rgba(252,250,246,0.62)" strokeWidth="1.5" />
            ))}
          </g>
          <ellipse cx="0" cy={-LEN} rx="100" ry="128" fill="none" stroke={`url(#${id('frame')})`} strokeWidth="15" />
          <ellipse cx="0" cy={-LEN} rx="100" ry="128" fill="none" stroke="#a4523a" strokeWidth="15" strokeDasharray="70 340" strokeDashoffset="-150" opacity="0.9" />
          <ellipse cx="-3" cy={-LEN - 3} rx="94" ry="122" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
          <path d={`M-48 ${-LEN - 115} Q 0 ${-LEN - 140} 48 ${-LEN - 115}`} fill="none" stroke="#141a16" strokeWidth="11" strokeLinecap="round" />
        </g>
      </defs>

      <rect width="1200" height="800" fill="#f1e7d8" />
      <rect width="1200" height="800" fill={`url(#${id('sun')})`} />
      <rect x="0" y={GROUND} width="1200" height={800 - GROUND} fill={`url(#${id('court')})`} />
      <rect x="0" y={GROUND} width="1200" height="5" fill="rgba(252,250,246,0.9)" />

      <ellipse ref={dust} cx="870" cy={GROUND + 4} rx="20" ry="5" fill="#e8d9c7" opacity="0" />
      <ellipse ref={shadow} cx="888" cy={GROUND + 6} rx="30" ry="8" fill="#1e2520" opacity="0.3" filter={`url(#${id('blur')})`} />

      <use ref={ghostB} href={`#${id('racket')}`} opacity="0" />
      <use ref={ghostA} href={`#${id('racket')}`} opacity="0" />
      <use ref={racket} href={`#${id('racket')}`} filter={`url(#${id('lift')})`} />

      <circle ref={ring} cx="838" cy="388" r="14" fill="none" stroke="#d79b43" strokeWidth="3" opacity="0" />

      <g ref={ball} filter={`url(#${id('ballLift')})`}>
        <g ref={ballBody}>
          <circle r={R} fill={`url(#${id('felt')})`} filter={`url(#${id('fuzz')})`} />
          <g ref={seam}>
            <path d={`M${-R * 0.78} ${-R * 0.62} C ${-R * 0.12} ${-R * 0.22}, ${-R * 0.12} ${R * 0.22}, ${-R * 0.78} ${R * 0.62} M${R * 0.78} ${-R * 0.62} C ${R * 0.12} ${-R * 0.22}, ${R * 0.12} ${R * 0.22}, ${R * 0.78} ${R * 0.62}`} fill="none" stroke="#fbf8ec" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}
