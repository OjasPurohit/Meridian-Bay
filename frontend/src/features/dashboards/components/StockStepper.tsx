import { Minus, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { btn } from '../ui/kit';

/** One shared stock control: each click changes the quantity by exactly 1 (the store sends it to the API in live mode). Never goes below 0. */
export function StockStepper({ name, stock, onChange, className }: { name: string; stock: number; onChange: (delta: 1 | -1) => void; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full border border-ink/20 p-0.5', className)}>
      <button type="button" aria-label={`Remove 1 ${name}`} disabled={stock <= 0} className={cn(btn.quiet, '!size-8 !min-h-8 !p-0')} onClick={() => onChange(-1)}><Minus className="size-3.5" /></button>
      <span className="min-w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">{stock}</span>
      <button type="button" aria-label={`Add 1 ${name}`} className={cn(btn.quiet, '!size-8 !min-h-8 !p-0')} onClick={() => onChange(1)}><Plus className="size-3.5" /></button>
    </span>
  );
}
