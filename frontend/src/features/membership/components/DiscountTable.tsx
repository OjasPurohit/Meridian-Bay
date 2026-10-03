import type { MembershipPlan } from '@shared/types/rows';
import { cn } from '@/lib/utils';
import { planShortName } from '../plans';

/** "100.00" -> "Free"; "15.00" -> "15% off". Discounts come straight from the plan rows. */
export function discountLabel(percent: string, freeWhenFull = false) {
  const n = parseFloat(percent);
  if (n <= 0) return 'List price';
  if (n >= 100 && freeWhenFull) return 'Free';
  return `${n}% off`;
}

interface Props {
  plans: MembershipPlan[];
  /** Adds the walk-in / Day Pass row (list prices, no plan discount). */
  includeWalkIn?: boolean;
  highlight?: string;
  className?: string;
}

export function DiscountTable({ plans, includeWalkIn = true, highlight, className }: Props) {
  return (
    <div className={cn('relative overflow-x-auto', className)}>
      <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
        <caption className="sr-only">Plan discounts at the courts, gear shop and bar & café</caption>
        <thead>
          <tr className="border-b border-ink/20 text-xs tracking-[0.12em] text-muted uppercase">
            <th scope="col" className="py-3 pr-4 font-semibold">Option</th>
            <th scope="col" className="py-3 pr-4 font-semibold">Courts</th>
            <th scope="col" className="py-3 pr-4 font-semibold">Gear shop</th>
            <th scope="col" className="py-3 pr-4 font-semibold">Bar &amp; café</th>
            <th scope="col" className="py-3 font-semibold">Plays a day</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id} className={cn('border-b border-line', highlight === p.id && 'bg-chalk')}>
              <th scope="row" className="py-3 pr-4 font-display text-lg font-normal">
                {planShortName(p)}
              </th>
              <td className="py-3 pr-4">{discountLabel(p.court_discount_percent, true)}</td>
              <td className="py-3 pr-4">{discountLabel(p.shop_discount_percent)}</td>
              <td className="py-3 pr-4">{discountLabel(p.bar_discount_percent)}</td>
              <td className="py-3 tabular-nums">Up to {p.max_plays_per_day}</td>
            </tr>
          ))}
          {includeWalkIn && (
            <tr className="border-b border-line text-muted">
              <th scope="row" className="py-3 pr-4 font-display text-lg font-normal text-ink">
                Day Pass / walk-in
              </th>
              <td className="py-3 pr-4">Walk-in rate</td>
              <td className="py-3 pr-4">List price</td>
              <td className="py-3 pr-4">List price</td>
              <td className="py-3">—</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
