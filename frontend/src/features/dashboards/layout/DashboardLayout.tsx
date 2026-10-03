import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Bell, ChefHat, ChevronsLeft, ChevronsRight, ExternalLink, LogOut, Menu, RotateCcw, ShoppingBag, CalendarDays, X } from 'lucide-react';

import type { UserRole } from '@shared/constants/enums';
import { useAuth } from '@/auth/AuthProvider';
import { roleInfo } from '@/auth/roles';
import { DEMO_ACCOUNTS, demoAccount } from '@/features/demo/accounts';
import { DEMO_ICON } from '@/features/demo/DemoAccess';
import { formatClockIst, formatDayIst } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Gate } from '../components/DashboardShell';
import { isLive, onLiveError, refreshLive } from '../store/live';
import { courtById, resetDemoData, useDemo } from '../store/demoStore';
import { DEMO_NOW } from '../store/types';
import { Avatar, Drawer, PageSkeleton, Pill, ToastProvider, useToast } from '../ui/kit';
import { NAV, roleFromPath } from './nav';

function Wordmark({ collapsed }: { collapsed: boolean }) {
  return (
    <Link to="/" className="group inline-flex min-h-11 items-center gap-2.5" aria-label="Meridian Bay, home">
      <svg viewBox="0 0 32 32" className="size-7 shrink-0 transition-transform duration-500 group-hover:rotate-[20deg]" aria-hidden="true">
        <circle cx="16" cy="19" r="9" fill="var(--color-sun)" />
        <rect x="2" y="19" width="28" height="2" fill="currentColor" />
        <rect x="2" y="24" width="28" height="1.2" fill="currentColor" opacity="0.5" />
      </svg>
      <span className={cn('font-display text-[1.3rem] leading-none whitespace-nowrap transition-[opacity,width] duration-300', collapsed ? 'lg:w-0 lg:opacity-0' : 'w-auto')}>Meridian Bay</span>
    </Link>
  );
}

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function ActivityDrawer({ open, onClose, role }: { open: boolean; onClose: () => void; role: UserRole }) {
  const s = useDemo();
  const items = useMemo(() => {
    const rows = [
      ...s.bookings.filter((b) => b.kind === 'REGULAR').map((b) => ({ at: b.created_at, icon: CalendarDays, title: `${b.name} booked ${courtById(b.court_id)?.name ?? 'a court'}`, sub: `${formatDayIst(b.start_at)} · ${formatClockIst(b.start_at)}` })),
      ...s.shopOrders.map((o) => ({ at: o.created_at, icon: ShoppingBag, title: `Store order ${o.number} · ${o.customer}`, sub: `${o.lines.length} item${o.lines.length > 1 ? 's' : ''} · ${o.status.replace(/_/g, ' ').toLowerCase()}` })),
      ...s.kOrders.map((o) => ({ at: o.created_at, icon: ChefHat, title: `Kitchen order ${o.number} · ${o.customer}`, sub: `${o.lines.length} item${o.lines.length > 1 ? 's' : ''} · ${o.status.toLowerCase()}` })),
    ];
    const wanted = role === 'KITCHEN_MANAGER' ? rows.filter((r) => r.icon === ChefHat) : rows;
    return wanted.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }, [s, role]);
  return (
    <Drawer open={open} onClose={onClose} eyebrow="Live" title="Recent activity">
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-1">
          {items.map((i, n) => (
            <li key={`${i.at}-${n}`} style={{ ['--d' as string]: `${n * 40}ms` }} className="anim-rise flex gap-3 border-b border-line py-3 last:border-0">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-olive/10 text-olive">
                <i.icon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{i.title}</span>
                <span className="block text-xs text-muted">
                  {i.sub} · {i.at > DEMO_NOW ? 'just now' : `${formatDayIst(i.at)} ${formatClockIst(i.at)}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function Shell({ role }: { role: UserRole }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { demoLogin, logout, session } = useAuth();
  const toast = useToast();
  const s = useDemo();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [menu, setMenu] = useState(false);
  const [activity, setActivity] = useState(false);
  const menuRef = useOutside(menu, () => setMenu(false));
  const acc = demoAccount(role);
  const live = isLive();
  const who = live && session ? session.user.full_name : acc.user.full_name;
  const items = NAV[role];
  const current = items.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to)));

  useEffect(() => onLiveError((m) => toast(m)), [toast]);

  useEffect(() => {
    setMobile(false);
    setMenu(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobile ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobile]);

  const fresh = useMemo(() => [...s.shopOrders, ...s.kOrders, ...s.bookings].filter((x) => x.created_at > DEMO_NOW).length, [s]);

  const switchTo = (r: UserRole) => {
    const next = demoLogin(r);
    navigate(next.redirect_to);
  };

  return (
    <div className="min-h-svh bg-sand text-ink">
      {mobile && <button type="button" aria-label="Close menu" onClick={() => setMobile(false)} className="anim-fade fixed inset-0 z-40 bg-ink/50 backdrop-blur-[2px] lg:hidden" />}

      <aside
        aria-label="Dashboard navigation"
        className={cn(
          'on-dark fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-olive text-chalk transition-[transform,width] duration-300 ease-[var(--ease-soft)]',
          mobile ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-[4.75rem]' : 'lg:w-72',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
          <Wordmark collapsed={collapsed} />
          <button type="button" aria-label="Close menu" onClick={() => setMobile(false)} className="grid size-10 place-items-center rounded-full hover:bg-chalk/10 lg:hidden">
            <X className="size-5" />
          </button>
        </div>

        <div className={cn('px-5 pb-3 transition-opacity duration-300', collapsed && 'lg:opacity-0')}>
          <p className="eyebrow text-sun">{roleInfo(role).label}</p>
          <p className="mt-1 text-xs text-chalk/65">{acc.tagline}</p>
        </div>

        <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-1">
            {items.map((n, i) => (
              <li key={n.to} style={{ ['--d' as string]: `${i * 45}ms` }} className="anim-rise">
                <NavLink
                  to={n.to}
                  end={n.end}
                  title={collapsed ? n.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex min-h-11 items-center gap-3 px-3 text-[0.92rem] font-medium transition-[background-color,color,transform] duration-200',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive ? 'bg-chalk/14 text-chalk' : 'text-chalk/72 hover:translate-x-0.5 hover:bg-chalk/8 hover:text-chalk',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span aria-hidden="true" className={cn('absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-sun transition-transform duration-300', isActive ? 'scale-y-100' : 'scale-y-0')} />
                      <n.icon className={cn('size-[1.15rem] shrink-0 transition-colors duration-200', isActive ? 'text-sun' : 'group-hover:text-sun')} aria-hidden="true" />
                      <span className={cn('whitespace-nowrap transition-opacity duration-200', collapsed && 'lg:hidden')}>{n.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="shrink-0 border-t border-chalk/12 p-3">
          <Link to="/" title="Back to website" className={cn('flex min-h-11 items-center gap-3 px-3 text-sm text-chalk/70 transition-colors hover:bg-chalk/8 hover:text-chalk', collapsed && 'lg:justify-center lg:px-0')}>
            <ExternalLink className="size-[1.1rem] shrink-0" aria-hidden="true" />
            <span className={cn(collapsed && 'lg:hidden')}>Back to website</span>
          </Link>
          <button type="button" onClick={() => setCollapsed((v) => !v)} className="mt-1 hidden min-h-11 w-full items-center gap-3 px-3 text-sm text-chalk/70 transition-colors hover:bg-chalk/8 hover:text-chalk lg:flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <ChevronsRight className="mx-auto size-[1.1rem]" /> : <ChevronsLeft className="size-[1.1rem]" />}
            <span className={cn(collapsed && 'hidden')}>Collapse</span>
          </button>
        </div>
      </aside>

      <div className={cn('flex min-h-svh min-w-0 flex-col transition-[padding] duration-300 ease-[var(--ease-soft)]', collapsed ? 'lg:pl-[4.75rem]' : 'lg:pl-72')}>
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-sand/85 px-4 backdrop-blur-md md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" aria-label="Open menu" onClick={() => setMobile(true)} className="grid size-11 place-items-center rounded-full transition-colors hover:bg-ink/8 lg:hidden">
              <Menu className="size-5" />
            </button>
            <p className="truncate text-sm text-muted">
              <span className="hidden sm:inline">{roleInfo(role).label} · </span>
              <span className="font-semibold text-ink">{current?.label ?? 'Dashboard'}</span>
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Pill tone="sun" className="hidden sm:inline-flex">
              <span className="live-dot size-1.5 rounded-full bg-primary text-primary" /> {live ? 'Live data' : 'Demo data'}
            </Pill>
            <button type="button" onClick={() => setActivity(true)} aria-label={`Recent activity${fresh ? `, ${fresh} new` : ''}`} className="relative grid size-11 place-items-center rounded-full transition-colors hover:bg-ink/8">
              <Bell className="size-5" />
              {fresh > 0 && <span className="anim-pop absolute top-2.5 right-2.5 grid size-4 place-items-center rounded-full bg-primary text-[0.6rem] font-bold text-chalk">{Math.min(fresh, 9)}</span>}
            </button>

            <div ref={menuRef} className="relative">
              <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-haspopup="menu" className="flex min-h-11 items-center gap-2.5 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-ink/8">
                <Avatar name={who} size="sm" />
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-[0.82rem] font-semibold">{who}</span>
                  <span className="block text-[0.68rem] text-muted">{roleInfo(role).label}</span>
                </span>
              </button>
              {menu && (
                <div role="menu" className="anim-pop absolute top-full right-0 z-50 mt-2 w-72 origin-top-right border border-line bg-sand p-2 shadow-[0_28px_60px_-28px_rgba(30,37,32,0.55)]">
                  {!live && <p className="eyebrow flex items-center gap-1.5 px-3 pt-2 pb-1 text-olive-mid">
                    <ArrowLeftRight className="size-3.5" aria-hidden="true" /> Switch demo role
                  </p>}
                  {!live && DEMO_ACCOUNTS.map((a) => {
                    const Icon = DEMO_ICON[a.role];
                    return (
                      <button key={a.role} role="menuitem" type="button" onClick={() => switchTo(a.role)} className={cn('flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm transition-colors hover:bg-olive/8', a.role === role && 'bg-olive/10 font-semibold')}>
                        <Icon className="size-4 text-olive" aria-hidden="true" />
                        {a.label.replace('Demo ', '')}
                        {a.role === role && <Pill tone="green" className="ml-auto">Current</Pill>}
                      </button>
                    );
                  })}
                  {!live && <><div className="my-2 border-t border-line" />
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      resetDemoData();
                      setMenu(false);
                      toast('Demo data reset to the original seed.');
                    }}
                    className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm transition-colors hover:bg-olive/8"
                  >
                    <RotateCcw className="size-4 text-olive" aria-hidden="true" /> Reset demo data
                  </button></>}
                  {live && <button role="menuitem" type="button" onClick={() => { void refreshLive(); setMenu(false); toast('Refreshed from the database.'); }} className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm transition-colors hover:bg-olive/8"><RotateCcw className="size-4 text-olive" aria-hidden="true" /> Refresh from database</button>}
                  <button
                    role="menuitem"
                    type="button"
                    onClick={async () => {
                      await logout();
                      navigate('/');
                    }}
                    className="flex min-h-10 w-full items-center gap-3 px-3 text-left text-sm transition-colors hover:bg-olive/8"
                  >
                    <LogOut className="size-4 text-olive" aria-hidden="true" /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main id="main" key={pathname} className="anim-rise mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 md:px-8 md:py-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      <ActivityDrawer open={activity} onClose={() => setActivity(false)} role={role} />
    </div>
  );
}

/** Sidebar layout shared by every role dashboard. The role comes from the URL prefix (ROLE_HOME_ROUTE). */
export default function DashboardLayout() {
  const { pathname } = useLocation();
  const role = roleFromPath(pathname);
  if (!role) return <Outlet />;
  return (
    <ToastProvider>
      <Gate role={role}>
        <Shell role={role} />
      </Gate>
    </ToastProvider>
  );
}
