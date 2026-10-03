/** SQL for authentication: the `users` row plus the profile (member / staff / business client) the role points at. */
import type { StaffView } from '@shared/types/api';
import type { BusinessClient, User } from '@shared/types/rows';
import type { Tx } from '../../kernel/db';

export async function findUserByEmail(db: Tx, email: string): Promise<User | null> {
  const { rows } = await db.query<User>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return rows[0] ?? null;
}

export async function findUserById(db: Tx, id: string): Promise<User | null> {
  const { rows } = await db.query<User>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function staffByUserId(db: Tx, user_id: string): Promise<StaffView | null> {
  const { rows } = await db.query<StaffView>(
    `SELECT s.id, s.user_id, s.designation, s.monthly_salary, s.joined_on::text AS joined_on, s.created_at, s.updated_at,
            u.full_name, u.email, u.phone, u.role, u.is_active
       FROM staff s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1`,
    [user_id],
  );
  return rows[0] ?? null;
}

export async function businessClientByUserId(db: Tx, user_id: string): Promise<BusinessClient | null> {
  const { rows } = await db.query<BusinessClient>('SELECT * FROM business_clients WHERE user_id = $1', [user_id]);
  return rows[0] ?? null;
}

export async function setPassword(db: Tx, user_id: string, password_hash: string): Promise<void> {
  await db.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [user_id, password_hash]);
}
