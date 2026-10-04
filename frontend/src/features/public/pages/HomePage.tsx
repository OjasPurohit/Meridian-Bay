import { useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowDownRight } from 'lucide-react';

import type { Court, MembershipPlan } from '@shared/types/rows';
import type { SportType } from '@shared/constants/enums';
import { listCourts, listPlans, SPORT_LABEL, type PublicClubInfo } from '@/api/public';
import { ActionAnchor, ActionLink } from '@/components/ui/button';
import { HeroMedia } from '@/components/ui/HeroMedia';
import { PlaceholderArt, type ArtVariant } from '@/components/ui/PlaceholderArt';
import { HERO_MEDIA } from '@/config/media';
import { presetEnquiry } from '@/features/public/nav';
import { EnquirySection } from '@/features/public/components/EnquirySection';
import { planShortName } from '@/features/membership/plans';
import { formatRupees, formatTimeOfDay } from '@/lib/format';
import { useReveal } from '@/lib/useReveal';
import { cn } from '@/lib/utils';

const wrap = 'mx-auto w-full max-w-[1440px] px-5 md:px-10';

interface SportStory {
  sport: SportType;
  art: ArtVariant;
  src: string;
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
    src: '/media/clay.png',
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
    src: '/media/Padel_Court.jpg',
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
    src: '/media/practice_net.jpg',
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
    src: '/media/wooden_court.png',
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
      <HeroMedia
        videoSrc={HERO_MEDIA.videoSrc}
        posterSrc={HERO_MEDIA.posterSrc}
        className="absolute inset-0 -z-10"
        fallback={<PlaceholderArt variant="tennis-clay" caption="Clay court at golden hour" tilt={-16} zoom={1.7} slats animate showTag={false} className="absolute inset-0" />}
      />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(30,37,32,0.35)_0%,rgba(30,37,32,0)_24%,rgba(30,37,32,0.28)_50%,rgba(30,37,32,0.85)_100%)]" aria-hidden="true" />

      <div className={cn(wrap, 'pt-32 pb-10 md:pb-14')}>
        <p className="eyebrow text-chalk/85">Tennis · Padel · Cricket · Badminton</p>
        <h1 id="hero-title" className="display mt-5 max-w-[22ch] text-[clamp(3.1rem,9vw,8.25rem)] leading-[0.9] text-balance">
          The ultimate wellness destination
        </h1>
        <div className="mt-8 flex flex-col gap-8 md:mt-10 md:flex-row md:items-end md:justify-between">
          <p className="max-w-md text-lg leading-relaxed text-chalk/85">
            A neighbourhood sports club with six courts, a gear shop and a bar &amp; café in one place
            {club ? ` — open ${formatTimeOfDay(club.club_open_time)} to ${formatTimeOfDay(club.club_close_time)}.` : '.'}
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <ActionAnchor href="#visit" tone="dark" onClick={() => presetEnquiry({ enquiry_type: 'TRIAL' })} className="px-7 text-base">
              Book a trial session
            </ActionAnchor>
            <ActionLink to="/membership" variant="text" tone="dark">
              Explore membership
            </ActionLink>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-chalk/25 pt-5 text-sm text-chalk/75">
          <span className="inline-flex items-center gap-2">
            <ArrowDownRight className="size-4" aria-hidden="true" /> Scroll to see the club
          </span>
          {!HERO_MEDIA.videoSrc && !HERO_MEDIA.posterSrc && (
            <span className="text-[0.66rem] font-semibold tracking-[0.14em] uppercase opacity-80">Photo placeholder · clay court at golden hour</span>
          )}
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
          <PlaceholderArt variant="padel" src="/media/padalglass.jpg" caption="Padel glass, late light" tilt={58} zoom={2.6} className="col-span-7 aspect-[3/4] md:col-span-5" />
          <div className="col-span-5 flex flex-col justify-end md:col-span-7">
            <PlaceholderArt variant="tennis-hard" src="/media/hard.png" caption="Hard court, early morning" tilt={22} zoom={1.9} className="aspect-[4/5] md:aspect-[16/10]" />
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
                <PlaceholderArt variant={s.art} src={s.src} caption={s.caption} tilt={s.tilt} zoom={s.zoom} className={s.frame} />
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

