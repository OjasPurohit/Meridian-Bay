import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Plus, Receipt, Trash2, Undo2 } from 'lucide-react';

import type { TaxOverview } from '@shared/types/api';
import { apiRequest, ApiError, isBackendConfigured } from '@/api/client';
import { formatDateIst, formatRupees } from '@/lib/format';
import { DEMO_TODAY } from '../store/types';
import { btn, Chips, DataTable, Empty, Field, field, Kpi, Pill, Section, useToast, type Column } from '../ui/kit';

const CATEGORY: Record<string, string> = { COURT: 'Courts', MEMBERSHIP: 'Memberships', SHOP: 'Shop', BAR: 'Café', BUSINESS: 'Business invoices' };
const STATUS = {
  NOT_READY: { label: 'Not ready · month still running', tone: 'muted' },
  READY_TO_REPORT: { label: 'Ready to report', tone: 'sun' },
  REPORTED: { label: 'Reported', tone: 'green' },
} as const;
const monthOf = (date: string) => date.slice(0, 7);
const prevMonth = (m: string) => { const d = new Date(`${m}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const monthLabel = (m: string) => new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T12:00:00Z`));
type Input = TaxOverview['inputs'][number];

/**
 * Owner > Reports > "Taxes to report": an INTERNAL month overview. Taxable revenue and tax collected come from the payments
 * ledger (the same figures as the tax report); input tax credit only from what the owner records here; the reported flag is
 * the owner's own tracking mark. Nothing is filed with any government system. Always read from the API (never the demo store).
 */
