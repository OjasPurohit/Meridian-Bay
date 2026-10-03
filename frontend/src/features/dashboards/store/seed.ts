import { addDays } from '@shared/lib/time';

import { rng } from './staticData';
import { mockSource, seedBookings, seedInvoices, seedKitchenOrders, seedMenu, seedPayments, seedProducts, seedShopOrders, type Source } from './source';
import { DEMO_TODAY, type BizProduct, type BizTx, type Dealer, type DemoState, type DEvent } from './types';

export { BUSINESS_CLIENT, clientName } from './source';
export const STATE_VERSION = 7;

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

/* ---------------------------------------------------------------- the business client's own (demo) books */
function seedBusiness(): { products: BizProduct[]; dealers: Dealer[]; tx: BizTx[] } {
  const products: BizProduct[] = [
    { id: 'bp-1', sku: 'TN-SENS-01', name: 'SmartRacket Sensor', category: 'Wearables', description: 'Clip-on swing sensor with the TechNova coaching app.', price: 4200, cost: 2500, stock: 86 },
    { id: 'bp-2', sku: 'TN-VEST-02', name: 'GPS Performance Vest', category: 'Wearables', description: 'Team load-tracking vest with 10 Hz GPS.', price: 18500, cost: 11200, stock: 24 },
    { id: 'bp-3', sku: 'TN-CAM-03', name: 'Court Analytics Camera', category: 'Analytics', description: 'Auto-tracking camera with shot and rally analytics.', price: 48000, cost: 31000, stock: 9 },
    { id: 'bp-4', sku: 'TN-KIT-04', name: 'Corporate Fitness Kit (20 pax)', category: 'Corporate', description: 'Bands, cones, balls and a coach guide for team days.', price: 24500, cost: 14600, stock: 15 },
    { id: 'bp-5', sku: 'TN-REC-05', name: 'Recovery Massage Gun', category: 'Recovery', description: 'Quiet percussion massager, 6 heads.', price: 7900, cost: 4300, stock: 41 },
    { id: 'bp-6', sku: 'TN-BOT-06', name: 'Smart Hydration Bottle', category: 'Wearables', description: 'Tracks intake and reminds you to drink.', price: 1800, cost: 900, stock: 6 },
    { id: 'bp-7', sku: 'TN-JER-07', name: 'Custom Team Jersey (set of 12)', category: 'Apparel', description: 'Sublimated jerseys with logo and numbers.', price: 14400, cost: 8200, stock: 33 },
    { id: 'bp-8', sku: 'TN-TOW-08', name: 'Cooling Towel Pack (10)', category: 'Recovery', description: 'Instant-cool microfibre towels.', price: 3200, cost: 1500, stock: 120 },
  ];
  const dealers: Dealer[] = [
    { id: 'dl-1', name: 'Apex Sports Distributors', contact: 'Rohit Jain', phone: '+91 98200 11201', email: 'rohit@apexsports.example', city: 'Pune', since: '2023-02-14', status: 'ACTIVE', offers: ['Racquets', 'Bags', 'Grips'], traded: 1_480_000 },
    { id: 'dl-2', name: 'Velocity Gear Co.', contact: 'Meera Pillai', phone: '+91 98200 11202', email: 'meera@velocitygear.example', city: 'Mumbai', since: '2022-09-01', status: 'ACTIVE', offers: ['Wearables', 'GPS vests', 'Sensors'], traded: 2_260_000 },
    { id: 'dl-3', name: 'ProCourt Surfaces Pvt Ltd', contact: 'Anil Deshpande', phone: '+91 98200 11203', email: 'anil@procourt.example', city: 'Bengaluru', since: '2024-01-20', status: 'ACTIVE', offers: ['Court resurfacing', 'Nets & posts', 'Line marking'], traded: 940_000 },
    { id: 'dl-4', name: 'FitFuel Nutrition', contact: 'Shreya Kapoor', phone: '+91 98200 11204', email: 'shreya@fitfuel.example', city: 'Hyderabad', since: '2023-07-09', status: 'ACTIVE', offers: ['Protein', 'Electrolytes', 'Energy bars'], traded: 610_000 },
    { id: 'dl-5', name: 'Summit Apparel House', contact: 'Karan Mehra', phone: '+91 98200 11205', email: 'karan@summitapparel.example', city: 'Surat', since: '2021-11-30', status: 'PAUSED', offers: ['Team jerseys', 'Track suits', 'Custom printing'], traded: 1_120_000 },
    { id: 'dl-6', name: 'Racquet Republic', contact: 'Tanya Bose', phone: '+91 98200 11206', email: 'tanya@racquetrepublic.example', city: 'Delhi', since: '2024-05-18', status: 'ACTIVE', offers: ['Tennis', 'Padel', 'Badminton rackets'], traded: 385_000 },
  ];
  const r = rng(9090);
  const tx: BizTx[] = [];
  const customers = ['Champions Club (Meridian Bay)', 'Greenfield Corp', 'Apex Realty', 'BlueWave Fitness', 'Orbit Sports Academy', 'Zenith Schools Trust'];
  const costs = [['Warehouse rent', 38_000], ['Staff salaries', 92_000], ['Logistics & courier', 21_000], ['Marketing campaign', 16_000], ['Software & cloud', 9_500], ['Insurance', 11_000]] as const;
  let n = 1;
  for (let day = 185; day >= 0; day -= 1) {
    const date = addDays(DEMO_TODAY, -day);
    const dom = Number(date.slice(8));
    const at = ist(date, `1${n % 10}:20`);
    const growth = 0.72 + ((185 - day) / 185) * 0.5; // a business that is steadily growing
    if (r() < 0.36) {
      const p = products[Math.floor(r() * products.length)];
      const target = (26_000 + r() * 16_000) * growth * 1.25; // steady order sizes, growing over time
      const qty = Math.max(1, Math.round(target / p.price));
      tx.push({ id: `bt-${n++}`, at, type: 'SALE', party: customers[Math.floor(r() * customers.length)], description: `${qty} × ${p.name}`, amount: Math.round((p.price * qty * 1.12) / 100) * 100, status: r() < 0.88 ? 'PAID' : 'PENDING', ref: `TN-S-${1000 + n}` });
    }
    if (dom === 7 || dom === 21) {
      const d = dealers[Math.floor(r() * dealers.length)];
      tx.push({ id: `bt-${n++}`, at, type: 'PURCHASE', party: d.name, description: `Stock purchase — ${d.offers[0]}`, amount: Math.round((48_000 + r() * 42_000) / 100) * 100, status: r() < 0.9 ? 'PAID' : 'PENDING', ref: `TN-P-${1000 + n}` });
    }
    if (dom === 1 || dom === 12 || dom === 26) {
      const c = dom === 1 ? costs[1] : dom === 12 ? costs[0] : costs[2 + (Number(date.slice(5, 7)) % 4)];
      tx.push({ id: `bt-${n++}`, at, type: 'EXPENSE', party: 'Operations', description: c[0], amount: c[1], status: 'PAID', ref: `TN-E-${1000 + n}` });
    }
  }
  return { products, dealers, tx: tx.sort((a, b) => b.at.localeCompare(a.at)) };
}

export function buildState(src: Source): DemoState {
  const biz = seedBusiness();
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
    bizProducts: biz.products,
    dealers: biz.dealers,
    bizTx: biz.tx,
  };
}

export const seedState = (): DemoState => buildState(mockSource());
