/**
 * Court bookings and availability (R-COURT-01..10). No stored status: a booking stands until cancelled_at is set and the
 * view court_booking_totals derives CONFIRMED / CANCELLED / COMPLETED and the payment state. A double booking is
 * impossible by the exclusion constraint court_bookings_no_overlap (mapped to BOOKING_CONFLICT by the kernel).
 */
import { PAYMENT_METHOD, USER_ROLE, type PaymentMethod, type SportType } from '@shared/constants/enums';
import type { BookingCancelResult, BookingDetail, CourtAvailability, PriceBreakdown } from '@shared/types/api';
import type { Court } from '@shared/types/rows';
import type { BookingsCreateRequest } from '@shared/types/requests.generated';
import { fromPaise, percentOf, taxInclusive, toPaise } from '@shared/lib/money';
import { addDays, istDate, istToUtc, slotStarts } from '@shared/lib/time';
import type { AuthUser } from '../../kernel/auth';
import { advisoryLock, query, withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { SettingsService } from '../../kernel/settings';
import { offsetOf } from '../../kernel/validate';
import * as members from '../members/repo';
import { recordPayment, refundInTx } from '../payments/service';

const pool: Tx = { query };
const isStaff = (u: AuthUser) => u.role !== USER_ROLE.MEMBER && u.role !== USER_ROLE.BUSINESS_CLIENT;
const NOBODY = '00000000-0000-0000-0000-000000000000';

const DETAIL_SELECT = `
  SELECT b.id, b.booking_number, b.court_id, b.booking_type, b.member_id, b.guest_name, b.guest_phone, b.start_at, b.end_at, b.list_price, b.discount_amount,
         b.cancelled_at, b.created_at, b.updated_at,
         t.status, t.amount_due, t.amount_paid, t.payment_status,
         c.name AS court_name, c.sport_type, mu.full_name AS member_name, m.member_code
    FROM court_bookings b
    JOIN court_booking_totals t ON t.court_booking_id = b.id
    JOIN courts c ON c.id = b.court_id
    LEFT JOIN members m ON m.id = b.member_id
    LEFT JOIN users mu ON mu.id = m.user_id`;

export async function bookingDetail(db: Tx, id: string): Promise<BookingDetail | null> {
  const { rows } = await db.query<BookingDetail>(`${DETAIL_SELECT} WHERE b.id = $1`, [id]);
  return rows[0] ?? null;
}

async function courtById(db: Tx, id: string): Promise<Court | null> {
  return (await db.query<Court>('SELECT * FROM courts WHERE id = $1', [id])).rows[0] ?? null;
}

async function playsUsed(db: Tx, member_id: string, date: string): Promise<number> {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM court_bookings WHERE member_id = $1 AND booking_type = 'REGULAR' AND cancelled_at IS NULL AND (start_at AT TIME ZONE 'Asia/Kolkata')::date = $2`,
    [member_id, date],
  );
  return rows[0]!.n;
}

/** R-COURT-05: list price, member discount of the effective plan, tax contained in the price. */
async function price(db: Tx, court: Court, start_at: string, member_id: string | null): Promise<PriceBreakdown> {
  const plan = member_id ? await members.effectivePlan(db, member_id) : null;
  const list = toPaise(court.walk_in_rate_per_hour);
  const pct = plan ? Number(plan.court_discount_percent) : 0;
  const discount = percentOf(list, pct);
  const due = list - discount;
  const rate = Number(await SettingsService.get<string | number>('tax_rate_court'));
  const date = istDate(start_at);
  return {
    court_id: court.id,
    start_at: new Date(start_at).toISOString(),
    end_at: new Date(Date.parse(start_at) + 3_600_000).toISOString(),
    membership_type: plan?.membership_type ?? null,
    list_price: fromPaise(list),
    discount_percent: pct.toFixed(2),
    discount_amount: fromPaise(discount),
    amount_due: fromPaise(due),
    tax_rate: rate.toFixed(2),
    tax_amount: fromPaise(taxInclusive(due, rate)),
    is_free: due === 0,
    plays_used_today: member_id ? await playsUsed(db, member_id, date) : null,
    plays_allowed_per_day: member_id ? (plan?.max_plays_per_day ?? 2) : null,
  };
}

/** R-COURT-01/02: on the half hour, in the future, inside opening hours, within 60 days. */
async function checkSlot(start_at: string): Promise<void> {
  const start = Date.parse(start_at);
  const bad = (reason: string) => new AppError('INVALID_SLOT', { reason });
  if (!Number.isFinite(start) || start % 1_800_000 !== 0) throw bad('Start must be on a 30-minute boundary.');
  if (start <= Date.now()) throw bad('Start must be in the future.');
  const date = istDate(start_at);
  if (date > addDays(istDate(new Date()), 60)) throw bad('Bookings open up to 60 days ahead.');
  const open = String(await SettingsService.get<string>('club_open_time')).slice(0, 5);
  const close = String(await SettingsService.get<string>('club_close_time')).slice(0, 5);
  const starts = slotStarts(date, open, close).map((s) => Date.parse(s));
  if (!starts.includes(start)) throw new AppError('COURT_UNAVAILABLE', { reason: 'Outside opening hours.' });
}

export const BookingsService = {
  async price(user: AuthUser, q: { court_id: string; start_at: string; member_id?: string }): Promise<PriceBreakdown> {
    const court = await courtById(pool, q.court_id);
    if (!court) throw new AppError('COURT_NOT_FOUND');
    const member_id = user.role === USER_ROLE.MEMBER ? (user.member_id ?? null) : (q.member_id ?? null);
    return price(pool, court, q.start_at, member_id);
  },

  async create(user: AuthUser, body: BookingsCreateRequest): Promise<BookingDetail> {
    const staff = isStaff(user);
    const member_id = user.role === USER_ROLE.MEMBER ? (user.member_id ?? null) : (body.member_id ?? null);
    if (user.role === USER_ROLE.MEMBER && (body.guest_name || body.member_id)) throw new AppError('FORBIDDEN');
    if (!member_id && !body.guest_name) throw new AppError('VALIDATION_ERROR', { fields: { guest_name: 'Required when no member is given.' } });
    const method = body.payment_method;
    if (method) {
      const ok = user.role === USER_ROLE.MEMBER ? method === PAYMENT_METHOD.ONLINE : user.role === USER_ROLE.OWNER_ADMIN || method !== PAYMENT_METHOD.ONLINE;
      if (!ok) throw new AppError('FORBIDDEN', { reason: `Role ${user.role} may not take ${method} payments.` });
    }
    await checkSlot(body.start_at);
    const id = await withTransaction(async (tx) => {
      const court = await courtById(tx, body.court_id);
      if (!court) throw new AppError('COURT_NOT_FOUND');
      if (!court.is_active) throw new AppError('COURT_UNAVAILABLE');
      if (member_id) {
        if (!(await members.summaryById(tx, member_id))) throw new AppError('MEMBER_NOT_FOUND');
        await advisoryLock(tx, `plays:${member_id}`); // R-COURT-04: check and insert are one unit
      }
      const p = await price(tx, court, body.start_at, member_id);
      if (member_id && (p.plays_used_today ?? 0) >= (p.plays_allowed_per_day ?? 2)) throw new AppError('DAILY_BOOKING_LIMIT');
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO court_bookings (court_id, booking_type, member_id, guest_name, guest_phone, start_at, end_at, list_price, discount_amount)
         VALUES ($1, 'REGULAR', $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [court.id, member_id, member_id ? null : body.guest_name, member_id ? null : (body.guest_phone ?? null), p.start_at, p.end_at, p.list_price, p.discount_amount],
      );
      const id = rows[0]!.id;
      if (method && toPaise(p.amount_due) > 0) await recordPayment(tx, { source_type: 'COURT_BOOKING', source_id: id, method: method as PaymentMethod, received_by_user_id: staff ? user.id : null });
      return id;
    });
    return (await bookingDetail(pool, id))!;
  },

  async list(user: AuthUser, q: { from?: string; to?: string; court_id?: string; member_id?: string; status?: string; booking_type?: string; upcoming?: boolean; page: number; page_size: number }) {
    const c: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      c.push(sql.replace('?', `$${params.length}`));
    };
    if (q.from) add(`(b.start_at AT TIME ZONE 'Asia/Kolkata')::date >= ?`, q.from);
    if (q.to) add(`(b.start_at AT TIME ZONE 'Asia/Kolkata')::date <= ?`, q.to);
    if (q.court_id) add('b.court_id = ?', q.court_id);
    if (q.status) add('t.status = ?', q.status);
    if (q.booking_type) add('b.booking_type = ?', q.booking_type);
    if (q.upcoming) c.push('b.start_at >= now()');
    if (user.role === USER_ROLE.MEMBER) add('b.member_id = ?', user.member_id ?? NOBODY);
    else if (q.member_id) add('b.member_id = ?', q.member_id);
    const where = c.length ? `WHERE ${c.join(' AND ')}` : '';
    const total = (await query<{ n: number }>(`SELECT count(*)::int AS n FROM court_bookings b JOIN court_booking_totals t ON t.court_booking_id = b.id ${where}`, params)).rows[0]!.n;
    const { rows } = await query<BookingDetail>(`${DETAIL_SELECT} ${where} ORDER BY b.start_at DESC, b.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, q.page_size, offsetOf(q)]);
    return { rows, total };
  },

  async get(user: AuthUser, id: string): Promise<BookingDetail> {
    const b = await bookingDetail(pool, id);
    if (!b || (user.role === USER_ROLE.MEMBER && b.member_id !== user.member_id)) throw new AppError('BOOKING_NOT_FOUND');
    return b;
  },

  /** R-COURT-07: only standing, future bookings; refund per cut-off, staff may override. */
  async cancel(user: AuthUser, id: string, refundOverride?: boolean): Promise<BookingCancelResult> {
    const cutoff = Number(await SettingsService.get<number>('cancellation_cutoff_hours'));
    const refundId = await withTransaction(async (tx) => {
      const { rows } = await tx.query<{ member_id: string | null; start_at: string; cancelled_at: string | null; booking_type: string }>('SELECT member_id, start_at, cancelled_at, booking_type FROM court_bookings WHERE id = $1 FOR UPDATE', [id]);
      const b = rows[0];
      if (!b || (user.role === USER_ROLE.MEMBER && b.member_id !== user.member_id)) throw new AppError('BOOKING_NOT_FOUND');
      if (b.cancelled_at || Date.parse(b.start_at) <= Date.now() || b.booking_type !== 'REGULAR') throw new AppError('BOOKING_NOT_CANCELLABLE');
      await tx.query('UPDATE court_bookings SET cancelled_at = now() WHERE id = $1', [id]);
      const early = Date.parse(b.start_at) - Date.now() >= cutoff * 3_600_000;
      const refund = isStaff(user) && refundOverride !== undefined ? refundOverride : early;
      let first: string | null = null;
      if (refund) {
        const pays = (await tx.query<{ id: string; amount: string; refunded_amount: string }>(`SELECT id, amount, refunded_amount FROM payments WHERE source_type = 'COURT_BOOKING' AND source_id = $1 ORDER BY paid_at`, [id])).rows;
        for (const p of pays) {
          const left = toPaise(p.amount) - toPaise(p.refunded_amount);
          if (left > 0) {
            await refundInTx(tx, p.id, fromPaise(left), 'Booking cancelled');
            first ??= p.id;
          }
        }
      }
      return first;
    });
    const booking = (await bookingDetail(pool, id))!;
    let refund_amount = '0.00';
    if (refundId) refund_amount = (await query<{ a: string }>('SELECT refunded_amount::text AS a FROM payments WHERE id = $1', [refundId])).rows[0]!.a;
    return { booking, refund_amount, refund_payment_id: refundId };
  },
};

