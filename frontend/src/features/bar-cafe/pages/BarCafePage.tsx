import { useEffect, useRef, useState } from 'react';

import type { MembershipPlan } from '@shared/types/rows';
import { listPlans } from '@/api/public';
import { ActionLink } from '@/components/ui/button';
import { PlaceholderArt } from '@/components/ui/PlaceholderArt';
import { formatRupees } from '@/lib/format';
import { useReveal } from '@/lib/useReveal';
import { cn } from '@/lib/utils';
import { MENU, type MenuSection } from '../menu';

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
                  <li key={m.name} className="break-inside-avoid border-b border-line py-4">
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
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listPlans().then(setPlans);
  }, []);
  useReveal(root, []);

  const discounts = plans.filter((p) => parseFloat(p.bar_discount_percent) > 0);

  return (
    <div ref={root} className="bg-chalk pt-18">
      <section aria-labelledby="bar-title" className="bg-sand">
        <div className={cn(wrap, 'grid items-end gap-10 pt-16 pb-14 md:pt-24 lg:grid-cols-12 lg:gap-10')}>
          <div className="lg:col-span-6">
            <p className="eyebrow text-olive-mid">Bar &amp; café</p>
            <h1 id="bar-title" className="display mt-6 text-[clamp(3rem,7vw,6rem)] leading-[0.92] text-balance">
              Stay a little longer.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              Coffee before the first serve, a proper plate after the last. Staff take your order at the table and can run a tab until you leave — settle by cash, card or UPI.
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
          <PlaceholderArt variant="bar" caption="Coffee at the bar & café" className="aspect-[4/3] lg:col-span-6" />
        </div>
      </section>

      <nav aria-label="Menu sections" className="sticky top-18 z-30 border-b border-line bg-chalk/95">
        <ul className={cn(wrap, 'flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]')}>
          {MENU.map((s) => (
            <li key={s.id} className="shrink-0">
              <a href={`#${s.id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap text-ink/75 transition-colors hover:bg-sand hover:text-ink">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={wrap}>
        {MENU.map((s) => (
          <MenuBlock key={s.id} section={s} />
        ))}

        <div className="flex flex-col gap-6 border-t border-line py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl space-y-2 text-sm text-muted">
            <p className="flex items-center gap-2">
              <span className="inline-flex size-3 shrink-0 items-center justify-center border border-olive-mid" aria-hidden="true">
                <span className="size-1.5 rounded-full bg-olive-mid" />
              </span>
              Vegetarian. Every item on this menu carries the vegetarian mark.
            </p>
            <p>Prices are as listed on the café menu and are exclusive of taxes. Ask the team about allergens.</p>
          </div>
          <ActionLink to="/membership" variant="secondary">
            Member discounts
          </ActionLink>
        </div>
      </div>
    </div>
  );
}
