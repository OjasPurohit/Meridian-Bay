/**
 * Enquiries (R-ENQ-01/02): a plain inbox. Auto-discovered by app.ts, mounted at /api/v1/enquiries.
 *   create PUBLIC | FRONT_DESK | OWNER_ADMIN    list / get / update FRONT_DESK | OWNER_ADMIN
 */
import { Router } from 'express';
import { ENQUIRY_TYPE, SPORT_TYPE, USER_ROLE } from '@shared/constants/enums';
import type { EnquiryView } from '@shared/types/api';
import { requireAuth, requireRole } from '../../kernel/auth';
import { query } from '../../kernel/db';
import { AppError } from '../../kernel/errors';
import { asyncHandler, created, ok } from '../../kernel/http';
import { idParams, queryBool, strictObject, uuid, validateBody, validateParams, validateQuery, z } from '../../kernel/validate';

export const router = Router();
const staff = [requireAuth, requireRole(USER_ROLE.FRONT_DESK, USER_ROLE.OWNER_ADMIN)];
const enumOf = <T extends Record<string, string>>(o: T) => z.enum(Object.values(o) as [string, ...string[]]) as unknown as z.ZodType<T[keyof T]>;
const phone = z.string().trim().regex(/^\+?\d{10,15}$/, 'Must be a phone number.');
const text = (n: number) => z.string().trim().min(1).max(n);

const SELECT = `SELECT e.*, p.name AS plan_name FROM enquiries e LEFT JOIN membership_plans p ON p.id = e.membership_plan_id`;
const find = async (id: string): Promise<EnquiryView> => {
  const r = (await query<EnquiryView>(`${SELECT} WHERE e.id = $1`, [id])).rows[0];
  if (!r) throw new AppError('ENQUIRY_NOT_FOUND');
  return r;
};

router.post('/', validateBody(strictObject({
  name: text(120), phone, email: z.string().trim().toLowerCase().email().optional(), enquiry_type: enumOf(ENQUIRY_TYPE).optional(), message: text(2000).optional(),
  membership_plan_id: uuid.optional(), sport_type: enumOf(SPORT_TYPE).optional(), preferred_start_at: z.string().datetime({ offset: true }).refine((v) => Date.parse(v) > Date.now(), 'Must be in the future.').optional(),
})), asyncHandler(async (req, res) => {
  const b = req.body as Record<string, string | undefined>;
  const { rows } = await query<{ id: string }>(
    `INSERT INTO enquiries (enquiry_type, name, email, phone, message, membership_plan_id, sport_type, preferred_start_at) VALUES (coalesce($1, 'GENERAL')::enquiry_type, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [b.enquiry_type ?? null, b.name, b.email ?? null, b.phone, b.message ?? null, b.membership_plan_id ?? null, b.sport_type ?? null, b.preferred_start_at ?? null],
  );
  created(res, await find(rows[0]!.id));
}));

router.get('/', ...staff, validateQuery(z.object({ handled: queryBool.optional(), enquiry_type: enumOf(ENQUIRY_TYPE).optional(), q: z.string().trim().max(100).optional() })),
  asyncHandler(async (req, res) => {
    const q = req.query as { handled?: boolean; enquiry_type?: string; q?: string };
    const c: string[] = [];
    const params: unknown[] = [];
    if (q.handled !== undefined) c.push(q.handled ? 'e.handled_at IS NOT NULL' : 'e.handled_at IS NULL');
    if (q.enquiry_type) {
      params.push(q.enquiry_type);
      c.push(`e.enquiry_type = $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
      c.push(`(e.name ILIKE $${params.length} OR e.email ILIKE $${params.length} OR e.phone ILIKE $${params.length} OR e.message ILIKE $${params.length})`);
    }
    ok(res, (await query<EnquiryView>(`${SELECT} ${c.length ? `WHERE ${c.join(' AND ')}` : ''} ORDER BY (e.handled_at IS NOT NULL), e.created_at DESC`, params)).rows);
  }));
router.get('/:id', ...staff, validateParams(idParams), asyncHandler(async (req, res) => ok(res, await find(req.params.id!))));
router.patch('/:id', ...staff, validateParams(idParams), validateBody(strictObject({ handled: z.boolean().optional(), name: text(120).optional(), phone: phone.optional(), email: z.string().trim().toLowerCase().email().optional(), message: text(2000).optional() })),
  asyncHandler(async (req, res) => {
    const b = req.body as { handled?: boolean } & Record<string, unknown>;
    await find(req.params.id!);
    const sets: string[] = [];
    const params: unknown[] = [req.params.id];
    for (const k of ['name', 'phone', 'email', 'message']) {
      if (b[k] !== undefined) {
        params.push(b[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (b.handled !== undefined) sets.push(b.handled ? 'handled_at = now()' : 'handled_at = NULL');
    if (sets.length) await query(`UPDATE enquiries SET ${sets.join(', ')} WHERE id = $1`, params);
    ok(res, await find(req.params.id!));
  }));

export default { basePath: '/enquiries', router };