// ------------------------------------------------------------------ courts
export const CourtsService = {
  async list(sport_type: SportType | undefined, includeInactive: boolean): Promise<Court[]> {
    const params: unknown[] = [];
    const c: string[] = [];
    if (!includeInactive) c.push('is_active');
    if (sport_type) {
      params.push(sport_type);
      c.push(`sport_type = $${params.length}`);
    }
    return (await query<Court>(`SELECT * FROM courts ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY sort_order, name`, params)).rows;
  },

  async availability(user: AuthUser | undefined, q: { date: string; sport_type?: SportType; court_id?: string }): Promise<CourtAvailability[]> {
    const today = istDate(new Date());
    if (q.date < today || q.date > addDays(today, 60)) throw new AppError('VALIDATION_ERROR', { fields: { date: 'Must be today or up to 60 days ahead.' } });
    const open = String(await SettingsService.get<string>('club_open_time')).slice(0, 5);
    const close = String(await SettingsService.get<string>('club_close_time')).slice(0, 5);
    const starts = slotStarts(q.date, open, close);
    const params: unknown[] = [];
    const c = ['is_active'];
    if (q.sport_type) {
      params.push(q.sport_type);
      c.push(`sport_type = $${params.length}`);
    }
    if (q.court_id) {
      params.push(q.court_id);
      c.push(`id = $${params.length}`);
    }
    const courts = (await query<Court>(`SELECT * FROM courts WHERE ${c.join(' AND ')} ORDER BY sort_order, name`, params)).rows;
    const day = { from: istToUtc(q.date, '00:00'), to: istToUtc(addDays(q.date, 1), '00:00') };
    const booked = (await query<{ id: string; court_id: string; start_at: string; end_at: string; booking_type: string }>(
      `SELECT id, court_id, start_at, end_at, booking_type FROM court_bookings WHERE cancelled_at IS NULL AND start_at < $2 AND end_at > $1`,
      [day.from, day.to],
    )).rows;
    const staff = !!user && isStaff(user);
    return courts.map((court) => ({
      court_id: court.id,
      court_name: court.name,
      sport_type: court.sport_type,
      date: q.date,
      slots: starts.map((s) => {
        const a = Date.parse(s);
        const b = a + 3_600_000;
        const hit = booked.find((x) => x.court_id === court.id && Date.parse(x.start_at) < b && Date.parse(x.end_at) > a);
        const status = a <= Date.now() ? 'PAST' : hit ? (hit.booking_type === 'MAINTENANCE' ? 'BLOCKED' : 'BOOKED') : 'AVAILABLE';
        return { start_at: new Date(a).toISOString(), end_at: new Date(b).toISOString(), status, booking_id: staff && hit ? hit.id : null, walk_in_price: court.walk_in_rate_per_hour } as CourtAvailability['slots'][number];
      }),
    }));
  },

  async insert(body: Record<string, unknown>): Promise<Court> {
    const cols = Object.keys(body);
    return (await query<Court>(`INSERT INTO courts (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`, cols.map((k) => body[k]))).rows[0]!;
  },

  async update(id: string, body: Record<string, unknown>): Promise<Court> {
    const cols = Object.keys(body).filter((k) => body[k] !== undefined);
    if (cols.length === 0) {
      const c = await courtById(pool, id);
      if (!c) throw new AppError('COURT_NOT_FOUND');
      return c;
    }
    const { rows } = await query<Court>(`UPDATE courts SET ${cols.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [id, ...cols.map((k) => body[k])]);
    if (!rows[0]) throw new AppError('COURT_NOT_FOUND');
    return rows[0];
  },

  /** R-COURT-10: 1-hour MAINTENANCE bookings; anything that stands in the range makes the block fail (BOOKING_CONFLICT). */
  async block(id: string, start_at: string, end_at: string): Promise<{ blocks: BookingDetail[] }> {
    const a = Date.parse(start_at);
    const b = Date.parse(end_at);
    if (!(b > a) || a % 1_800_000 !== 0 || (b - a) % 3_600_000 !== 0) throw new AppError('INVALID_SLOT', { reason: 'Start on a 30-minute boundary, end a whole number of hours later.' });
    const ids = await withTransaction(async (tx) => {
      if (!(await courtById(tx, id))) throw new AppError('COURT_NOT_FOUND');
      const out: string[] = [];
      for (let t = a; t < b; t += 3_600_000) {
        out.push((await tx.query<{ id: string }>(`INSERT INTO court_bookings (court_id, booking_type, start_at, end_at, list_price, discount_amount) VALUES ($1, 'MAINTENANCE', $2, $3, 0, 0) RETURNING id`, [id, new Date(t).toISOString(), new Date(t + 3_600_000).toISOString()])).rows[0]!.id);
      }
      return out;
    });
    return { blocks: (await Promise.all(ids.map((x) => bookingDetail(pool, x)))).filter((x): x is BookingDetail => x !== null) };
  },

  async unblock(booking_id: string): Promise<void> {
    const r = await query(`DELETE FROM court_bookings WHERE id = $1 AND booking_type = 'MAINTENANCE'`, [booking_id]);
    if ((r.rowCount ?? 0) === 0) throw new AppError('BOOKING_NOT_FOUND');
  },
};
