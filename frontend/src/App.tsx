import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import PublicLayout from '@/layouts/PublicLayout';
import DashboardLayout from '@/features/dashboards/layout/DashboardLayout';
import { featureRoutes } from '@/routing';

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: featureRoutes.filter((r) => r.layout === 'public').map(({ path, element }) => ({ path, element })),
  },
  {
    element: <DashboardLayout />,
    children: featureRoutes.filter((r) => r.layout === 'dashboard').map(({ path, element }) => ({ path, element })),
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
