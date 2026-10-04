import { useState } from 'react';
import { CalendarCheck, X } from 'lucide-react';

import { isBackendConfigured } from '@/api/client';
import { SPORT_LABEL } from '@/api/public';
import { formatClockIst, formatDateIst } from '@/lib/format';
import { admin } from '../store/admin';
import { useDemo } from '../store/demoStore';
import { enquiries } from '../store/staticData';
import { btn, Pill, Section, useToast } from '../ui/kit';

/** Website "Book a trial" requests (the enquiries table). Approving one books the real TRIAL court booking; declining books nothing. */
export function TrialRequests() {
  useDemo();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const trials = enquiries.filter((e) => e.type === 'TRIAL' && e.sport && e.preferred).sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!isBackendConfigured || trials.length === 0) return null;
  const pending = trials.filter((e) => e.status === 'NEW');
  const history = trials.filter((e) => e.status !== 'NEW').slice(0, 5);

  const decide = async (e: (typeof trials)[number], approve: boolean) => {
    setBusy(e.id);
    const r = await (approve ? admin.approveTrial(e.id) : admin.declineTrial(e.id));
    setBusy(null);
    toast(r.ok ? (approve ? `${e.name}'s trial is approved and on the calendar` : `${e.name}'s trial request declined`) : r.message, r.ok ? 'ok' : 'warn');
  };
  const row = (e: (typeof trials)[number]) => (
    <li key={e.id} className="flex flex-wrap items-center gap-3 border-b border-line py-3 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{e.name} <span className="font-normal text-muted">· {e.phone}{e.email ? ` · ${e.email}` : ''}</span></span>
        <span className="text-xs text-muted">Free {SPORT_LABEL[e.sport!]} trial · {formatDateIst(e.preferred!)} at {formatClockIst(e.preferred!)} IST</span>
      </span>
      {e.status === 'NEW' ? (
        <span className="flex items-center gap-2">
          <Pill tone="sun">awaiting approval</Pill>
          <button type="button" className={btn.secondary} disabled={busy === e.id} aria-label={`Decline ${e.name}'s trial`} onClick={() => void decide(e, false)}><X className="size-3.5" /> Decline</button>
          <button type="button" className={btn.primary} disabled={busy === e.id} aria-label={`Approve ${e.name}'s trial`} onClick={() => void decide(e, true)}><CalendarCheck className="size-3.5" /> Approve & book</button>
        </span>
      ) : (
        <Pill tone={e.booking_id ? 'green' : 'muted'}>{e.booking_id ? 'approved' : 'declined'}</Pill>
      )}
    </li>
  );

  return (
    <Section eyebrow="Needs your approval" title={`Trial requests${pending.length ? ` (${pending.length} pending)` : ''}`} className="mb-6">
      <ul>{pending.map(row)}</ul>
      {pending.length === 0 && <p className="text-sm text-muted">No trial requests are waiting.</p>}
      {history.length > 0 && (
        <>
          <p className="eyebrow mt-4 mb-1 text-olive-mid">Recently decided</p>
          <ul>{history.map(row)}</ul>
        </>
      )}
    </Section>
  );
}
