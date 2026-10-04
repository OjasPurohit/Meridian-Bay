import { CalendarCheck, CalendarX } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { isBackendConfigured } from '@/api/client';
import { formatDateIst } from '@/lib/format';
import { useDemo } from '../store/demoStore';
import { leaveRequests } from '../store/staticData';

const day = (d: string) => formatDateIst(d).replace(/^\w+, /, '').replace(/ \d{4}$/, '');
const RECENT_MS = 14 * 86_400_000;

/**
 * Shown to employees (front desk, kitchen, store manager) whenever the owner has decided one of their leave requests in the
 * last two weeks. It is derived from the leave_requests row (status + decided_at), so it survives a refresh or a new login:
 * there is no separate notification record to lose.
 */
export function LeaveNotice() {
  useDemo(); // re-render when the live store refetches the request list
  const { pathname } = useLocation();
  if (!isBackendConfigured || pathname.endsWith('/leave')) return null;
  const recent = leaveRequests
    .filter((l) => (l.status === 'APPROVED' || l.status === 'REJECTED') && l.decided_at && Date.now() - Date.parse(l.decided_at) < RECENT_MS)
    .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))
    .slice(0, 3);
  if (!recent.length) return null;
  const to = `/${pathname.split('/')[1]}/leave`;
  const span = (l: (typeof recent)[number]) => (l.to === l.from ? day(l.from) : `${day(l.from)} to ${day(l.to)}`);

  return (
    <ul className="mb-6 space-y-2" aria-label="Leave decisions">
      {recent.map((l) => {
        const approved = l.status === 'APPROVED';
        const Icon = approved ? CalendarCheck : CalendarX;
        return (
          <li key={l.id} className={`flex items-start gap-3 border-l-2 px-4 py-3 text-sm ${approved ? 'border-olive bg-olive/8' : 'border-primary bg-terracotta/10'}`}>
            <Icon className={`mt-0.5 size-4 shrink-0 ${approved ? 'text-olive' : 'text-primary'}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{approved ? 'Leave approved' : 'Leave request rejected'}</span>
              <span className="text-muted">
                {approved ? `Your leave request from ${span(l)} has been approved.` : `Your leave request from ${span(l)} was rejected.${l.note ? ` Reason: ${l.note}` : ''}`}
              </span>
            </span>
            <Link to={to} className="shrink-0 text-xs font-semibold underline underline-offset-2">Details</Link>
          </li>
        );
      })}
    </ul>
  );
}
