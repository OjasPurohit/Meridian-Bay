import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ProductCategory } from '@shared/constants/enums';
import type { MembershipPlan } from '@shared/types/rows';
import { listPlans, listProducts, type CatalogueProduct, type StockStatus } from '@/api/public';
import { ActionAnchor, ActionLink } from '@/components/ui/button';
import { formatRupees } from '@/lib/format';
import { useReveal } from '@/lib/useReveal';
import { cn } from '@/lib/utils';
import { GearGlyph, glyphFor } from '../components/GearGlyph';
import { RacketStrike } from '../components/RacketStrike';

const wrap = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';

const CATEGORIES: { key: ProductCategory; label: string; id: string }[] = [
  { key: 'RACKET', label: 'Rackets', id: 'rackets' },
  { key: 'BALL', label: 'Balls & shuttles', id: 'balls' },
  { key: 'SHOES', label: 'Shoes', id: 'shoes' },
  { key: 'ACCESSORY', label: 'Accessories', id: 'accessories' },
  { key: 'APPAREL', label: 'Apparel', id: 'apparel' },
];

const STOCK: Record<StockStatus, { label: string; cls: string }> = {
  IN_STOCK: { label: 'In stock', cls: 'text-olive-mid' },
  LOW_STOCK: { label: 'Low stock', cls: 'text-sun' },
  OUT_OF_STOCK: { label: 'Out of stock', cls: 'text-muted' },
};

function useMotionMode() {
  const get = () => ({
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    desktop: window.matchMedia('(min-width: 768px)').matches,
  });
  const [mode, setMode] = useState(get);
  useEffect(() => {
    const queries = [window.matchMedia('(prefers-reduced-motion: reduce)'), window.matchMedia('(min-width: 768px)')];
    const on = () => setMode(get());
    queries.forEach((q) => q.addEventListener('change', on));
    return () => queries.forEach((q) => q.removeEventListener('change', on));
  }, []);
  return mode;
}

