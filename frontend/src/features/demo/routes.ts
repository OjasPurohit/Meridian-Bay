import { createElement } from 'react';

import type { FeatureRoute } from '@/routing';
import DemoPage from './DemoPage';

// TEMPORARY (hackathon). Delete src/features/demo to remove the demo sign-in page.
const routes: FeatureRoute[] = [{ path: '/demo', layout: 'public', element: createElement(DemoPage) }];

export default routes;
