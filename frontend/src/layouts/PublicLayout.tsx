import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

import { getClubInfo, type PublicClubInfo } from '@/api/public';
import { openLoginMenu, useAuth } from '@/auth/AuthProvider';
import { LoginMenu } from '@/auth/LoginMenu';
import { InteractiveHoverRouteLink } from '@/components/ui/interactive-hover-button';
import { PUBLIC_NAV, presetEnquiry } from '@/features/public/nav';
import { formatTimeOfDay } from '@/lib/format';
import { cn } from '@/lib/utils';

function Wordmark({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('group inline-flex min-h-11 items-center gap-2.5', className)} aria-label="Meridian Bay, home">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden="true">
        <circle cx="16" cy="19" r="9" fill="var(--color-sun)" />
        <rect x="2" y="19" width="28" height="2" fill="currentColor" />
        <rect x="2" y="24" width="28" height="1.2" fill="currentColor" opacity="0.5" />
      </svg>
      <span className="font-display text-[1.35rem] leading-none font-normal tracking-[-0.01em]">Meridian Bay</span>
    </Link>
  );
}

function Header() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  const overHero = pathname === '/';
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const solid = !overHero || scrolled || open;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,color,box-shadow] duration-500',
        solid ? 'bg-sand/95 text-ink shadow-[0_1px_0_var(--color-line)]' : 'on-dark text-chalk',
      )}
    >
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-chalk focus:px-4 focus:py-3 focus:text-ink">
        Skip to content
      </a>
      <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between gap-6 px-5 md:px-10">
        <Wordmark />

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {PUBLIC_NAV.map((n) => {
              const base = 'inline-flex min-h-11 items-center px-3 text-[0.9rem] font-medium opacity-85 transition-opacity hover:opacity-100';
              return (
                <li key={n.to}>
                  {n.to.includes('#') ? (
                    <Link to={n.to} className={base}>
                      {n.label}
                    </Link>
                  ) : (
                    <NavLink to={n.to} className={({ isActive }) => cn(base, isActive && 'underline decoration-primary decoration-2 underline-offset-[10px] opacity-100')}>
                      {n.label}
                    </NavLink>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <LoginMenu />
          {!session && (
            <Link to="/signup" className="hidden min-h-11 items-center px-1 text-[0.8rem] opacity-70 underline decoration-current/30 underline-offset-4 hover:opacity-100 sm:inline-flex">
              Sign up
            </Link>
          )}
          <InteractiveHoverRouteLink to="/#visit" onClick={() => presetEnquiry({ enquiry_type: 'TRIAL' })} className="hidden text-[0.9rem] md:inline-flex">
            Book a trial
          </InteractiveHoverRouteLink>
          <button
            type="button"
            className="inline-flex size-11 items-center justify-center lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </button>
        </div>
      </div>

      <div id="mobile-menu" hidden={!open} className="fixed inset-x-0 top-18 bottom-0 overflow-y-auto bg-sand px-5 pt-6 pb-10 text-ink lg:hidden">
        <nav aria-label="Mobile">
          <ul className="divide-y divide-line border-y border-line">
            {PUBLIC_NAV.map((n) => (
              <li key={n.to}>
                <Link to={n.to} onClick={() => setOpen(false)} className="display flex min-h-14 items-center text-3xl">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 flex flex-col gap-3">
          <InteractiveHoverRouteLink
            to="/#visit"
            onClick={() => {
              presetEnquiry({ enquiry_type: 'TRIAL' });
              setOpen(false);
            }}
            className="w-full"
          >
            Book a trial session
          </InteractiveHoverRouteLink>
          {!session && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openLoginMenu();
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-ink/25 font-semibold"
              >
                Log in
              </button>
              <Link to="/signup" onClick={() => setOpen(false)} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border border-ink/25 font-semibold">
                Sign up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer({ club }: { club: PublicClubInfo | null }) {
  const isPlaceholder = (k: string) => club?.placeholders.includes(k);
  return (
    <footer className="on-dark bg-ink text-chalk">
      <div className="mx-auto max-w-[1440px] px-5 pt-20 pb-10 md:px-10">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p className="display text-[clamp(3rem,7vw,5.5rem)] leading-[0.92]">Meridian Bay</p>
            {club?.club_tagline && <p className="mt-4 text-lg text-chalk/70">{club.club_tagline}</p>}
          </div>

          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7">
            <div>
              <h2 className="eyebrow text-sun">Explore</h2>
              <ul className="mt-4 space-y-1">
                {PUBLIC_NAV.map((n) => (
                  <li key={n.to}>
                    <Link to={n.to} className="inline-flex min-h-11 items-center text-chalk/80 hover:text-chalk">
                      {n.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="eyebrow text-sun">Visit</h2>
              {club && (
                <address className="mt-4 space-y-3 text-chalk/80 not-italic">
                  <p>{club.club_address}</p>
                  <p>
                    <a href={`tel:${club.club_phone.replace(/\s/g, '')}`} className="hover:text-chalk">
                      {club.club_phone}
                    </a>
                  </p>
                  <p>
                    <a href={`mailto:${club.club_email}`} className="break-all hover:text-chalk">
                      {club.club_email}
                    </a>
                  </p>
                  {(isPlaceholder('club_address') || isPlaceholder('club_phone') || isPlaceholder('club_email')) && (
                    <p className="text-xs text-chalk/50">Address, phone and email are placeholders until the club confirms them.</p>
                  )}
                </address>
              )}
            </div>
            <div>
              <h2 className="eyebrow text-sun">Hours</h2>
              {club && (
                <dl className="mt-4 space-y-3 text-chalk/80">
                  <div>
                    <dt className="text-xs text-chalk/50">Courts</dt>
                    <dd>
                      {formatTimeOfDay(club.club_open_time)} – {formatTimeOfDay(club.club_close_time)} IST
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-chalk/50">Friday social play</dt>
                    <dd>
                      {formatTimeOfDay(club.social_play_start_time)} – {formatTimeOfDay(club.social_play_end_time)} IST
                    </dd>
                  </div>
                </dl>
              )}
              <h2 className="eyebrow mt-8 text-sun">Members</h2>
              <ul className="mt-4 flex gap-5">
                <li>
                  <button type="button" onClick={openLoginMenu} className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                    Log in
                  </button>
                </li>
                <li>
                  <Link to="/signup" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">
                    Sign up
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-2 border-t border-chalk/15 pt-6 text-xs text-chalk/50 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Meridian Bay. All rights reserved.</p>
          <p>Imagery on this site is placeholder artwork until club photography is supplied.</p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  const [club, setClub] = useState<PublicClubInfo | null>(null);
  const { pathname, hash } = useLocation();

  useEffect(() => {
    getClubInfo().then(setClub);
  }, []);

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    // The target section may render a frame after navigation.
    const id = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 60);
    return () => window.clearTimeout(id);
  }, [pathname, hash]);

  return (
    <>
      <Header />
      <main id="main">
        <Outlet context={club} />
      </main>
      <Footer club={club} />
    </>
  );
}