function ShopHero() {
  const section = useRef<HTMLElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const { reduced, desktop } = useMotionMode();

  const progressFor = useCallback(() => {
    const el = section.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
  }, []);
  const mode = reduced ? 'static' : desktop ? 'scroll' : 'inview';

  const onProgress = useCallback((t: number) => {
    if (caption.current) caption.current.style.opacity = String(Math.min(1, Math.max(0, (t - 0.55) / 0.15)));
  }, []);

  return (
    <section ref={section} aria-labelledby="shop-title" className={cn('relative bg-sand', !reduced && 'md:h-[230vh]')}>
      <div className={cn('relative overflow-hidden', !reduced && 'md:sticky md:top-18', 'md:h-[calc(100svh-4.5rem)]')}>
        <RacketStrike mode={mode} progressFor={progressFor} rich={desktop} onProgress={onProgress} className="pointer-events-none relative block aspect-[4/3] w-full md:absolute md:inset-0 md:aspect-auto md:h-full" />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 hidden w-[55%] bg-[linear-gradient(90deg,rgba(246,241,232,0.96)_0%,rgba(246,241,232,0.8)_55%,rgba(246,241,232,0)_100%)] [mask-image:linear-gradient(180deg,#000_70%,transparent_84%)] md:block"
          aria-hidden="true"
        />

        <div className={cn(wrap, 'relative z-10 pt-10 pb-12 md:absolute md:inset-x-0 md:top-0 md:flex md:h-full md:flex-col md:justify-center md:py-0')}>
          <div className="max-w-xl">
            <p className="eyebrow text-olive-mid">The gear shop</p>
            <h1 id="shop-title" className="display mt-5 text-[clamp(3rem,7.2vw,6.5rem)] leading-[0.9] text-balance">
              Gear for the next point.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              Rackets, balls and shuttles, shoes, accessories and club apparel — on one shelf for the counter and for members ordering online.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <ActionAnchor href="#catalogue" className="pointer-events-auto">
                Browse the gear
              </ActionAnchor>
              <ActionLink to="/membership" variant="text" className="pointer-events-auto">
                Member pricing
              </ActionLink>
            </div>
            <p ref={caption} className="mt-10 hidden text-sm text-muted md:block" style={{ opacity: reduced ? 1 : 0 }}>
              Scroll on for the full shelf.
            </p>
          </div>
        </div>
        <span className="absolute right-4 bottom-3 z-10 text-[0.62rem] font-semibold tracking-[0.14em] text-ink/50 uppercase md:right-10">Illustration</span>
      </div>
    </section>
  );
}

function ProductCard({ p }: { p: CatalogueProduct }) {
  const stock = STOCK[p.stock_status];
  return (
    <li className="group flex flex-col">
      <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-clay/60 transition-colors duration-300 group-hover:bg-clay">
        <GearGlyph kind={glyphFor(p.category, p.name)} className="h-3/4 w-3/4 transition-transform duration-500 ease-[var(--ease-soft)] group-hover:-translate-y-1 motion-reduce:transform-none" />
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <p className="eyebrow text-olive-mid">{p.brand}</p>
        <h3 className="mt-2 leading-snug font-semibold text-balance">{p.name}</h3>
        <div className="mt-auto flex items-baseline justify-between gap-3 pt-3">
          <span className="display text-2xl tabular-nums">{formatRupees(p.price)}</span>
          <span className={cn('text-xs font-semibold', stock.cls)}>{stock.label}</span>
        </div>
      </div>
    </li>
  );
}

export default function ShopPage() {
  const [products, setProducts] = useState<CatalogueProduct[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProducts().then(setProducts);
    listPlans().then(setPlans);
  }, []);
  useReveal(root, [products.length]);

  const grouped = useMemo(() => CATEGORIES.map((c) => ({ ...c, items: products.filter((p) => p.category === c.key) })).filter((c) => c.items.length), [products]);
  const discounts = plans.filter((p) => parseFloat(p.shop_discount_percent) > 0);

  return (
    <div ref={root} className="bg-chalk pt-18">
      <ShopHero />

      <section aria-label="How to buy" className="border-y border-line bg-chalk">
        <div className={cn(wrap, 'grid gap-8 py-12 md:grid-cols-3 md:gap-10 md:py-16')}>
          {[
            { t: 'At the counter', d: 'Buy in person at the club. Counter and online orders come from the same shelf, so stock is always current.' },
            { t: 'Online for members', d: 'Members order from home and collect at the club or have it delivered.' },
            {
              t: 'Member pricing',
              d: discounts.length
                ? `Your plan discount comes off automatically — ${discounts.map((p) => `${p.name.replace(/ Membership$/, '')} ${parseFloat(p.shop_discount_percent)}%`).join(', ')}.`
                : 'Your plan discount comes off automatically.',
            },
          ].map((x) => (
            <div key={x.t} data-reveal>
              <h2 className="display text-2xl">{x.t}</h2>
              <p className="mt-2 leading-relaxed text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      <div id="catalogue" className="scroll-mt-18">
        <nav aria-label="Shop categories" className="sticky top-18 z-30 border-b border-line bg-chalk/95">
          <ul className={cn(wrap, 'flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]')}>
            {grouped.map((c) => (
              <li key={c.key} className="shrink-0">
                <a href={`#${c.id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-ink/75 transition-colors hover:bg-sand hover:text-ink">
                  {c.label}
                  <span className="ml-1.5 text-xs text-muted tabular-nums">{c.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={wrap}>
          {grouped.map((c) => (
            <section key={c.key} id={c.id} aria-labelledby={`${c.id}-title`} className="scroll-mt-36 py-14 md:py-20">
              <div className="flex items-end justify-between gap-6 border-b border-line pb-5" data-reveal>
                <h2 id={`${c.id}-title`} className="display text-[clamp(2.2rem,4vw,3.4rem)] leading-none">
                  {c.label}
                </h2>
                <p className="text-sm text-muted">
                  {c.items.length} {c.items.length === 1 ? 'item' : 'items'}
                </p>
              </div>
              <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-12 min-[480px]:grid-cols-2 lg:grid-cols-4">
                {c.items.map((p) => (
                  <ProductCard key={p.id} p={p} />
                ))}
              </ul>
            </section>
          ))}
          <p className="pb-16 text-xs text-muted">Product illustrations are placeholders until product photography is supplied. Prices include GST.</p>
        </div>
      </div>

      <section aria-labelledby="shop-cta" className="on-dark bg-olive py-20 text-chalk md:py-28">
        <div className={cn(wrap, 'grid gap-8 md:grid-cols-12 md:items-end')}>
          <div className="md:col-span-7">
            <h2 id="shop-cta" className="display text-[clamp(2.2rem,4.6vw,4rem)] leading-[1]">
              Order from home, pick up on court day.
            </h2>
            <p className="mt-4 max-w-md text-chalk/75">Online ordering, pickup and delivery come with a member account.</p>
          </div>
          <div className="flex flex-wrap gap-3 md:col-span-5 md:justify-end">
            <ActionLink to="/membership" tone="dark">
              Explore membership
            </ActionLink>
            <ActionLink to="/#visit" variant="secondary" tone="dark">
              Ask the front desk
            </ActionLink>
          </div>
        </div>
      </section>
    </div>
  );
}
