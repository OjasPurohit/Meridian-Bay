import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import PublicLayout from '@/layouts/PublicLayout';
import { featureRoutes } from '@/routing';

const router = createBrowserRouter([
  {
    element: <PublicLayout />,
    children: featureRoutes.filter((r) => r.layout === 'public').map(({ path, element }) => ({ path, element })),
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
