import { createElement } from 'react';

import type { FeatureRoute } from '@/routing';
import HomePage from './pages/HomePage';
import AccountPreviewPage from './pages/AccountPreviewPage';

const routes: FeatureRoute[] = [
  { path: '/', layout: 'public', element: createElement(HomePage) },
  { path: '/login', layout: 'public', element: createElement(AccountPreviewPage) },
  { path: '/signup', layout: 'public', element: createElement(AccountPreviewPage) },
];

export default routes;
