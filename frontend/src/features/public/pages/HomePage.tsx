import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowDownRight } from 'lucide-react';

import type { BarMenuItem, Court, MembershipPlan } from '@shared/types/rows';
import type { SportType } from '@shared/constants/enums';
import {
  listCourts,
  listMenu,
  listPlans,
  listShopBrands,
  listUpcomingSocialSessions,
  SPORT_LABEL,
  type PublicClubInfo,
  type UpcomingSocialSession,
} from '@/api/public';
import { InteractiveHoverLink } from '@/components/ui/interactive-hover-button';
import { PlaceholderArt, type ArtVariant } from '@/components/ui/PlaceholderArt';
import { presetEnquiry } from '@/features/public/nav';
import { EnquirySection } from '@/features/public/components/EnquirySection';
import { formatClockIst, formatDayIst, formatRupees, formatTimeOfDay } from '@/lib/format';
import { useReveal } from '@/lib/useReveal';
import { cn } from '@/lib/utils';

const wrap = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';

interface SportStory {
  sport: SportType;
  art: ArtVariant;
  caption: string;
  line: string;
  tilt: number;
  zoom: number;
  frame: string;
  cell: string;
}

const SPORT_STORIES: SportStory[] = [
  {
    sport: 'TENNIS',
    art: 'tennis-clay',
    caption: 'Clay court, late afternoon',
    line: 'One clay court and one acrylic hard court, both floodlit for evening play.',
    tilt: -12,
    zoom: 1.35,
    frame: 'aspect-[4/5] md:aspect-[5/6]',
    cell: 'md:col-span-7',
  },
  {
    sport: 'PADEL',
    art: 'padel',
    caption: 'Glass-walled padel court',
    line: 'A glass-walled court on artificial turf — quick rallies, doubles by default.',
    tilt: 8,
    zoom: 1.5,
    frame: 'aspect-[4/3]',
    cell: 'md:col-span-5 md:mt-40',
  },
  {
    sport: 'CRICKET',
    art: 'cricket',
    caption: 'Practice net on turf',
    line: 'A turf practice net with a bowling machine for focused batting sessions.',
    tilt: -72,
    zoom: 1.6,
    frame: 'aspect-[4/3]',
    cell: 'md:col-span-5 md:mt-24',
  },
  {
    sport: 'BADMINTON',
    art: 'badminton',
    caption: 'Indoor wooden court',
    line: 'Two indoor courts on wood, out of the weather.',
    tilt: 4,
    zoom: 1.25,
    frame: 'aspect-[16/11]',
    cell: 'md:col-span-7',
  },
];

function SectionHeading({ eyebrow, title, intro, dark }: { eyebrow: string; title: string; intro?: string; dark?: boolean }) {
  return (
    <div className="grid gap-6 md:grid-cols-12" data-reveal>
      <p className={cn('eyebrow md:col-span-3 md:pt-4', dark ? 'text-sun' : 'text-olive-mid')}>{eyebrow}</p>
      <div className="md:col-span-9">
        <h2 className="display text-[clamp(2.4rem,5.4vw,4.75rem)] leading-[0.98] text-balance">{title}</h2>
        {intro && <p className={cn('mt-6 max-w-xl text-lg leading-relaxed text-pretty', dark ? 'text-chalk/75' : 'text-muted')}>{intro}</p>}
      </div>
    </div>
  );
}

function Hero({ club }: { club: PublicClubInfo | null }) {
  return (
    <section aria-labelledby="hero-title" className="on-dark relative isolate flex min-h-[100svh] flex-col justify-end overflow-hidden text-chalk">
      <PlaceholderArt variant="tennis-clay" caption="Clay court at golden hour" tilt={-16} zoom={1.7} slats animate showTag={false} className="absolute inset-0 -z-10" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(30,37,32,0.35)_0%,rgba(30,37,32,0)_24%,rgba(30,37,32,0.28)_50%,rgba(30,37,32,0.85)_100%)]" aria-hidden="true" />

      <div className={cn(wrap, 'pt-32 pb-10 md:pb-14')}>
        <p className="eyebrow text-chalk/85">Tennis · Padel · Cricket · Badminton</p>
        <h1 id="hero-title" className="display mt-5 max-w-[14ch] text-[clamp(3.1rem,9vw,8.25rem)] leading-[0.9] text-balance">
          Long light, good courts, and a table for after.
        </h1>
        <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:items-end md:justify-between">
          <p className="max-w-md text-lg leading-relaxed text-chalk/85">
            A neighbourhood sports club with six courts, a gear shop and a bar &amp; café in one place
            {club ? ` — open ${formatTimeOfDay(club.club_open_time)} to ${formatTimeOfDay(club.club_close_time)}.` : '.'}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <InteractiveHoverLink href="#visit" onClick={() => presetEnquiry({ enquiry_type: 'TRIAL' })} className="border-transparent px-7 text-base">
              Book a trial session
            </InteractiveHoverLink>
            <a href="#membership" className="inline-flex min-h-11 items-center gap-2 font-semibold underline decoration-chalk/40 underline-offset-[6px] hover:decoration-chalk">
              Explore membership
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-chalk/25 pt-5 text-sm text-chalk/75">
          <span className="inline-flex items-center gap-2">
            <ArrowDownRight className="size-4" aria-hidden="true" /> Scroll to see the club
          </span>
          <span className="text-[0.66rem] font-semibold tracking-[0.14em] uppercase opacity-80">Photo placeholder · clay court at golden hour</span>
        </div>
      </div>
    </section>
  );
}

