/**
 * Club events: the owner creates them, every signed-in role reads the same rows, members register / cancel.
 * Auto-discovered by app.ts, mounted at /api/v1/events.
 *   list  any signed-in user (member callers also get `is_registered`)    create OWNER_ADMIN    register / unregister MEMBER
 */
import { Router } from 'express';
import { EVENT_KIND, USER_ROLE } from '@shared/constants/enums';
import type { EventView } from '@shared/types/api';
import { callerScope, requireAuth, requireRole } from '../../kernel/auth';
import { query, withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok } from '../../kernel/http';
import { idParams, money, strictObject, validateBody, validateParams, z } from '../../kernel/validate';

export const router = Router();
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const when = z.string().datetime({ offset: true });

const SELECT = `
  SELECT e.id, e.title, e.kind, e.description, e.location, e.start_at, e.end_at, e.capacity, e.fee,
         (SELECT count(*)::int FROM event_registrations r WHERE r.event_id = e.id) AS registered_count,
         coalesce((SELECT true FROM event_registrations r WHERE r.event_id = e.id AND r.member_id = $1), false) AS is_registered
    FROM events e`;

async function view(db: Tx, id: string, member_id: string | null): Promise<EventView> {
  const r = (await db.query<EventView>(`${SELECT} WHERE e.id = $2`, [member_id, id])).rows[0];
  if (!r) throw new AppError('EVENT_NOT_FOUND');
  return r;
}

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const member_id = req.user!.role === USER_ROLE.MEMBER ? (callerScope(req) as { member_id: string }).member_id : null;
  ok(res, (await query<EventView>(`${SELECT} ORDER BY e.start_at, e.title`, [member_id])).rows);
}));

router.post('/', requireAuth, requireRole(USER_ROLE.OWNER_ADMIN), validateBody(strictObject({
  title: z.string().trim().min(1).max(160), kind: enumOf(EVENT_KIND), description: z.string().trim().max(2000).optional(), location: z.string().trim().min(1).max(160),
  start_at: when, end_at: when, capacity: z.number().int().min(1).max(100000), fee: money.optional(),
}).refine((b) => Date.parse(b.end_at) > Date.parse(b.start_at), { path: ['end_at'], message: 'Must be after start_at.' })),
asyncHandler(async (req, res) => {
  const b = req.body as { title: string; kind: string; description?: string; location: string; start_at: string; end_at: string; capacity: number; fee?: string };
  const { rows } = await query<{ id: string }>(
    'INSERT INTO events (title, kind, description, location, start_at, end_at, capacity, fee) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id',
    [b.title, b.kind, b.description ?? null, b.location, b.start_at, b.end_at, b.capacity, b.fee ?? '0.00'],
  );
  created(res, await view({ query }, rows[0]!.id, null));
}));

const member = [requireAuth, requireRole(USER_ROLE.MEMBER)];

router.post('/:id/registrations', ...member, validateParams(idParams), asyncHandler(async (req, res) => {
  const member_id = (callerScope(req) as { member_id: string }).member_id;
  const id = req.params.id!;
  await withTransaction(async (tx) => {
    const e = (await tx.query<{ capacity: number; end_at: string }>('SELECT capacity, end_at FROM events WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!e) throw new AppError('EVENT_NOT_FOUND');
    if (Date.parse(e.end_at) <= Date.now()) throw new AppError('EVENT_ENDED');
    if (!(await tx.query('SELECT 1 FROM event_registrations WHERE event_id = $1 AND member_id = $2', [id, member_id])).rows.length) {
      const taken = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM event_registrations WHERE event_id = $1', [id])).rows[0]!.n;
      if (taken >= e.capacity) throw new AppError('EVENT_FULL');
      await tx.query('INSERT INTO event_registrations (event_id, member_id) VALUES ($1, $2)', [id, member_id]);
    }
  });
  ok(res, await view({ query }, id, member_id));
}));

router.delete('/:id/registrations', ...member, validateParams(idParams), asyncHandler(async (req, res) => {
  const member_id = (callerScope(req) as { member_id: string }).member_id;
  const id = req.params.id!;
  await view({ query }, id, member_id); // 404 for an unknown event
  await query('DELETE FROM event_registrations WHERE event_id = $1 AND member_id = $2', [id, member_id]);
  ok(res, await view({ query }, id, member_id));
}));

export default { basePath: '/events', router };
