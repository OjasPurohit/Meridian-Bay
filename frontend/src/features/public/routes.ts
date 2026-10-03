import { createElement } from 'react';

import type { FeatureRoute } from '@/routing';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

const routes: FeatureRoute[] = [
  { path: '/', layout: 'public', element: createElement(HomePage) },
  { path: '/login', layout: 'public', element: createElement(LoginPage) },
  { path: '/signup', layout: 'public', element: createElement(RegisterPage) },
];

export default routes;
