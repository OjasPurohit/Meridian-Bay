import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, TrendingDown, TrendingUp, X, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Sparkline } from './charts';

/* ------------------------------------------------------------------ buttons / fields (one vocabulary, existing tokens) */
export const btn = {
  primary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-olive px-5 text-sm font-semibold text-chalk transition-[background-color,transform,box-shadow] duration-200 hover:bg-ink hover:shadow-[0_10px_24px_-12px_rgba(30,37,32,0.7)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
  accent:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-chalk transition-[background-color,transform,box-shadow] duration-200 hover:bg-terracotta hover:shadow-[0_10px_24px_-12px_rgba(164,82,58,0.8)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
  secondary:
    'inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/25 px-5 text-sm font-semibold text-ink transition-[background-color,color,border-color,transform] duration-200 hover:border-ink hover:bg-ink hover:text-chalk active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
  quiet:
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold text-ink/75 transition-colors duration-200 hover:bg-ink/8 hover:text-ink active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
  danger:
    'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3 text-[0.8rem] font-semibold text-primary transition-colors duration-200 hover:bg-terracotta/12 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
};

export const field =
  'min-h-11 w-full border border-line bg-chalk px-3.5 text-[0.95rem] text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-muted/70 hover:border-ink/40 focus:border-olive focus:shadow-[0_0_0_3px_rgba(88,112,90,0.18)] focus:outline-none';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow text-olive-mid">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/* ------------------------------------------------------------------ motion helpers */
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from 0 (or its previous value) to `value`. */
export function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(reducedMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - p, 4);
      setShown(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const n = useCountUp(value);
  return <span className="tabular-nums">{format ? format(n) : Math.round(n).toLocaleString('en-IN')}</span>;
}

/** True after `ms` — lets pages show a brief, deliberate skeleton instead of popping in. */
export function usePageReady(ms = 380) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setReady(true), reducedMotion() ? 0 : ms);
    return () => window.clearTimeout(t);
  }, [ms]);
  return ready;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-56" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ surfaces */
export function Card({ className, children, lift = false, style }: { className?: string; children: ReactNode; lift?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={style} className={cn('min-w-0 border border-line bg-chalk', lift && 'card-lift', className)}>
      {children}
    </div>
  );
}

export function Section({ eyebrow, title, action, children, className, delay = 0 }: { eyebrow?: string; title: string; action?: ReactNode; children: ReactNode; className?: string; delay?: number }) {
  return (
    <section style={{ ['--d' as string]: `${delay}ms` }} className={cn('anim-rise min-w-0 border border-line bg-chalk p-5 sm:p-6', className)}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow && <p className="eyebrow text-olive-mid">{eyebrow}</p>}
          <h2 className="display mt-1 text-2xl sm:text-[1.65rem]">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="anim-rise">
        <p className="eyebrow text-olive-mid">{eyebrow}</p>
        <h1 className="display mt-2 text-[clamp(1.9rem,3.4vw,2.9rem)] leading-[1.02] text-balance">{title}</h1>
      </div>
      {children && <div className="anim-fade flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

const KPI_TONE = {
  olive: 'bg-olive text-chalk border-olive',
  chalk: 'bg-chalk text-ink border-line',
  sun: 'bg-sun/25 text-ink border-sun/50',
  rust: 'bg-primary text-chalk border-primary',
} as const;

export function Kpi({
  label,
  value,
  format,
  delta,
  note,
  icon: Icon,
  spark,
  tone = 'chalk',
  delay = 0,
  goodWhen = 'up',
}: {
  label: string;
  value: number;
  format?: (n: number) => string;
  delta?: number;
  note?: string;
  icon?: LucideIcon;
  spark?: number[];
  tone?: keyof typeof KPI_TONE;
  delay?: number;
  /** 'down' for costs: a rise is shown in the warning colour (the sign is always the true direction). */
  goodWhen?: 'up' | 'down';
}) {
  const dark = tone === 'olive' || tone === 'rust';
  return (
    <div style={{ ['--d' as string]: `${delay}ms` }} className={cn('anim-rise card-lift relative min-w-0 overflow-hidden border p-5', KPI_TONE[tone])}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn('eyebrow', dark ? 'text-chalk/70' : 'text-olive-mid')}>{label}</p>
        {Icon && (
          <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', dark ? 'bg-chalk/15' : 'bg-olive/10 text-olive')}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
      </div>
      <p className="display mt-3 text-[clamp(1.9rem,2.6vw,2.55rem)] leading-none">
        <CountUp value={value} format={format} />
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span className={cn('inline-flex items-center gap-1 font-semibold', (delta >= 0) === (goodWhen === 'up') ? (dark ? 'text-sun' : 'text-olive-mid') : dark ? 'text-sun' : 'text-primary')}>
            {delta >= 0 ? <TrendingUp className="size-3.5" aria-hidden="true" /> : <TrendingDown className="size-3.5" aria-hidden="true" />}
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(1)}%
          </span>
        )}
        {note && <span className={dark ? 'text-chalk/65' : 'text-muted'}>{note}</span>}
      </div>
      {spark && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 opacity-70">
          <Sparkline data={spark} color={dark ? '#d79b43' : '#58705a'} />
        </div>
      )}
    </div>
  );
}

