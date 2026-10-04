import { CalendarOff, BarChart3, Boxes, CalendarDays, ChefHat, ClipboardList, CreditCard, History, LayoutDashboard, LineChart, Package, ReceiptText, ShoppingBag, Store, Ticket, Trophy, UserCog, Users, Utensils, Wallet, type LucideIcon, ConciergeBell, FileBarChart, MessageSquare, IdCard, Dumbbell } from 'lucide-react';

import type { UserRole } from '@shared/constants/enums';
import { ROLE_HOME_ROUTE } from '@shared/constants/rules';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** match the exact path only (the role's home) */
  end?: boolean;
}

const h = ROLE_HOME_ROUTE;

export const NAV: Record<UserRole, NavItem[]> = {
  MEMBER: [
    { to: h.MEMBER, label: 'Courts & bookings', icon: CalendarDays, end: true },
    { to: `${h.MEMBER}/store`, label: 'Store', icon: ShoppingBag },
    { to: `${h.MEMBER}/kitchen`, label: 'Kitchen', icon: Utensils },
    { to: `${h.MEMBER}/events`, label: 'Events', icon: Ticket },
  ],
  FRONT_DESK: [
    { to: h.FRONT_DESK, label: 'Court calendar', icon: CalendarDays, end: true },
    { to: `${h.FRONT_DESK}/bookings`, label: 'Bookings', icon: ClipboardList },
    { to: `${h.FRONT_DESK}/members`, label: 'Members', icon: IdCard },
    { to: `${h.FRONT_DESK}/payments`, label: 'Payments', icon: Wallet },
    { to: `${h.FRONT_DESK}/leave`, label: 'Leave & pay', icon: CalendarOff },
  ],
  STORE_MANAGER: [
    { to: h.STORE_MANAGER, label: 'Store & inventory', icon: Store, end: true },
    { to: `${h.STORE_MANAGER}/leave`, label: 'Leave & pay', icon: CalendarOff },
  ],
  KITCHEN_MANAGER: [
    { to: h.KITCHEN_MANAGER, label: 'POS', icon: ConciergeBell, end: true },
    { to: `${h.KITCHEN_MANAGER}/orders`, label: 'Orders', icon: ChefHat },
    { to: `${h.KITCHEN_MANAGER}/history`, label: 'Previous orders', icon: History },
    { to: `${h.KITCHEN_MANAGER}/invoices`, label: 'Invoices', icon: ReceiptText },
    { to: `${h.KITCHEN_MANAGER}/stock`, label: 'Stock', icon: Boxes },
    { to: `${h.KITCHEN_MANAGER}/products`, label: 'Products', icon: Package },
    { to: `${h.KITCHEN_MANAGER}/leave`, label: 'Leave & pay', icon: CalendarOff },
  ],
  OWNER_ADMIN: [
    { to: h.OWNER_ADMIN, label: 'Overview', icon: LayoutDashboard, end: true },
    { to: `${h.OWNER_ADMIN}/analytics`, label: 'Analytics', icon: LineChart },
    { to: `${h.OWNER_ADMIN}/members`, label: 'Members', icon: Users },
    { to: `${h.OWNER_ADMIN}/memberships`, label: 'Memberships', icon: Dumbbell },
    { to: `${h.OWNER_ADMIN}/bookings`, label: 'Courts & bookings', icon: CalendarDays },
    { to: `${h.OWNER_ADMIN}/store`, label: 'Store & inventory', icon: Store },
    { to: `${h.OWNER_ADMIN}/kitchen`, label: 'Kitchen', icon: Utensils },
    { to: `${h.OWNER_ADMIN}/payments`, label: 'Invoices & payments', icon: CreditCard },
    { to: `${h.OWNER_ADMIN}/staff`, label: 'Staff', icon: UserCog },
    { to: `${h.OWNER_ADMIN}/events`, label: 'Events', icon: Trophy },
    { to: `${h.OWNER_ADMIN}/enquiries`, label: 'Enquiries', icon: MessageSquare },
    { to: `${h.OWNER_ADMIN}/reports`, label: 'Reports', icon: FileBarChart },
  ],
};

export const ROLE_BY_PREFIX: [string, UserRole][] = (Object.entries(h) as [UserRole, string][]).map(([role, path]) => [path, role]);

export function roleFromPath(pathname: string): UserRole | null {
  const hit = ROLE_BY_PREFIX.find(([p]) => pathname === p || pathname.startsWith(`${p}/`));
  return hit ? hit[1] : null;
}

export { BarChart3 };
