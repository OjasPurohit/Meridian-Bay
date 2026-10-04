/**
 * TEMPORARY — hackathon demo accounts. Removing the demo = delete this folder, the two lines that reference it in
 * src/auth/AuthProvider.tsx and src/auth/LoginMenu.tsx (both marked "DEMO"), and the dashboards' fallback identity.
 * These identities exist only in mock-data/users.json; nothing here talks to a server.
 */
import type { UserRole } from '@shared/constants/enums';
import { ROLE_HOME_ROUTE } from '@shared/constants/rules';
import type { User } from '@shared/types/rows';
import usersJson from '@mock/users.json';

/** Password of every seeded demo account (fictional seed data; used only to sign the demo shortcuts in through the real login). */
export const DEMO_PASSWORD = 'Password@123';

const users = usersJson as unknown as User[];

export interface DemoAccount {
  role: UserRole;
  label: string;
  tagline: string;
  /** What the presenter will see after clicking. */
  highlights: string[];
  user: User;
  home: string;
}

const find = (email: string) => users.find((u) => u.email === email)!;

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'MEMBER',
    label: 'Demo Member',
    tagline: 'Aarav Kapoor · Gold member',
    highlights: ['Live court calendar — book in two clicks', 'Gold pricing applied automatically', 'Store, café menu and club events'],
    user: find('aarav.kapoor@example.com'),
    home: ROLE_HOME_ROUTE.MEMBER,
  },
  {
    role: 'FRONT_DESK',
    label: 'Demo Front Desk',
    tagline: 'Neha Sharma · Reception',
    highlights: ['Full court calendar with every booking', 'Walk-in booking, search members, collect payments', "Today's takings at a glance"],
    user: find('neha.sharma@championsclub.example'),
    home: ROLE_HOME_ROUTE.FRONT_DESK,
  },
  {
    role: 'STORE_MANAGER',
    label: 'Demo Store Manager',
    tagline: 'Sanjay Gupta · Gear shop',
    highlights: ['Add products and restock', 'Shop orders from counter and online', 'One shelf shared with the member store'],
    user: find('sanjay.gupta@championsclub.example'),
    home: ROLE_HOME_ROUTE.STORE_MANAGER,
  },
  {
    role: 'KITCHEN_MANAGER',
    label: 'Demo Kitchen Manager',
    tagline: 'Ramesh Patil · Café & kitchen',
    highlights: ['POS with automatic member discounts', 'Live order board', 'Stock, products and receipts'],
    user: find('kitchen@championsclub.example'),
    home: ROLE_HOME_ROUTE.KITCHEN_MANAGER,
  },
  {
    role: 'OWNER_ADMIN',
    label: 'Demo Admin / Owner',
    tagline: 'Vikram Malhotra · Owner',
    highlights: ['Club-wide control centre', 'Revenue, profit/loss and analytics', 'Members, staff, events, enquiries, reports'],
    user: find('owner@championsclub.example'),
    home: ROLE_HOME_ROUTE.OWNER_ADMIN,
  },
];

export const demoAccount = (role: UserRole) => DEMO_ACCOUNTS.find((a) => a.role === role)!;
