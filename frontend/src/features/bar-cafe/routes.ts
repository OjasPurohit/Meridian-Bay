import { createElement } from 'react';

import type { FeatureRoute } from '@/routing';
import BarCafePage from './pages/BarCafePage';

const routes: FeatureRoute[] = [{ path: '/bar-cafe', layout: 'public', element: createElement(BarCafePage) }];

export default routes;
