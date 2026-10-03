import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { btn, field, Field, Modal } from './kit';

export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'toggle' | 'date' | 'datetime';
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  placeholder?: string;
  /** span both columns */
  wide?: boolean;
}

export type Values = Record<string, string | number | boolean>;

/** One create/edit form for every simple CRUD in the dashboards (products, menu items, dealers, events…). */
export function FormModal({ open, onClose, title, eyebrow, fields, initial, onSubmit, submitLabel = 'Save' }: { open: boolean; onClose: () => void; title: string; eyebrow?: string; fields: FieldDef[]; initial: Values; onSubmit: (v: Values) => void; submitLabel?: string }) {
  const [v, setV] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setV(initial);
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const val = v[f.key];
      if (f.required && (val === '' || val === undefined)) errs[f.key] = 'Required';
      if (f.type === 'number' && val !== '' && (Number.isNaN(Number(val)) || Number(val) < 0)) errs[f.key] = 'Enter a number ≥ 0';
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const out: Values = {};
    for (const f of fields) out[f.key] = f.type === 'number' ? Number(v[f.key] || 0) : (v[f.key] ?? '');
    onSubmit(out);
  };

  return (
    <Modal open={open} onClose={onClose} eyebrow={eyebrow} title={title} width="max-w-2xl">
      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const err = errors[f.key];
          const common = { id: `f-${f.key}`, 'aria-invalid': !!err, className: cn(field, err && 'border-primary') };
          return (
            <div key={f.key} className={cn(f.wide || f.type === 'textarea' ? 'sm:col-span-2' : '')}>
              {f.type === 'toggle' ? (
                <label className="flex min-h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={!!v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.checked })} className="size-5 accent-[var(--color-olive)]" />
                  <span className="text-sm font-semibold">{f.label}</span>
                </label>
              ) : (
                <Field label={f.label + (f.required ? ' *' : '')} hint={err ?? f.hint}>
                  {f.type === 'textarea' ? (
                    <textarea {...common} rows={3} value={String(v[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={cn(common.className, 'py-2.5')} />
                  ) : f.type === 'select' ? (
                    <select {...common} value={String(v[f.key] ?? '')} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>
                      {f.options!.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input {...common} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'datetime' ? 'datetime-local' : 'text'} min={f.type === 'number' ? 0 : undefined} step={f.type === 'number' ? 'any' : undefined} value={String(v[f.key] ?? '')} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
                  )}
                </Field>
              )}
            </div>
          );
        })}
        <div className="flex justify-end gap-2 border-t border-line pt-4 sm:col-span-2">
          <button type="button" className={btn.secondary} onClick={onClose}>Cancel</button>
          <button type="submit" className={btn.primary}>{submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfirmDelete({ open, onClose, onConfirm, what }: { open: boolean; onClose: () => void; onConfirm: () => void; what: string }) {
  return (
    <Modal open={open} onClose={onClose} eyebrow="Please confirm" title={`Delete ${what}?`} width="max-w-md"
      footer={<div className="flex justify-end gap-2"><button type="button" className={btn.secondary} onClick={onClose}>Keep it</button><button type="button" className={btn.accent} onClick={onConfirm}><Trash2 className="size-4" /> Delete</button></div>}>
      <p className="text-muted">This removes it from the catalogue. Past orders and receipts are not affected.</p>
    </Modal>
  );
}
