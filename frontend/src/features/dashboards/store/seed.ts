import { addDays } from '@shared/lib/time';

import { mockSource, seedBookings, seedInvoices, seedKitchenOrders, seedMenu, seedPayments, seedProducts, seedShopOrders, type Source } from './source';
import { DEMO_TODAY, type DemoState, type DEvent } from './types';

export { clientName } from './source';
export const STATE_VERSION = 8;

const ist = (date: string, hhmm: string) => new Date(Date.parse(`${date}T${hhmm}:00+05:30`)).toISOString();

function seedEvents(): DEvent[] {
  const d = (n: number) => addDays(DEMO_TODAY, n);
  const synthetic: DEvent[] = [
    { id: 'ev-camp', title: 'Junior Coaching Camp', kind: 'CAMP', description: 'Five mornings of drills, match play and fitness for players under 18, led by our head coaches. Happening now — a few seats left for the final sessions.', start_at: ist(d(-2), '07:00'), end_at: ist(d(2), '09:00'), location: 'Badminton Courts 1–2 and Tennis Court 2', capacity: 24, registered: [], base_registered: 22, fee: 3500, perks: ['Junior plan: 70% off', 'Kit and refreshments included'] },
    { id: 'ev-padel', title: 'Padel Beginners Clinic', kind: 'CLINIC', description: 'Learn the rules, walls and doubles tactics in a relaxed two-hour clinic. Rackets provided.', start_at: ist(d(7), '09:00'), end_at: ist(d(7), '11:00'), location: 'Padel Court 1', capacity: 12, registered: [], base_registered: 7, fee: 800, perks: ['Gold: free', 'Silver: 50% off', 'Junior: 70% off', 'Rackets provided'] },
    { id: 'ev-open', title: 'Autumn Open — Tennis Tournament', kind: 'TOURNAMENT', description: 'Our flagship weekend tournament: singles and doubles draws, seeded brackets, live scoring and a finals-night dinner at the café.', start_at: ist(d(14), '08:00'), end_at: ist(d(15), '19:00'), location: 'Tennis Courts 1 & 2 · finals on Court 1', capacity: 32, registered: [], base_registered: 21, fee: 1500, perks: ['Gold: free entry + complimentary finals dinner', 'Silver: 50% off', 'Junior: 70% off · junior draw'] },
    { id: 'ev-mixer', title: 'Members’ Mixer & Live Music', kind: 'MIXER', description: 'An evening on the café terrace: live acoustic set, tasting plates and a chance to meet your playing partners.', start_at: ist(d(21), '19:00'), end_at: ist(d(21), '22:00'), location: 'Bar & Café terrace', capacity: 80, registered: [], base_registered: 46, fee: 0, perks: ['Free for members', 'Gold: 2 complimentary drinks', 'Everyone: bar discount applies to your tab'] },
  ];
  return synthetic.sort((a, b) => a.start_at.localeCompare(b.start_at));
}

export function buildState(src: Source): DemoState {
  return {
    v: STATE_VERSION,
    bookings: seedBookings(src),
    products: seedProducts(src),
    shopOrders: seedShopOrders(src),
    menu: seedMenu(src),
    kOrders: seedKitchenOrders(src),
    events: seedEvents(),
    payments: seedPayments(src),
    invoices: seedInvoices(src),
  };
}

export const seedState = (): DemoState => buildState(mockSource());