function ClubStory({ courts, club }: { courts: Court[]; club: PublicClubInfo | null }) {
  const sports = new Set(courts.map((c) => c.sport_type)).size;
  const facts = [
    { k: String(courts.length || '—'), v: 'courts and nets' },
    { k: String(sports || '—'), v: 'sports, one address' },
    { k: '60 min', v: 'sessions, starting every half hour' },
    { k: club ? `${formatTimeOfDay(club.club_open_time)}–${formatTimeOfDay(club.club_close_time)}` : '—', v: 'court hours, IST' },
  ];
  return (
    <section id="club" aria-labelledby="club-title" className="bg-sand py-24 md:py-36">
      <div className={wrap}>
        <div className="grid gap-8 md:grid-cols-12">
          <p className="eyebrow text-olive-mid md:col-span-3 md:pt-3" data-reveal>
            The club
          </p>
          <h2 id="club-title" className="display text-[clamp(2rem,4.2vw,3.6rem)] leading-[1.08] text-pretty md:col-span-9" data-reveal>
            Meridian Bay is built around the whole of a game — the warm-up, the match, the kit you forgot, and the long conversation at the bar afterwards.
          </h2>
        </div>

        <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 border-t border-line pt-10 md:mt-24 md:grid-cols-4 md:pl-[25%]">
          {facts.map((f) => (
            <div key={f.v} data-reveal>
              <dt className="sr-only">{f.v}</dt>
              <dd>
                <span className="display block text-[clamp(1.75rem,3vw,2.9rem)] leading-none whitespace-nowrap text-olive">{f.k}</span>
                <span className="mt-3 block text-sm text-muted">{f.v}</span>
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-20 grid grid-cols-12 gap-4 md:mt-32 md:gap-6">
          <PlaceholderArt variant="padel" caption="Padel glass, late light" tilt={58} zoom={2.6} className="col-span-7 aspect-[3/4] md:col-span-5" />
          <div className="col-span-5 flex flex-col justify-end md:col-span-7">
            <PlaceholderArt variant="tennis-hard" caption="Hard court, early morning" tilt={22} zoom={1.9} className="aspect-[4/5] md:aspect-[16/10]" />
            <p className="mt-6 hidden max-w-sm text-muted md:block" data-reveal>
              Members are recognised at the desk, plan benefits apply on their own, and a game at six can easily become dinner at the bar.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function CourtsSection({ courts }: { courts: Court[] }) {
  const bySport = useMemo(() => {
    const m = new Map<SportType, Court[]>();
    for (const c of courts) m.set(c.sport_type, [...(m.get(c.sport_type) ?? []), c]);
    return m;
  }, [courts]);

  return (
    <section id="courts" aria-labelledby="courts-title" className="bg-chalk py-24 md:py-36">
      <div className={wrap}>
        <div id="courts-title">
          <SectionHeading
            eyebrow="The courts"
            title="Four sports, one club."
            intro="Every court books in one-hour sessions, with a new slot every thirty minutes. Walk-ins pay the court rate; members pay less — or nothing — depending on their plan."
          />
        </div>

        <div className="mt-16 grid gap-x-6 gap-y-16 md:mt-24 md:grid-cols-12 md:gap-y-28">
          {SPORT_STORIES.map((s) => {
            const list = bySport.get(s.sport) ?? [];
            if (!list.length) return null;
            const from = Math.min(...list.map((c) => parseFloat(c.walk_in_rate_per_hour)));
            return (
              <article key={s.sport} className={cn(s.cell)} data-reveal aria-labelledby={`sport-${s.sport}`}>
                <PlaceholderArt variant={s.art} caption={s.caption} tilt={s.tilt} zoom={s.zoom} className={s.frame} />
                <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-baseline">
                  <h3 id={`sport-${s.sport}`} className="display text-4xl md:text-5xl">
                    {SPORT_LABEL[s.sport]}
                  </h3>
                  <p className="text-sm text-muted sm:text-right">
                    Walk-in from <span className="font-semibold text-ink">{formatRupees(from)}</span> / hour
                  </p>
                </div>
                <p className="mt-3 max-w-md leading-relaxed text-muted">{s.line}</p>
                <ul className="mt-5 divide-y divide-line border-y border-line text-sm">
                  {list.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-muted">
                        {c.surface}
                        {c.description ? ` · ${c.description}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SocialSection({ sessions, club }: { sessions: UpcomingSocialSession[]; club: PublicClubInfo | null }) {
  const hours = club ? `${formatTimeOfDay(club.social_play_start_time)} to ${formatTimeOfDay(club.social_play_end_time)}` : 'the evening';
  return (
    <section id="social" aria-labelledby="social-title" className="on-dark relative overflow-hidden bg-olive py-24 text-chalk md:py-36">
      <div className={cn(wrap, 'grid gap-14 lg:grid-cols-12 lg:gap-10')}>
        <div className="lg:col-span-5" data-reveal>
          <p className="eyebrow text-sun">Friday social play</p>
          <h2 id="social-title" className="display mt-6 text-[clamp(2.6rem,5.6vw,5rem)] leading-[0.96] text-balance">
            On Fridays, the courts open up.
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-chalk/75">
            From {hours}, courts are held for open play. Many players share a court, partners rotate, and all levels are welcome.
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-chalk/60">
            Members join from their account; guests join at the front desk. Your plan decides the fee — Gold members play free.
          </p>
        </div>

        <div className="lg:col-span-7">
          <PlaceholderArt variant="social" caption="Floodlit court, Friday night" tilt={-4} zoom={0.95} className="aspect-[16/10]" />
          <div className="mt-8" data-reveal>
            <h3 className="eyebrow text-chalk/60">Next sessions</h3>
            {sessions.length === 0 ? (
              <p className="mt-4 border-t border-chalk/15 pt-4 text-chalk/70">No sessions are open yet — the desk publishes them each week.</p>
            ) : (
              <ul className="mt-4 divide-y divide-chalk/15 border-y border-chalk/15">
                {sessions.map((s) => (
                  <li key={s.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 py-5">
                    <div className="whitespace-nowrap">
                      <p className="text-sm font-semibold">{formatDayIst(s.start_at)}</p>
                      <p className="text-sm text-chalk/60 tabular-nums">
                        {formatClockIst(s.start_at)}–{formatClockIst(s.end_at)}
                      </p>
                    </div>
                    <div>
                      <p className="display text-xl md:text-2xl">{s.title}</p>
                      <p className="text-sm text-chalk/60">
                        {s.court_name} · {formatRupees(s.fee_per_person)} per guest
                      </p>
                    </div>
                    <p className="text-right text-sm whitespace-nowrap">
                      {s.spots_left > 0 ? (
                        <>
                          <span className="display block text-2xl text-sun tabular-nums">{s.spots_left}</span>
                          <span className="text-chalk/60">of {s.capacity} left</span>
                        </>
                      ) : (
                        <>
                          <span className="display block text-2xl text-chalk/50">Full</span>
                          <span className="text-chalk/60">{s.capacity} players</span>
                        </>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ageLine(p: MembershipPlan) {
  if (p.max_age != null) return `Ages ${p.min_age ?? 0}–${p.max_age}`;
  if (p.min_age != null) return `Ages ${p.min_age}+`;
  return 'All ages';
}

function MembershipSection({ plans }: { plans: MembershipPlan[] }) {
  return (
    <section id="membership" aria-labelledby="membership-title" className="bg-sand py-24 md:py-36">
      <div className={wrap}>
        <div id="membership-title">
          <SectionHeading
            eyebrow="Membership"
            title="Three ways to belong."
            intro="Each plan runs for a year. Benefits apply on their own — at the courts, in the shop and at the bar — so nobody has to ask."
          />
        </div>

        <div className="mt-16 grid gap-6 md:mt-24 lg:grid-cols-3">
          {plans.map((p, i) => {
            const featured = i === 0;
            return (
              <article
                key={p.id}
                data-reveal
                aria-labelledby={`plan-${p.id}`}
                className={cn('flex flex-col p-8 md:p-10', featured ? 'on-dark bg-olive text-chalk' : 'border border-line bg-chalk')}
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 id={`plan-${p.id}`} className="display text-4xl md:text-5xl">
                    {p.name.replace(/ Membership$/, '')}
                  </h3>
                  <span className={cn('text-xs font-semibold tracking-[0.14em] uppercase', featured ? 'text-sun' : 'text-olive-mid')}>{ageLine(p)}</span>
                </div>
                <p className={cn('mt-4 leading-relaxed', featured ? 'text-chalk/75' : 'text-muted')}>{p.description}</p>
                <p className="mt-8">
                  <span className="display text-5xl tabular-nums">{formatRupees(p.price)}</span>
                  <span className={cn('ml-2 text-sm', featured ? 'text-chalk/60' : 'text-muted')}>/ {p.duration_months} months</span>
                </p>
                <ul className={cn('mt-8 flex-1 space-y-3 border-t pt-6 text-[0.95rem]', featured ? 'border-chalk/20' : 'border-line')}>
                  {p.benefits.map((b) => (
                    <li key={b} className="flex gap-3">
                      <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', featured ? 'bg-sun' : 'bg-terracotta')} aria-hidden="true" />
                      {b}
                    </li>
                  ))}
                </ul>
                <InteractiveHoverLink
                  href="#visit"
                  onClick={() => presetEnquiry({ enquiry_type: 'MEMBERSHIP', membership_plan_id: p.id })}
                  className={cn('mt-10 self-start', featured && 'border-transparent')}
                >
                  Ask about {p.name.replace(/ Membership$/, '')}
                </InteractiveHoverLink>
              </article>
            );
          })}
        </div>
        <p className="mt-8 text-sm text-muted">Prices include GST. Junior is for players under 18.</p>
      </div>
    </section>
  );
}

const CATEGORY_LINE = 'Rackets, balls, shoes, accessories and apparel';

function ShopAndBar({ brands, menu }: { brands: string[]; menu: BarMenuItem[] }) {
  const picks = (['DRINK', 'FOOD', 'SNACK'] as const).flatMap((cat) => menu.filter((m) => m.category === cat).slice(0, 2));
  return (
    <section aria-label="Shop and bar" className="bg-chalk py-24 md:py-36">
      <div className={cn(wrap, 'grid gap-24 lg:grid-cols-12 lg:gap-10')}>
        <article id="shop" aria-labelledby="shop-title" className="lg:col-span-6" data-reveal>
          <PlaceholderArt variant="shop" caption="Fresh balls at the gear shop" className="aspect-[5/4]" />
          <p className="eyebrow mt-10 text-olive-mid">The gear shop</p>
          <h2 id="shop-title" className="display mt-4 text-[clamp(2.2rem,4.4vw,3.75rem)] leading-[1]">
            Everything for the next match.
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted">
            {CATEGORY_LINE}
            {brands.length ? ` from ${brands.slice(0, -1).join(', ')} and ${brands.at(-1)}` : ''}. Buy at the counter, or order online as a member and collect at the club or have it delivered — your plan discount comes off automatically.
          </p>
        </article>

        <article id="bar" aria-labelledby="bar-title" className="lg:col-span-6 lg:mt-48" data-reveal>
          <PlaceholderArt variant="bar" caption="Filter coffee at the bar & café" className="aspect-[4/3]" />
          <p className="eyebrow mt-10 text-olive-mid">Bar &amp; café</p>
          <h2 id="bar-title" className="display mt-4 text-[clamp(2.2rem,4.4vw,3.75rem)] leading-[1]">
            Stay a little longer.
          </h2>
          <p className="mt-5 max-w-md leading-relaxed text-muted">
            Staff take your order at the table and can run a tab until you leave — settle by cash, card or UPI. Members&rsquo; discounts apply without asking.
          </p>
          <ul className="mt-8 max-w-md">
            {picks.map((m) => (
              <li key={m.id} className="flex items-baseline gap-3 border-b border-line py-3">
                <span className="font-semibold">{m.name}</span>
                <span className="flex-1 translate-y-[-3px] border-b border-dotted border-ink/25" aria-hidden="true" />
                <span className="tabular-nums text-muted">{formatRupees(m.price)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">A selection from the menu. List prices, GST included.</p>
        </article>
      </div>
    </section>
  );
}

export default function HomePage() {
  const club = useOutletContext<PublicClubInfo | null>();
  const [courts, setCourts] = useState<Court[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [sessions, setSessions] = useState<UpcomingSocialSession[]>([]);
  const [menu, setMenu] = useState<BarMenuItem[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([listCourts(), listPlans(), listUpcomingSocialSessions(), listMenu(), listShopBrands()]).then(([c, p, s, m, b]) => {
      setCourts(c);
      setPlans(p);
      setSessions(s);
      setMenu(m);
      setBrands(b);
      setReady(true);
    });
  }, []);

  useReveal(root, [ready]);

  useEffect(() => {
    if (ready && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView();
  }, [ready]);

  return (
    <div ref={root}>
      <Hero club={club} />
      <ClubStory courts={courts} club={club} />
      <CourtsSection courts={courts} />
      <SocialSection sessions={sessions} club={club} />
      <MembershipSection plans={plans} />
      <ShopAndBar brands={brands} menu={menu} />
      <EnquirySection club={club} plans={plans} />
      <div className="sr-only" aria-live="polite">
        {ready ? '' : 'Loading club details'}
      </div>
    </div>
  );
}
