/**
 * Job applications (FR-AUTH-008, FR-STAFF-008). A job application is NOT an employee: it holds the applicant's bcrypt
 * hash only while PENDING (so they can log in to the "under review" page); approval turns it into users + staff in one
 * transaction (same email and password), a decision of either kind clears the stored hash.
 */
import bcrypt from 'bcryptjs';
import { EMPLOYEE_ROLES } from '@shared/constants/rules';
import type { ApplicationStatus, UserRole } from '@shared/constants/enums';
import type { EmployeeApplicationPending, EmployeeApplicationView } from '@shared/types/api';
import type { EmployeeApplication } from '@shared/types/rows';
import { getConfig } from '../../config';
import { invalidateUserCache, type AuthUser } from '../../kernel/auth';
import { advisoryLock, query, withTransaction, type Tx } from '../../kernel/db';
import { AppError } from '../../kernel/errors';

const pool: Tx = { query };

const VIEW = `
  SELECT a.id, a.full_name, a.email, a.phone, a.status, a.approved_role, a.applied_at, a.reviewed_at, a.reviewed_by_user_id, a.decision_note,
         r.full_name AS reviewed_by_name
    FROM employee_applications a LEFT JOIN users r ON r.id = a.reviewed_by_user_id`;

const viewById = async (db: Tx, id: string): Promise<EmployeeApplicationView | null> =>
  (await db.query<EmployeeApplicationView>(`${VIEW} WHERE a.id = $1`, [id])).rows[0] ?? null;

const DEFAULT_DESIGNATION: Record<(typeof EMPLOYEE_ROLES)[number], string> = {
  FRONT_DESK: 'Front Desk Executive',
  KITCHEN_MANAGER: 'Kitchen Manager',
  STORE_MANAGER: 'Store Manager',
};

export const ApplicationsService = {
  /** Public. Creates a PENDING application; no users / staff row exists until the owner approves. */
  async create(body: { full_name: string; email: string; phone: string; password: string }): Promise<EmployeeApplicationPending> {
    const password_hash = await bcrypt.hash(body.password, getConfig().bcrypt_rounds);
    const row = await withTransaction(async (tx) => {
      await advisoryLock(tx, `application:${body.email.toLowerCase()}`);
      if ((await tx.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [body.email])).rows.length) throw new AppError('EMAIL_TAKEN');
      if ((await tx.query("SELECT 1 FROM employee_applications WHERE lower(email) = lower($1) AND status = 'PENDING'", [body.email])).rows.length) throw new AppError('APPLICATION_PENDING');
      const { rows } = await tx.query<EmployeeApplication>(
        'INSERT INTO employee_applications (full_name, email, phone, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
        [body.full_name, body.email, body.phone, password_hash],
      );
      return rows[0]!;
    });
    return { state: 'EMPLOYEE_APPLICATION_PENDING', full_name: row.full_name, email: row.email, applied_at: row.applied_at, redirect_to: '/employee-application-pending' };
  },

  async list(status?: ApplicationStatus): Promise<EmployeeApplicationView[]> {
    const { rows } = await pool.query<EmployeeApplicationView>(`${VIEW} ${status ? 'WHERE a.status = $1' : ''} ORDER BY (a.status = 'PENDING') DESC, a.applied_at DESC`, status ? [status] : []);
    return rows;
  },

  /** One transaction: lock, validate PENDING, create users (hash copied) + staff, mark APPROVED, clear the hash. */
  async approve(owner: AuthUser, id: string, body: { role: UserRole; designation?: string; monthly_salary?: string }): Promise<EmployeeApplicationView> {
    const role = body.role as (typeof EMPLOYEE_ROLES)[number];
    if (!(EMPLOYEE_ROLES as readonly string[]).includes(role)) throw new AppError('VALIDATION_ERROR', { fields: { role: 'Must be FRONT_DESK, KITCHEN_MANAGER or STORE_MANAGER.' } });
    const user_id = await withTransaction(async (tx) => {
      const app = (await tx.query<EmployeeApplication>('SELECT * FROM employee_applications WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!app) throw new AppError('APPLICATION_NOT_FOUND');
      if (app.status !== 'PENDING' || !app.password_hash) throw new AppError('INVALID_STATUS_TRANSITION', { reason: 'This application has already been decided.' });
      if ((await tx.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [app.email])).rows.length) throw new AppError('EMAIL_TAKEN');
      const u = await tx.query<{ id: string }>(
        'INSERT INTO users (email, password_hash, role, full_name, phone, must_change_password) VALUES ($1, $2, $3, $4, $5, false) RETURNING id',
        [app.email, app.password_hash, role, app.full_name, app.phone],
      );
      await tx.query('INSERT INTO staff (user_id, designation, monthly_salary) VALUES ($1, $2, $3)', [u.rows[0]!.id, body.designation ?? DEFAULT_DESIGNATION[role], body.monthly_salary ?? '0.00']);
      await tx.query(
        "UPDATE employee_applications SET status = 'APPROVED', approved_role = $2, reviewed_at = now(), reviewed_by_user_id = $3, password_hash = NULL WHERE id = $1",
        [id, role, owner.id],
      );
      return u.rows[0]!.id;
    });
    invalidateUserCache(user_id);
    return (await viewById(pool, id))!;
  },

  async reject(owner: AuthUser, id: string, note?: string): Promise<EmployeeApplicationView> {
    await withTransaction(async (tx) => {
      const app = (await tx.query<EmployeeApplication>('SELECT * FROM employee_applications WHERE id = $1 FOR UPDATE', [id])).rows[0];
      if (!app) throw new AppError('APPLICATION_NOT_FOUND');
      if (app.status !== 'PENDING') throw new AppError('INVALID_STATUS_TRANSITION', { reason: 'This application has already been decided.' });
      await tx.query("UPDATE employee_applications SET status = 'REJECTED', reviewed_at = now(), reviewed_by_user_id = $2, decision_note = $3, password_hash = NULL WHERE id = $1", [id, owner.id, note ?? null]);
    });
    return (await viewById(pool, id))!;
  },
};
