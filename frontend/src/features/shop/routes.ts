import { createElement } from 'react';

import type { FeatureRoute } from '@/routing';
import ShopPage from './pages/ShopPage';

const routes: FeatureRoute[] = [{ path: '/shop', layout: 'public', element: createElement(ShopPage) }];

export default routes;