function MembershipSection({ plans }: { plans: MembershipPlan[] }) {
  return (
    <section aria-labelledby="membership-title" className="bg-sand py-24 md:py-32">
      <div className={wrap}>
        <div id="membership-title">
          <SectionHeading
            eyebrow="Membership"
            title="Three ways to belong."
            intro="Each plan runs for a year. Benefits apply on their own — at the courts, in the shop and at the bar — so nobody has to ask."
          />
        </div>

        <ul className="mt-14 grid border-t border-line sm:grid-cols-2 lg:grid-cols-4 md:mt-20">
          {plans.map((p) => (
            <li key={p.id} className="border-b border-line py-6 sm:pr-6" data-reveal>
              <p className="display text-3xl">{planShortName(p)}</p>
              <p className="mt-1 text-sm text-muted">
                <span className="font-semibold text-ink tabular-nums">{formatRupees(p.price)}</span> / {p.duration_months} months
              </p>
            </li>
          ))}
          <li className="border-b border-line py-6" data-reveal>
            <p className="display text-3xl">Day Pass</p>
            <p className="mt-1 text-sm text-muted">For visitors · pay as you play</p>
          </li>
        </ul>
        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
          <ActionLink to="/membership">Compare membership</ActionLink>
          <p className="text-sm text-muted">Prices include GST.</p>
        </div>
      </div>
    </section>
  );
}

function ShopAndBar() {
  return (
    <section aria-label="Shop and bar & café" className="bg-chalk py-24 md:py-32">
      <div className={cn(wrap, 'grid gap-16 md:grid-cols-2 md:gap-10')}>
        <article aria-labelledby="shop-title" data-reveal>
          <PlaceholderArt variant="shop" src="/media/balls.png" caption="Fresh balls at the gear shop" className="aspect-[16/10]" />
          <p className="eyebrow mt-8 text-olive-mid">The gear shop</p>
          <h2 id="shop-title" className="display mt-3 text-[clamp(2rem,3.6vw,3.2rem)] leading-[1]">
            Everything for the next match.
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted">Rackets, balls and shuttles, shoes, accessories and apparel. Members save automatically.</p>
          <ActionLink to="/shop" className="mt-7">
            Visit the shop
          </ActionLink>
        </article>

        <article aria-labelledby="bar-title" className="md:mt-24" data-reveal>
          <PlaceholderArt variant="bar" src="/media/food_1.png" caption="Coffee at the bar & café" className="aspect-[16/10]" />
          <p className="eyebrow mt-8 text-olive-mid">Bar &amp; café</p>
          <h2 id="bar-title" className="display mt-3 text-[clamp(2rem,3.6vw,3.2rem)] leading-[1]">
            Stay a little longer.
          </h2>
          <p className="mt-4 max-w-md leading-relaxed text-muted">Hot and cold brews, all-day breakfast, sandwiches and mains — ordered at your table.</p>
          <ActionLink to="/bar-cafe" variant="secondary" className="mt-7">
            See the menu
          </ActionLink>
        </article>
      </div>
    </section>
  );
}

export default function HomePage() {
  const club = useOutletContext<PublicClubInfo | null>();
  const [courts, setCourts] = useState<Court[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [ready, setReady] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([listCourts(), listPlans()]).then(([c, p]) => {
      setCourts(c);
      setPlans(p);
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
      <MembershipSection plans={plans} />
      <ShopAndBar />
      <EnquirySection club={club} plans={plans} />
      <div className="sr-only" aria-live="polite">
        {ready ? '' : 'Loading club details'}
      </div>
    </div>
  );
}
