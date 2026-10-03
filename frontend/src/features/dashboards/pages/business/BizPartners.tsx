import { useState } from 'react';
import { Building2, History, Mail, MapPin, Pencil, Phone, Plus } from 'lucide-react';

import { formatDateIst, formatMoney, formatRupees } from '@/lib/format';
import { cn } from '@/lib/utils';
import { demo, useDemo } from '../../store/demoStore';
import type { Dealer } from '../../store/types';
import { FormModal, type FieldDef } from '../../ui/forms';
import { Avatar, btn, Drawer, Empty, Kpi, PageHeader, PageSkeleton, Pill, usePageReady, useToast } from '../../ui/kit';
import { BizTxTable } from './BizOverview';

const FIELDS: FieldDef[] = [
  { key: 'name', label: 'Company', type: 'text', required: true, wide: true },
  { key: 'contact', label: 'Contact person', type: 'text', required: true },
  { key: 'city', label: 'City', type: 'text' },
  { key: 'phone', label: 'Phone', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' },
  { key: 'offers', label: 'Products / services (comma separated)', type: 'text', wide: true, placeholder: 'Racquets, Bags, Grips' },
  { key: 'active', label: 'Active partner', type: 'toggle' },
];

export default function BizPartners() {
  const ready = usePageReady();
  const s = useDemo();
  const toast = useToast();
  const [edit, setEdit] = useState<Dealer | 'new' | null>(null);
  const [view, setView] = useState<Dealer | null>(null);
  if (!ready) return <PageSkeleton rows={1} />;
  const initial = edit && edit !== 'new' ? { name: edit.name, contact: edit.contact, city: edit.city, phone: edit.phone, email: edit.email, offers: edit.offers.join(', '), active: edit.status === 'ACTIVE' } : { name: '', contact: '', city: '', phone: '', email: '', offers: '', active: true };
  const history = view ? s.bizTx.filter((t) => t.party === view.name) : [];

  return (
    <>
      <PageHeader eyebrow="Network" title="Dealers & partners">
        <button type="button" className={btn.primary} onClick={() => setEdit('new')}><Plus className="size-4" /> Add partner</button>
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Kpi tone="olive" icon={Building2} label="Partners" value={s.dealers.length} note={`${s.dealers.filter((d) => d.status === 'ACTIVE').length} active`} />
        <Kpi label="Traded to date" value={s.dealers.reduce((a, d) => a + d.traded, 0)} format={(n) => formatRupees(Math.round(n))} delay={70} />
        <Kpi label="Cities covered" value={new Set(s.dealers.map((d) => d.city)).size} delay={140} />
      </div>

      {s.dealers.length === 0 ? <Empty icon={Building2} title="No partners yet" action={<button type="button" className={btn.primary} onClick={() => setEdit('new')}>Add a partner</button>} /> : (
        <ul className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {s.dealers.map((d, i) => (
            <li key={d.id} style={{ ['--d' as string]: `${i * 60}ms` }} className="anim-rise card-lift flex flex-col border border-line bg-chalk p-5">
              <div className="flex items-start gap-3">
                <Avatar name={d.name} tone={i % 3 === 0 ? 'olive' : i % 3 === 1 ? 'sun' : 'rust'} />
                <div className="min-w-0 flex-1"><p className="display text-xl leading-tight">{d.name}</p><p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-3.5" aria-hidden="true" /> {d.city} · since {formatDateIst(d.since).replace(/^\w+, \d+ /, '')}</p></div>
                <Pill tone={d.status === 'ACTIVE' ? 'green' : 'muted'}>{d.status.toLowerCase()}</Pill>
              </div>
              <ul className="mt-4 flex flex-wrap gap-1.5">{d.offers.map((o) => <li key={o}><Pill tone="muted">{o}</Pill></li>)}</ul>
              <div className="mt-4 space-y-1.5 text-sm">
                <p className="font-semibold">{d.contact}</p>
                <a href={`tel:${d.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-muted hover:text-ink"><Phone className="size-3.5" /> {d.phone}</a>
                <a href={`mailto:${d.email}`} className="flex items-center gap-2 break-all text-muted hover:text-ink"><Mail className="size-3.5 shrink-0" /> {d.email}</a>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
                <div><p className="eyebrow text-olive-mid">Traded</p><p className="display text-xl tabular-nums">{formatRupees(d.traded)}</p></div>
                <div className="flex gap-1">
                  <button type="button" className={btn.quiet} onClick={() => setView(d)}><History className="size-3.5" /> History</button>
                  <button type="button" className={btn.quiet} onClick={() => setEdit(d)}><Pencil className="size-3.5" /> Edit</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <FormModal open={!!edit} onClose={() => setEdit(null)} eyebrow="Partner" title={edit === 'new' ? 'Add a dealer / partner' : 'Edit partner'} fields={FIELDS} initial={initial}
        onSubmit={(v) => {
          demo.saveDealer({ id: edit && edit !== 'new' ? edit.id : undefined, name: String(v.name), contact: String(v.contact), city: String(v.city), phone: String(v.phone), email: String(v.email), offers: String(v.offers).split(',').map((x) => x.trim()).filter(Boolean), status: v.active ? 'ACTIVE' : 'PAUSED' });
          toast(edit === 'new' ? `${v.name} added to your network` : `${v.name} updated`);
          setEdit(null);
        }} />
      <Drawer open={!!view} onClose={() => setView(null)} eyebrow="Transaction history" title={view?.name ?? ''} width="max-w-2xl">
        {view && (history.length ? <><p className={cn('mb-3 text-sm text-muted')}>{history.length} transactions · {formatMoney(history.reduce((a, t) => a + t.amount, 0))} total</p><BizTxTable rows={history} /></> : <Empty icon={History} title="No transactions recorded" body="Orders placed with this partner will appear here." />)}
      </Drawer>
    </>
  );
}
