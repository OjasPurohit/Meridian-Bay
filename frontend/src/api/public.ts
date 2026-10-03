/**
 * Public-website data. While the backend is unbuilt these read mock-data/*.json (same shapes as the API rows,
 * see frontend/README.md rule 7). Swap each body for a client.ts call without changing the signatures.
 */
import type { BarMenuItem, ClubSetting, Court, CourtBooking, MembershipPlan, Product, SocialSession, SocialSessionParticipant } from '@shared/types/rows';
import type { EnquiriesCreateRequest } from '@shared/types/requests.generated';
import type { SportType } from '@shared/constants/enums';

import settingsJson from '@mock/club-settings.json';
import courtsJson from '@mock/courts.json';
import plansJson from '@mock/membership-plans.json';
import sessionsJson from '@mock/social-sessions.json';
import participantsJson from '@mock/social-session-participants.json';
import bookingsJson from '@mock/court-bookings.json';
import menuJson from '@mock/bar-menu-items.json';
import productsJson from '@mock/products.json';

const settings = settingsJson as unknown as ClubSetting[];
const courts = courtsJson as unknown as Court[];
const plans = plansJson as unknown as MembershipPlan[];
const sessions = sessionsJson as unknown as SocialSession[];
const participants = participantsJson as unknown as SocialSessionParticipant[];
const bookings = bookingsJson as unknown as CourtBooking[];
const menu = menuJson as unknown as BarMenuItem[];
const products = productsJson as unknown as Product[];

const resolve = <T,>(value: T) => Promise.resolve(value);

export interface PublicClubInfo {
  club_name: string;
  club_tagline: string;
  club_description: string;
  club_address: string;
  club_phone: string;
  club_email: string;
  club_open_time: string;
  club_close_time: string;
  social_play_start_time: string;
  social_play_end_time: string;
  /** Keys whose values are still marked PLACEHOLDER in settings. */
  placeholders: string[];
}

export function getClubInfo(): Promise<PublicClubInfo> {
  const pub = settings.filter((s) => s.is_public);
  const get = (k: string) => String(pub.find((s) => s.key === k)?.value ?? '');
  return resolve({
    club_name: get('club_name'),
    club_tagline: get('club_tagline'),
    club_description: get('club_description'),
    club_address: get('club_address'),
    club_phone: get('club_phone'),
    club_email: get('club_email'),
    club_open_time: get('club_open_time'),
    club_close_time: get('club_close_time'),
    social_play_start_time: get('social_play_start_time'),
    social_play_end_time: get('social_play_end_time'),
    placeholders: pub.filter((s) => /placeholder/i.test(s.description ?? '')).map((s) => s.key),
  });
}

export function listCourts(): Promise<Court[]> {
  return resolve(courts.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order));
}

export function listPlans(): Promise<MembershipPlan[]> {
  return resolve(plans.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order));
}

export interface UpcomingSocialSession extends SocialSession {
  start_at: string;
  end_at: string;
  court_name: string;
  spots_left: number;
}

export function listUpcomingSocialSessions(): Promise<UpcomingSocialSession[]> {
  const rows = sessions
    .filter((s) => s.status === 'OPEN')
    .map((s) => {
      const booking = bookings.find((b) => b.id === s.court_booking_id)!;
      const joined = participants.filter((p) => p.social_session_id === s.id && p.status === 'JOINED').length;
      return {
        ...s,
        start_at: booking.start_at,
        end_at: booking.end_at,
        court_name: courts.find((c) => c.id === booking.court_id)?.name ?? '',
        spots_left: Math.max(0, s.capacity - joined),
      };
    })
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
  return resolve(rows);
}

export function listMenu(): Promise<BarMenuItem[]> {
  return resolve(menu.filter((m) => m.is_available).sort((a, b) => a.sort_order - b.sort_order));
}

export function listShopBrands(): Promise<string[]> {
  return resolve([...new Set(products.filter((p) => p.is_active && p.brand).map((p) => p.brand as string))]);
}

/** Demo only: validates like the API would, but nothing leaves the browser. */
export function createEnquiry(body: EnquiriesCreateRequest): Promise<{ enquiry_number: string; persisted: false }> {
  if (body.enquiry_type === 'TRIAL' && body.preferred_start_at && new Date(body.preferred_start_at) <= new Date()) {
    return Promise.reject(new Error('Preferred time must be in the future.'));
  }
  return new Promise((ok) => setTimeout(() => ok({ enquiry_number: 'DEMO', persisted: false }), 600));
}

export const SPORT_LABEL: Record<SportType, string> = {
  TENNIS: 'Tennis',
  PADEL: 'Padel',
  CRICKET: 'Cricket',
  BADMINTON: 'Badminton',
};
