/**
 * Public-website data. With a backend configured (VITE_API_BASE_URL) these read the public API endpoints (courts,
 * plans, products, club info); without one, or if the API is unreachable, they fall back to mock-data/*.json
 * (same shapes as the API rows) so the site always renders.
 */
import type { BarMenuItem, ClubSetting, Court, MembershipPlan, Product } from '@shared/types/rows';
import type { EnquiriesCreateRequest } from '@shared/types/requests.generated';
import type { SportType } from '@shared/constants/enums';

import { apiRequest, isBackendConfigured } from './client';
import settingsJson from '@mock/club-settings.json';
import courtsJson from '@mock/courts.json';
import plansJson from '@mock/membership-plans.json';
import productsJson from '@mock/products.json';

const settings = settingsJson as unknown as ClubSetting[];
const courts = courtsJson as unknown as Court[];
const plans = plansJson as unknown as MembershipPlan[];
const products = productsJson as unknown as Product[];

const resolve = <T,>(value: T) => Promise.resolve(value);

/** Real data when a backend is configured; the mock rows if it is not, or cannot be reached. */
async function live<T>(fromApi: () => Promise<T>, fromMock: () => T): Promise<T> {
  if (!isBackendConfigured) return fromMock();
  try {
    return await fromApi();
  } catch {
    return fromMock();
  }
}

export interface PublicClubInfo {
  club_name: string;
  club_tagline: string;
  club_description: string;
  club_address: string;
  club_phone: string;
  club_email: string;
  club_open_time: string;
  club_close_time: string;
  /** Keys whose values are still marked PLACEHOLDER in settings. */
  placeholders: string[];
}

export function getClubInfo(): Promise<PublicClubInfo> {
  return live(
    async () => {
      const c = await apiRequest<{ name: string; tagline: string | null; description: string | null; address: string | null; phone: string | null; email: string | null; open_time: string; close_time: string }>('GET', '/public/club');
      return {
        club_name: c.name,
        club_tagline: c.tagline ?? '',
        club_description: c.description ?? '',
        club_address: c.address ?? '',
        club_phone: c.phone ?? '',
        club_email: c.email ?? '',
        club_open_time: c.open_time,
        club_close_time: c.close_time,
        placeholders: [],
      };
    },
    mockClubInfo,
  );
}

function mockClubInfo(): PublicClubInfo {
  const pub = settings.filter((s) => s.is_public);
  const get = (k: string) => String(pub.find((s) => s.key === k)?.value ?? '');
  return {
    club_name: get('club_name'),
    club_tagline: get('club_tagline'),
    club_description: get('club_description'),
    club_address: get('club_address'),
    club_phone: get('club_phone'),
    club_email: get('club_email'),
    club_open_time: get('club_open_time'),
    club_close_time: get('club_close_time'),
    placeholders: pub.filter((s) => /placeholder/i.test(s.description ?? '')).map((s) => s.key),
  };
}

export function listCourts(): Promise<Court[]> {
  return live(
    () => apiRequest<Court[]>('GET', '/courts'),
    () => courts.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order),
  );
}

export function listPlans(): Promise<MembershipPlan[]> {
  return live(
    () => apiRequest<MembershipPlan[]>('GET', '/memberships/plans'),
    () => plans.filter((p) => p.is_active).sort((a, b) => a.sort_order - b.sort_order),
  );
}

/** Public Bar & café board lives in features/bar-cafe/menu.ts. The kitchen POS menu comes from the API (bar_menu_items) or, in preview mode, mock-data/kitchen-menu-items.json. */
export function listMenu(): Promise<BarMenuItem[]> {
  return resolve([]);
}

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface CatalogueProduct extends Product {
  stock_status: StockStatus;
}

/** Sports gear only — the shop never lists café items (those live in the bar & café menu). */
export function listProducts(): Promise<CatalogueProduct[]> {
  return live(
    async () => {
      const rows = await apiRequest<{ id: string; sku: string; name: string; category: Product['category']; brand: string | null; description: string | null; price: string; image_url: string | null; stock_status: StockStatus }[]>('GET', '/shop/products');
      // The public API shows a stock status, not quantities: give the page a quantity that reads the same way.
      return rows.map((p) => ({ ...p, stock_quantity: p.stock_status === 'OUT_OF_STOCK' ? 0 : p.stock_status === 'LOW_STOCK' ? 1 : 100, low_stock_threshold: 5, is_active: true, created_at: '', updated_at: '' }) as CatalogueProduct);
    },
    mockProducts,
  );
}

function mockProducts(): CatalogueProduct[] {
  return (
    products
      .filter((p) => p.is_active)
      .map((p) => ({
        ...p,
        stock_status: (p.stock_quantity <= 0 ? 'OUT_OF_STOCK' : p.stock_quantity <= p.low_stock_threshold ? 'LOW_STOCK' : 'IN_STOCK') as StockStatus,
      }))
  );
}

export interface WalkInInfo {
  /** Lowest walk-in rate per sport, from the court catalogue. */
  rates: { sport: SportType; from: string }[];
}

export async function getWalkInInfo(): Promise<WalkInInfo> {
  const bySport = new Map<SportType, number>();
  for (const c of await listCourts()) {
    const r = parseFloat(c.walk_in_rate_per_hour);
    bySport.set(c.sport_type, Math.min(r, bySport.get(c.sport_type) ?? Infinity));
  }
  return { rates: [...bySport].map(([sport, from]) => ({ sport, from: from.toFixed(2) })) };
}

export async function listShopBrands(): Promise<string[]> {
  return [...new Set((await listProducts()).filter((p) => p.brand).map((p) => p.brand as string))];
}

/** With a backend: POST /enquiries (public) stores it in the front-desk inbox. Without one: validated here, kept nowhere. */
export async function createEnquiry(body: EnquiriesCreateRequest): Promise<{ enquiry_number: string; persisted: boolean }> {
  if (isBackendConfigured) {
    const e = await apiRequest<{ id: string }>('POST', '/enquiries', body);
    return { enquiry_number: e.id, persisted: true };
  }
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
