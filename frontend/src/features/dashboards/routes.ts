import { createElement, lazy } from 'react';
import { ROLE_HOME_ROUTE } from '@shared/constants/rules';

import type { FeatureRoute } from '@/routing';
import MemberOrderPage from './pages/MemberOrderPage';

/**
 * Role dashboards. Every page is lazy-loaded so the public site's first paint never pays for them, and all share
 * the sidebar `dashboard` layout (src/features/dashboards/layout). Add a page = add a line here and in layout/nav.ts.
 */
const page = (load: () => Promise<{ default: React.ComponentType }>, path: string, role: keyof typeof ROLE_HOME_ROUTE): FeatureRoute => ({
  path,
  layout: 'dashboard',
  roles: [role],
  element: createElement(lazy(load)),
});

const M = ROLE_HOME_ROUTE.MEMBER;
const F = ROLE_HOME_ROUTE.FRONT_DESK;
const S = ROLE_HOME_ROUTE.STORE_MANAGER;
const K = ROLE_HOME_ROUTE.KITCHEN_MANAGER;
const O = ROLE_HOME_ROUTE.OWNER_ADMIN;

const routes: FeatureRoute[] = [
  // ---- member
  page(() => import('./pages/member/MemberCourts'), M, 'MEMBER'),
  page(() => import('./pages/member/MemberStore'), `${M}/store`, 'MEMBER'),
  page(() => import('./pages/member/MemberKitchen'), `${M}/kitchen`, 'MEMBER'),
  page(() => import('./pages/member/MemberEvents'), `${M}/events`, 'MEMBER'),
  { path: `${M}/orders/:orderId`, layout: 'public', roles: ['MEMBER'], element: createElement(MemberOrderPage) },
  // ---- front desk
  page(() => import('./pages/desk/DeskCalendar'), F, 'FRONT_DESK'),
  page(() => import('./pages/desk/DeskBookings'), `${F}/bookings`, 'FRONT_DESK'),
  page(() => import('./pages/desk/DeskMembers'), `${F}/members`, 'FRONT_DESK'),
  page(() => import('./pages/desk/DeskPayments'), `${F}/payments`, 'FRONT_DESK'),
  // ---- kitchen manager
  page(() => import('./pages/kitchen/KitchenPos'), K, 'KITCHEN_MANAGER'),
  page(() => import('./pages/kitchen/KitchenOrders'), `${K}/orders`, 'KITCHEN_MANAGER'),
  page(() => import('./pages/kitchen/KitchenHistory'), `${K}/history`, 'KITCHEN_MANAGER'),
  page(() => import('./pages/kitchen/KitchenInvoices'), `${K}/invoices`, 'KITCHEN_MANAGER'),
  page(() => import('./pages/kitchen/KitchenStock'), `${K}/stock`, 'KITCHEN_MANAGER'),
  page(() => import('./pages/kitchen/KitchenProducts'), `${K}/products`, 'KITCHEN_MANAGER'),
  // ---- store manager
  page(() => import('./pages/owner/OwnerStore'), S, 'STORE_MANAGER'),
  // ---- owner / admin
  page(() => import('./pages/owner/OwnerOverview'), O, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerAnalytics'), `${O}/analytics`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerMembers'), `${O}/members`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerMemberships'), `${O}/memberships`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerBookings'), `${O}/bookings`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerStore'), `${O}/store`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerKitchen'), `${O}/kitchen`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerPayments'), `${O}/payments`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerStaff'), `${O}/staff`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerEvents'), `${O}/events`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerEnquiries'), `${O}/enquiries`, 'OWNER_ADMIN'),
  page(() => import('./pages/owner/OwnerReports'), `${O}/reports`, 'OWNER_ADMIN'),
];

export default routes;
