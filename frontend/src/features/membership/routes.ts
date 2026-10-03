import { createElement } from 'react';

import type { FeatureRoute } from '@/routing';
import MembershipPage from './pages/MembershipPage';
import ApplyPage from './pages/ApplyPage';

const routes: FeatureRoute[] = [
  { path: '/membership', layout: 'public', element: createElement(MembershipPage) },
  { path: '/membership/apply', layout: 'public', element: createElement(ApplyPage) },
];

export default routes;
