import type { ProductCategory } from '@shared/constants/enums';

type Kind = 'racket' | 'padel' | 'tennis-ball' | 'cricket-ball' | 'shuttle' | 'shoe' | 'bag' | 'tee';

/** Picks an illustration from the product's own category and name. */
export function glyphFor(category: ProductCategory, name: string): Kind {
  if (category === 'RACKET') return /padel/i.test(name) ? 'padel' : 'racket';
  if (category === 'BALL') return /shuttle/i.test(name) ? 'shuttle' : /cricket/i.test(name) ? 'cricket-ball' : 'tennis-ball';
  if (category === 'SHOES') return 'shoe';
  if (category === 'APPAREL') return 'tee';
  return 'bag';
}

const INK = '#314237';
const STROKE = { stroke: INK, strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const LINE = { ...STROKE, fill: 'none' };

export function GearGlyph({ kind, className }: { kind: Kind; className?: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden="true">
      <ellipse cx="100" cy="132" rx="56" ry="6" fill={INK} opacity="0.08" />
      {kind === 'racket' && (
        <g transform="rotate(-32 100 75)">
          <ellipse cx="100" cy="48" rx="30" ry="38" {...LINE} />
          {[-18, -9, 0, 9, 18].map((x) => (
            <path key={x} d={`M${100 + x} ${18 + Math.abs(x) * 0.5} V${78 - Math.abs(x) * 0.5}`} stroke={INK} strokeWidth="1" opacity="0.5" />
          ))}
          {[30, 40, 50, 60, 70].map((y) => (
            <path key={y} d={`M76 ${y} H124`} stroke={INK} strokeWidth="1" opacity="0.5" />
          ))}
          <path d="M92 84 L98 100 M108 84 L102 100" {...LINE} />
          <rect x="95" y="100" width="10" height="36" rx="3" fill="#b95f42" />
        </g>
      )}
      {kind === 'padel' && (
        <g transform="rotate(-28 100 75)">
          <path d="M100 12 C 128 12, 136 40, 132 62 C 128 84, 112 92, 104 98 L96 98 C 88 92, 72 84, 68 62 C 64 40, 72 12, 100 12 Z" fill="#e8d9c7" {...STROKE} />
          {[
            [88, 36],
            [100, 32],
            [112, 36],
            [84, 50],
            [96, 48],
            [108, 48],
            [116, 52],
            [92, 62],
            [104, 62],
          ].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" fill={INK} opacity="0.6" />
          ))}
          <rect x="95" y="98" width="10" height="36" rx="3" fill="#b95f42" />
        </g>
      )}
      {kind === 'tennis-ball' && (
        <g>
          <circle cx="100" cy="74" r="40" fill="#d6cf63" />
          <path d="M71 46 C 92 62, 92 86, 71 102 M129 46 C 108 62, 108 86, 129 102" fill="none" stroke="#fcfaf6" strokeWidth="4" strokeLinecap="round" />
        </g>
      )}
      {kind === 'cricket-ball' && (
        <g>
          <circle cx="100" cy="74" r="38" fill="#9c3b2a" />
          <path d="M70 52 C 90 66, 110 66, 130 52 M70 58 C 90 72, 110 72, 130 58" fill="none" stroke="#f1e6d2" strokeWidth="2" strokeDasharray="3 4" />
          <circle cx="88" cy="62" r="10" fill="#fff" opacity="0.12" />
        </g>
      )}
      {kind === 'shuttle' && (
        <g transform="rotate(-20 100 75)">
          <path d="M84 30 L116 30 L108 96 L92 96 Z" fill="#fcfaf6" {...STROKE} />
          {[90, 100, 110].map((x) => (
            <path key={x} d={`M${x} 30 L${100 + (x - 100) * 0.5} 96`} stroke={INK} strokeWidth="1" opacity="0.4" />
          ))}
          <path d="M88 52 H112 M90 72 H110" stroke={INK} strokeWidth="1.5" opacity="0.5" />
          <path d="M92 96 C 92 116, 108 116, 108 96 Z" fill="#b95f42" />
        </g>
      )}
      {kind === 'shoe' && (
        <g>
          <path d="M40 104 C 40 88, 52 80, 66 78 L90 60 C 96 56, 104 58, 108 64 L118 80 C 134 84, 158 88, 162 100 L162 110 L40 110 Z" fill="#fcfaf6" {...STROKE} />
          <path d="M40 110 H162" stroke="#b95f42" strokeWidth="6" strokeLinecap="round" />
          <path d="M84 70 L96 82 M92 64 L104 76" stroke={INK} strokeWidth="2" opacity="0.6" />
        </g>
      )}
      {kind === 'bag' && (
        <g>
          <path d="M68 52 C 68 34, 132 34, 132 52" {...LINE} />
          <rect x="42" y="52" width="116" height="62" rx="22" fill="#58705a" />
          <path d="M42 80 H158" stroke="#fcfaf6" strokeWidth="2" opacity="0.5" />
          <rect x="88" y="72" width="24" height="16" rx="3" fill="#d79b43" />
        </g>
      )}
      {kind === 'tee' && (
        <path d="M76 30 L60 36 L40 56 L54 70 L66 62 L66 118 L134 118 L134 62 L146 70 L160 56 L140 36 L124 30 C 120 40, 80 40, 76 30 Z" fill="#fcfaf6" {...STROKE} />
      )}
    </svg>
  );
}
