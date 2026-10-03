import type { ReactElement } from 'react';
import type { UserRole } from '@shared/constants/enums';

export interface FeatureRoute {
  path: string;
  /** Which layout wraps the page: the public site, or the sidebar layout shared by every role dashboard. */
  layout: 'public' | 'dashboard';
  element: ReactElement;
  /** Roles allowed to see the page (UX only — the API enforces permissions). Omit for public pages. */
  roles?: UserRole[];
  nav?: { label: string };
}

const modules = import.meta.glob<{ default: FeatureRoute[] }>('./features/*/routes.ts', { eager: true });

/** Every features/<module>/routes.ts, auto-discovered so feature owners never edit App.tsx. */
export const featureRoutes: FeatureRoute[] = Object.values(modules).flatMap((m) => m.default);
