import { useEffect, useRef, useState } from 'react';

import type { MembershipPlan } from '@shared/types/rows';
import { listMenu, listPlans } from '@/api/public';
import { ActionLink } from '@/components/ui/button';
import { formatRupees } from '@/lib/format';
import { useReveal } from '@/lib/useReveal';
import { cn } from '@/lib/utils';
import { buildMenuSections, type MenuSection } from '../menu';

const wrap = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';

function MenuBlock({ section }: { section: MenuSection }) {
  const items = section.groups.flatMap((g) => g.items).length;
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-36 border-t border-line py-14 md:py-20">
      <div className="grid gap-8 lg:grid-cols-12">
        <header className="lg:col-span-4" data-reveal>
          <p className="eyebrow text-olive-mid">{section.kind === 'drinks' ? 'Coffee' : 'Kitchen'}</p>
          <h2 id={`${section.id}-title`} className="display mt-3 text-[clamp(2.2rem,4vw,3.4rem)] leading-[1]">
            {section.title}
          </h2>
          <p className="mt-3 max-w-xs text-muted">{section.tagline}</p>
        </header>

        <div className={cn('grid gap-x-12 gap-y-10 lg:col-span-8', section.groups.length > 1 || items > 4 ? 'md:grid-cols-2' : '')}>
          {section.groups.map((g, gi) => (
            <div key={g.label ?? gi} className={cn(section.groups.length === 1 && items > 4 && 'md:col-span-2')}>
              {g.label && <h3 className="eyebrow mb-2 text-terracotta">{g.label}</h3>}
              <ul className={cn(section.groups.length === 1 && items > 4 && 'md:columns-2 md:gap-12')}>
                {g.items.map((m) => (
                  <li key={m.id} className="break-inside-avoid border-b border-line py-4">
                    <div className="flex items-baseline gap-3">
                      <span className="mt-1 inline-flex size-3 shrink-0 items-center justify-center border border-olive-mid" aria-hidden="true">
                        <span className="size-1.5 rounded-full bg-olive-mid" />
                      </span>
                      <span className="font-semibold">
                        {m.name}
                        {m.isNew && <span className="ml-2 bg-sun/25 px-1.5 py-0.5 align-middle text-[0.62rem] font-bold tracking-[0.14em] text-ink uppercase">New</span>}
                      </span>
                      <span className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-ink/25" aria-hidden="true" />
                      <span className="tabular-nums">{formatRupees(m.price)}</span>
                    </div>
                    {m.detail && <p className="mt-1 pl-6 text-xs text-muted">{m.detail}</p>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function BarCafePage() {
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [menu, setMenu] = useState<MenuSection[] | null>(null);
  const [menuError, setMenuError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listPlans().then(setPlans);
  }, []);
  // The menu is the database's menu: fetched on arrival and again whenever the tab regains focus (no polling timer), so
  // an item the kitchen changed shows up without a restart.
  useEffect(() => {
    let on = true;
    const load = () =>
      listMenu()
        .then((items) => {
          if (!on) return;
          setMenu(buildMenuSections(items));
          setMenuError(false);
        })
        .catch(() => on && setMenuError(true));
    void load();
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      on = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  useReveal(root, [menu]);

  const discounts = plans.filter((p) => parseFloat(p.bar_discount_percent) > 0);

  return (
    <div ref={root} className="bg-chalk pt-18">
      <section aria-labelledby="bar-title" className="relative isolate overflow-hidden bg-sand">
        <img src="/media/bcb.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-[linear-gradient(105deg,rgba(246,241,232,0.94)_0%,rgba(246,241,232,0.78)_42%,rgba(30,37,32,0.35)_100%)]"
          aria-hidden="true"
        />
        <div className={cn(wrap, 'relative grid items-end gap-10 pt-16 pb-14 md:pt-24 lg:grid-cols-12 lg:gap-10')}>
          <div className="lg:col-span-6">
            <p className="eyebrow text-olive-mid">Bar &amp; café</p>
            <h1 id="bar-title" className="display mt-6 text-[clamp(3rem,7vw,6rem)] leading-[0.92] text-balance">
              Stay a little longer.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              Coffee before the first serve, a proper plate after the last. Staff take your order at the table — pay by cash, card or UPI.
            </p>
            {discounts.length > 0 && (
              <p className="mt-6 max-w-md text-sm text-ink">
                <span className="font-semibold">Members save automatically: </span>
                {discounts.map((p, i) => (
                  <span key={p.id}>
                    {p.name.replace(/ Membership$/, '')} {parseFloat(p.bar_discount_percent)}%{i < discounts.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            )}
          </div>
          <figure className="relative aspect-[4/3] overflow-hidden lg:col-span-6">
            <img src="/media/food_1.png" alt="Coffee at the bar &amp; café" className="h-full w-full object-cover" />
          </figure>
        </div>
      </section>

      <nav aria-label="Menu sections" className="sticky top-18 z-30 border-b border-line bg-chalk/95">
        <ul className={cn(wrap, 'flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]')}>
          {(menu ?? []).map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-ink/75 transition-colors hover:bg-sand hover:text-ink">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={wrap}>
        {menuError && !menu && (
          <p role="alert" className="border-t border-line py-14 text-muted">
            The menu can’t be loaded right now. Please try again in a moment.
          </p>
        )}
        {!menu && !menuError && (
          <p role="status" className="border-t border-line py-14 text-muted">
            Loading the menu…
          </p>
        )}
        {(menu ?? []).map((s) => (
          <MenuBlock key={s.id} section={s} />
        ))}

        <div className="flex flex-col gap-6 border-t border-line py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-2 text-sm text-muted">
            <p className="flex items-center gap-2">
              <span className="inline-flex size-3 shrink-0 items-center justify-center border border-olive-mid" aria-hidden="true">
                <span className="size-1.5 rounded-full bg-olive-mid" />
              </span>
              Made fresh to order at the bar &amp; café.
            </p>
            <p>Prices include GST. Ask the team about allergens.</p>
          </div>
          <ActionLink to="/membership" variant="secondary">
            Member discounts
          </ActionLink>
        </div>
      </div>
    </div>
  );
}
