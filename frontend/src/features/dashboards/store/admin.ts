/**
 * Owner-side management that has no optimistic local twin: employees, job applications, members. Every call goes to the
 * API first; only when the database accepted it is the store reloaded (refetch), so the screen never shows a change
 * that did not happen. In preview mode (no live session) nothing can be saved and the caller is told so.
 */
import type { UserRole } from '@shared/constants/enums';
import { apiRequest, ApiError, isBackendConfigured } from '@/api/client';
import { isLive, refreshLiveFresh } from './live';

export type AdminResult = { ok: true } | { ok: false; message: string };

const PREVIEW = 'This is a preview with sample data: log in with the live app to save changes to the database.';
const NO_SESSION = 'Your session is not active. Log in again to save changes.';

/** The preview notice belongs to a build without a backend only. With a backend, a missing live session is a session
 *  problem (and nothing is saved), never "preview mode". */
export const unavailableMessage = (): string | null => (isLive() ? null : isBackendConfigured ? NO_SESSION : PREVIEW);

async function run(job: () => Promise<unknown>): Promise<AdminResult> {
  const blocked = unavailableMessage();
  if (blocked) return { ok: false, message: blocked };
  try {
    await job();
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.message : 'That change could not be saved.' };
  }
  await refreshLiveFresh();
  return { ok: true };
}

const post = (path: string, body: unknown) => apiRequest('POST', path, body);
const patch = (path: string, body: unknown) => apiRequest('PATCH', path, body);

export const admin = {
  // ---- job applications
  approveApplication: (id: string, o: { role: UserRole; designation?: string; monthly_salary?: string }) => run(() => post(`/staff/applications/${id}/approve`, o)),
  rejectApplication: (id: string, note?: string) => run(() => post(`/staff/applications/${id}/reject`, note ? { note } : {})),

  // ---- employees
  createStaff: (o: { full_name: string; email: string; phone?: string; role: UserRole; password: string; designation: string; monthly_salary: string }) => run(() => post('/staff', o)),
  updateStaff: (id: string, o: { full_name?: string; phone?: string; designation?: string; monthly_salary?: string }) => run(() => patch(`/staff/${id}`, o)),
  setStaffActive: (id: string, is_active: boolean) => run(() => patch(`/staff/${id}`, { is_active })),
  // an employee asks for leave and may withdraw a request that is still open; the owner decides (decideLeave)
  requestLeave: (o: { start_date: string; end_date: string; reason?: string }) => run(() => post('/staff/leave-requests', o)),
  cancelLeave: (id: string) => run(() => post(`/staff/leave-requests/${id}/cancel`, {})),
  decideLeave: (id: string, decision: 'APPROVE' | 'REJECT', note?: string) => run(() => post(`/staff/leave-requests/${id}/decision`, { decision, ...(note ? { note } : {}) })),

  // ---- website trial requests (owner decides; approval books the TRIAL court booking)
  approveTrial: (id: string) => run(() => post(`/enquiries/${id}/approve-trial`, {})),
  declineTrial: (id: string) => run(() => post(`/enquiries/${id}/decline-trial`, {})),

  // ---- courts (the `courts` table; every role's court list is refetched from it)
  createCourt: (o: { name: string; sport_type: string; walk_in_rate_per_hour: string; surface?: string; description?: string }) => run(() => post('/courts', o)),
  updateCourt: (id: string, o: { name?: string; walk_in_rate_per_hour?: string; surface?: string; description?: string; is_active?: boolean }) => run(() => patch(`/courts/${id}`, o)),

  // ---- events (the `events` table: the owner creates, every role reads the same rows)
  createEvent: (o: { title: string; kind: string; description?: string; location: string; start_at: string; end_at: string; capacity: number; fee: string }) => run(() => post('/events', o)),
  registerForEvent: (id: string) => run(() => post(`/events/${id}/registrations`, {})),
  unregisterFromEvent: (id: string) => run(() => apiRequest('DELETE', `/events/${id}/registrations`)),

  // ---- members
  createMember: (o: { full_name: string; email: string; phone: string; date_of_birth?: string; address?: string; initial_password?: string; membership_plan_id?: string; payment_method?: string }) => run(() => post('/members', o)),
  updateMember: (id: string, o: { full_name?: string; phone?: string; address?: string; date_of_birth?: string }) => run(() => patch(`/members/${id}`, o)),
  setMemberActive: (id: string, is_active: boolean) => run(() => patch(`/members/${id}`, { is_active })),
};