const BADGE_TONE = {
  green: 'bg-olive/12 text-olive',
  sun: 'bg-sun/25 text-ink',
  rust: 'bg-terracotta/14 text-primary',
  muted: 'bg-ink/7 text-muted',
  dark: 'bg-olive text-chalk',
} as const;

export function Pill({ tone = 'muted', children, className }: { tone?: keyof typeof BADGE_TONE; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 text-[0.68rem] font-semibold tracking-[0.08em] whitespace-nowrap uppercase', BADGE_TONE[tone], className)}>{children}</span>;
}

export function Avatar({ name, size = 'md', tone = 'olive' }: { name: string; size?: 'sm' | 'md' | 'lg'; tone?: 'olive' | 'sun' | 'rust' | 'sky' }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const t = { olive: 'bg-olive text-chalk', sun: 'bg-sun text-ink', rust: 'bg-primary text-chalk', sky: 'bg-sky text-ink' }[tone];
  const s = { sm: 'size-8 text-[0.7rem]', md: 'size-10 text-sm', lg: 'size-14 text-lg' }[size];
  return <span className={cn('grid shrink-0 place-items-center rounded-full font-semibold', t, s)}>{initials}</span>;
}

export function Empty({ icon: Icon, title, body, action }: { icon?: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="anim-fade flex flex-col items-center gap-2 border border-dashed border-ink/20 px-6 py-10 text-center">
      {Icon && (
        <span className="grid size-12 place-items-center rounded-full bg-olive/10 text-olive">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <p className="display text-xl">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ tabs / segmented control (sliding indicator) */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: 'sm' | 'md' }) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const id = useId();
  return (
    <div role="tablist" aria-label={id} className={cn('relative inline-grid max-w-full overflow-x-auto rounded-full border border-line bg-sand p-1 no-scrollbar', className)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(max-content, 1fr))` }}>
      <span
        aria-hidden="true"
        className="absolute inset-y-1 rounded-full bg-olive shadow-[0_6px_16px_-8px_rgba(30,37,32,0.7)] transition-[left,width] duration-300 ease-[var(--ease-soft)]"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})`, left: `calc(0.25rem + ${idx} * (100% - 0.5rem) / ${options.length})` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn('relative z-10 inline-flex items-center justify-center gap-1.5 rounded-full px-4 font-semibold whitespace-nowrap transition-colors duration-200', size === 'sm' ? 'min-h-8 text-xs' : 'min-h-10 text-sm', o.value === value ? 'text-chalk' : 'text-ink/70 hover:text-ink')}
        >
          {o.label}
          {o.count !== undefined && <span className={cn('rounded-full px-1.5 text-[0.65rem]', o.value === value ? 'bg-chalk/20' : 'bg-ink/8')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn('min-h-9 rounded-full border px-4 text-[0.82rem] font-semibold transition-[background-color,color,border-color,transform] duration-200 active:scale-95', o.value === value ? 'border-olive bg-olive text-chalk' : 'border-line bg-chalk text-ink/75 hover:border-ink/40 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className={cn(field, 'pl-10')} />
    </div>
  );
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <div className="relative">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(field, 'appearance-none pr-9')}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
    </div>
  );
}

/* ------------------------------------------------------------------ data table */
export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: 'right';
  /** hide below this breakpoint to keep tables readable on phones */
  hide?: 'sm' | 'md' | 'lg';
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

export function DataTable<T>({ columns, rows, rowKey, empty, onRowClick, dense }: { columns: Column<T>[]; rows: T[]; rowKey: (r: T) => string; empty?: ReactNode; onRowClick?: (r: T) => void; dense?: boolean }) {
  if (rows.length === 0) return <>{empty ?? <Empty title="Nothing here yet" />}</>;
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink/15">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn('eyebrow px-3 py-2.5 whitespace-nowrap text-olive-mid', c.align === 'right' && 'text-right', c.hide && HIDE[c.hide], c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={rowKey(r)}
              style={{ ['--d' as string]: `${Math.min(i, 12) * 28}ms` }}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('anim-fade border-b border-line transition-colors duration-150 last:border-0 hover:bg-olive/6', onRowClick && 'cursor-pointer')}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn('px-3 align-middle', dense ? 'py-2' : 'py-3', c.align === 'right' && 'text-right tabular-nums', c.hide && HIDE[c.hide], c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ modal / drawer */
function useLockedOverlay(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
}

export function Drawer({ open, onClose, title, eyebrow, children, footer, width = 'max-w-md' }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  useLockedOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80]">
      <button type="button" aria-label="Close" onClick={onClose} className="anim-fade absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]" />
      <aside role="dialog" aria-modal="true" aria-label={title} className={cn('anim-slide-in absolute inset-y-0 right-0 flex w-full flex-col border-l border-line bg-sand shadow-[-30px_0_60px_-30px_rgba(30,37,32,0.5)]', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            {eyebrow && <p className="eyebrow text-olive-mid">{eyebrow}</p>}
            <h2 className="display mt-1 text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full transition-colors hover:bg-ink/8">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line bg-chalk px-6 py-4">{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({ open, onClose, title, eyebrow, children, footer, width = 'max-w-xl' }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; children: ReactNode; footer?: ReactNode; width?: string }) {
  useLockedOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center p-4">
      <button type="button" aria-label="Close" onClick={onClose} className="anim-fade absolute inset-0 cursor-default bg-ink/45 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('anim-pop relative flex max-h-[92svh] w-full flex-col border border-line bg-sand shadow-[0_40px_80px_-30px_rgba(30,37,32,0.6)]', width)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            {eyebrow && <p className="eyebrow text-olive-mid">{eyebrow}</p>}
            <h2 className="display mt-1 text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-10 place-items-center rounded-full transition-colors hover:bg-ink/8">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-line bg-chalk px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ toasts */
interface ToastItem {
  id: number;
  text: string;
  tone: 'ok' | 'warn';
}
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'warn') => void>(() => undefined);
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const push = useCallback((text: string, tone: 'ok' | 'warn' = 'ok') => {
    const id = ++counter.current;
    setItems((l) => [...l, { id, text, tone }]);
    window.setTimeout(() => setItems((l) => l.filter((t) => t.id !== id)), 3800);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      {createPortal(
        <div aria-live="polite" className="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
          {items.map((t) => (
            <div key={t.id} className="anim-slide-in pointer-events-auto flex items-start gap-3 border border-line bg-ink px-4 py-3 text-sm text-chalk shadow-[0_20px_40px_-20px_rgba(30,37,32,0.8)]">
              <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', t.tone === 'ok' ? 'bg-olive-mid' : 'bg-sun text-ink')}>
                <Check className="size-3.5" aria-hidden="true" />
              </span>
              <p>{t.text}</p>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

/* ------------------------------------------------------------------ order progress stepper */
export function Stepper({ steps, current, cancelled }: { steps: { key: string; label: string }[]; current: string; cancelled?: boolean }) {
  const idx = steps.findIndex((s) => s.key === current);
  return (
    <ol className="flex items-center gap-1" aria-label="Order progress">
      {steps.map((s, i) => {
        const done = !cancelled && i <= idx;
        return (
          <li key={s.key} className="flex flex-1 items-center gap-1 last:flex-none">
            <span className="flex flex-col items-center gap-1">
              <span className={cn('grid size-6 place-items-center rounded-full border text-[0.65rem] font-bold transition-colors duration-500', cancelled ? 'border-primary/40 text-primary' : done ? 'border-olive bg-olive text-chalk' : 'border-line text-muted', !cancelled && i === idx && 'ring-4 ring-olive/20')}>
                {done && i < idx ? <Check className="size-3" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn('hidden text-[0.65rem] font-semibold tracking-wide whitespace-nowrap uppercase sm:block', done ? 'text-ink' : 'text-muted')}>{s.label}</span>
            </span>
            {i < steps.length - 1 && <span className={cn('mb-4 h-0.5 flex-1 rounded transition-colors duration-500 sm:mb-5', !cancelled && i < idx ? 'bg-olive' : 'bg-line')} />}
          </li>
        );
      })}
    </ol>
  );
}

export function Meter({ value, max, tone = 'olive' }: { value: number; max: number; tone?: 'olive' | 'sun' | 'rust' }) {
  const pct = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const c = { olive: 'bg-olive', sun: 'bg-sun', rust: 'bg-primary' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/8" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn('anim-grow-x h-full rounded-full', c)} style={{ width: `${pct}%` }} />
    </div>
  );
}
