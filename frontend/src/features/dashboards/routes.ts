import { createElement } from 'react';
import { ROLE_HOME_ROUTE } from '@shared/constants/rules';

import type { FeatureRoute } from '@/routing';
import BusinessDashboard from './pages/BusinessDashboard';
import FrontDeskDashboard from './pages/FrontDeskDashboard';
import KitchenDashboard from './pages/KitchenDashboard';
import MemberDashboard from './pages/MemberDashboard';
import MemberOrderPage from './pages/MemberOrderPage';
import OwnerDashboard from './pages/OwnerDashboard';

const routes: FeatureRoute[] = [
  { path: ROLE_HOME_ROUTE.MEMBER, layout: 'public', roles: ['MEMBER'], element: createElement(MemberDashboard) },
  { path: `${ROLE_HOME_ROUTE.MEMBER}/orders/:orderId`, layout: 'public', roles: ['MEMBER'], element: createElement(MemberOrderPage) },
  { path: ROLE_HOME_ROUTE.OWNER_ADMIN, layout: 'public', roles: ['OWNER_ADMIN'], element: createElement(OwnerDashboard) },
  { path: ROLE_HOME_ROUTE.FRONT_DESK, layout: 'public', roles: ['FRONT_DESK'], element: createElement(FrontDeskDashboard) },
  { path: ROLE_HOME_ROUTE.BUSINESS_CLIENT, layout: 'public', roles: ['BUSINESS_CLIENT'], element: createElement(BusinessDashboard) },
  { path: ROLE_HOME_ROUTE.KITCHEN_MANAGER, layout: 'public', roles: ['KITCHEN_MANAGER'], element: createElement(KitchenDashboard) },
];

export default routes;