export function TaxesToReport() {
  const toast = useToast();
  const thisMonth = monthOf(DEMO_TODAY);
  const [period, setPeriod] = useState(prevMonth(thisMonth));
  const [data, setData] = useState<TaxOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ input_date: DEMO_TODAY, supplier: '', reference: '', taxable_amount: '', tax_amount: '', is_eligible: true, notes: '' });

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<TaxOverview>('GET', `/reports/tax-overview?period=${period}`));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the tax overview.');
    }
  }, [period]);
  useEffect(() => {
    if (isBackendConfigured) void load();
  }, [load]);

  if (!isBackendConfigured) {
    return <Section eyebrow="Finance" title="Taxes to report" className="mb-6"><p className="text-sm text-muted">Log in to the live app to see the tax overview: it is calculated from the club’s real payments.</p></Section>;
  }

  const act = async (job: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await job();
      toast(done);
      await load();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'That change could not be saved.', 'warn');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const rupees = (v: string) => formatRupees(Number(v));
  const addInput = async () => {
    const ok = await act(
      () => apiRequest('POST', '/reports/tax-inputs', {
        input_date: form.input_date, supplier: form.supplier.trim(),
        taxable_amount: Number(form.taxable_amount || 0).toFixed(2), tax_amount: Number(form.tax_amount || 0).toFixed(2), is_eligible: form.is_eligible,
        ...(form.reference.trim() ? { reference: form.reference.trim() } : {}), ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      }),
      'Input tax recorded',
    );
    if (ok) {
      setAdding(false);
      setForm({ ...form, supplier: '', reference: '', taxable_amount: '', tax_amount: '', notes: '' });
    }
  };

  const cat: Column<TaxOverview['by_category'][number]>[] = [
    { key: 'c', header: 'Source', cell: (r) => <span className="font-semibold">{CATEGORY[r.revenue_category] ?? r.revenue_category}</span> },
    { key: 't', header: 'Taxable', align: 'right', cell: (r) => rupees(r.taxable_amount) },
    { key: 'r', header: 'Rate', align: 'right', hide: 'sm', cell: (r) => `${Number(r.tax_rate).toFixed(1)}%` },
    { key: 'x', header: 'Tax collected', align: 'right', cell: (r) => rupees(r.tax_amount) },
  ];
  const inp: Column<Input>[] = [
    { key: 'd', header: 'Date', cell: (i) => <span className="text-muted">{formatDateIst(i.input_date).replace(/^\w+, /, '')}</span> },
    { key: 's', header: 'Supplier', cell: (i) => <div><p className="font-semibold">{i.supplier}</p><p className="text-xs text-muted">{[i.reference, i.notes].filter(Boolean).join(' · ')}</p></div> },
    { key: 'tx', header: 'Taxable', align: 'right', hide: 'sm', cell: (i) => rupees(i.taxable_amount) },
    { key: 'ta', header: 'Input tax', align: 'right', cell: (i) => rupees(i.tax_amount) },
    { key: 'e', header: 'Credit', hide: 'sm', cell: (i) => (i.is_eligible ? <Pill tone="green">eligible</Pill> : <Pill tone="muted">not eligible</Pill>) },
    { key: 'x', header: '', align: 'right', cell: (i) => <button type="button" className={btn.quiet} aria-label={`Remove input tax from ${i.supplier}`} disabled={busy} onClick={() => void act(() => apiRequest('DELETE', `/reports/tax-inputs/${i.id}`), 'Input tax removed')}><Trash2 className="size-3.5" /></button> },
  ];
  const st = data ? STATUS[data.status] : null;

  return (
    <Section eyebrow="Finance" title="Taxes to report" className="mb-6"
      action={<div className="flex flex-wrap items-center gap-2">
        <Chips value={period === thisMonth ? 'now' : period === prevMonth(thisMonth) ? 'last' : 'other'} onChange={(v) => v !== 'other' && setPeriod(v === 'now' ? thisMonth : prevMonth(thisMonth))}
          options={[{ value: 'now', label: 'This month' }, { value: 'last', label: 'Last month' }, { value: 'other', label: 'Other' }]} />
        <input type="month" aria-label="Reporting month" value={period} max={thisMonth} onChange={(e) => e.target.value && setPeriod(e.target.value)} className={`${field} !min-h-9 !w-40`} />
      </div>}>
      <p className="mb-4 text-xs text-muted">An internal summary for {monthLabel(period)}. Nothing is filed with the government from here: “Reported” is only your own tracking mark.</p>
      {error && <p role="alert" className="mb-4 border-l-2 border-primary bg-terracotta/10 px-3 py-2 text-sm text-primary">{error}</p>}
      {data && st && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi tone="olive" icon={Receipt} label="Taxable revenue" value={Number(data.taxable_revenue)} format={(n) => formatRupees(Math.round(n))} note="net of refunds, tax excluded" />
            <Kpi icon={Receipt} label="Tax collected" value={Number(data.tax_collected)} format={(n) => formatRupees(Math.round(n))} note="from payments" delay={60} />
            <Kpi icon={Receipt} label="Input tax credit" value={Number(data.input_tax_credit)} format={(n) => formatRupees(Math.round(n))} note="eligible purchases you recorded" delay={120} />
            <Kpi tone="sun" icon={Receipt} label="Estimated payable" value={Number(data.estimated_payable)} format={(n) => formatRupees(Math.round(n))} note={Number(data.credit_balance) > 0 ? `${rupees(data.credit_balance)} credit left over` : 'collected − credit'} delay={180} />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="eyebrow text-olive-mid">Reporting status</span>
            <Pill tone={st.tone}>{st.label}</Pill>
            {data.reported_at && <span className="text-xs text-muted">marked {formatDateIst(data.reported_at)}</span>}
            {data.status === 'READY_TO_REPORT' && <button type="button" disabled={busy} className={btn.primary} onClick={() => void act(() => apiRequest('POST', `/reports/tax-periods/${period}/report`, {}), `${monthLabel(period)} marked as reported`)}><CheckCircle2 className="size-4" /> Mark as reported</button>}
            {data.status === 'REPORTED' && <button type="button" disabled={busy} className={btn.secondary} onClick={() => void act(() => apiRequest('DELETE', `/reports/tax-periods/${period}`), 'Reported mark removed')}><Undo2 className="size-4" /> Reopen</button>}
            {data.status === 'NOT_READY' && <span className="text-xs text-muted">You can mark it after {formatDateIst(data.to)}.</span>}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div>
              <p className="eyebrow mb-2 text-olive-mid">By revenue source</p>
              <DataTable columns={cat} rows={data.by_category} rowKey={(r) => r.revenue_category} dense empty={<Empty icon={Receipt} title="No taxable sales" body="No payments were taken in this month." />} />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="eyebrow text-olive-mid">Input tax you paid on purchases</p>
                <button type="button" className={btn.secondary} onClick={() => setAdding((v) => !v)}><Plus className="size-4" /> Record input tax</button>
              </div>
              {adding && (
                <form className="mb-3 grid gap-3 border border-line bg-chalk p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void addInput(); }}>
                  <Field label="Invoice date"><input type="date" required value={form.input_date} onChange={(e) => setForm({ ...form, input_date: e.target.value })} className={field} /></Field>
                  <Field label="Supplier"><input required maxLength={200} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={field} /></Field>
                  <Field label="Taxable amount (₹)"><input type="number" required min="0" step="0.01" value={form.taxable_amount} onChange={(e) => setForm({ ...form, taxable_amount: e.target.value })} className={field} /></Field>
                  <Field label="Tax paid (₹)"><input type="number" required min="0" step="0.01" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} className={field} /></Field>
                  <Field label="Invoice number"><input maxLength={100} value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={field} /></Field>
                  <Field label="Notes"><input maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={field} /></Field>
                  <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.is_eligible} onChange={(e) => setForm({ ...form, is_eligible: e.target.checked })} /> Eligible for input tax credit</label>
                  <button type="submit" disabled={busy} className={`${btn.primary} sm:col-span-2`}>Save input tax</button>
                </form>
              )}
              <DataTable columns={inp} rows={data.inputs} rowKey={(i) => i.id} dense empty={<Empty icon={Receipt} title="No input tax recorded" body="Input tax credit is only what you record here from your suppliers’ invoices. Until then it is zero." />} />
            </div>
          </div>
        </>
      )}
    </Section>
  );
}
