import type { UserRole } from '@shared/constants/enums';
import { ROLE_HOME_ROUTE } from '@shared/constants/rules';

export interface RoleInfo {
  role: UserRole;
  label: string;
  /** Who this account is for. */
  summary: string;
  /** Members sign themselves up; employees apply and the owner approves (FR-AUTH-008); the owner account is never self-service. */
  selfService: boolean;
  home: string;
}

export const ROLES: RoleInfo[] = [
  { role: 'MEMBER', label: 'Member', summary: 'Book courts, join social play, order gear and see your plan.', selfService: true, home: ROLE_HOME_ROUTE.MEMBER },
  { role: 'OWNER_ADMIN', label: 'Admin / Owner', summary: 'The club owner: reports, finance, staff and settings.', selfService: false, home: ROLE_HOME_ROUTE.OWNER_ADMIN },
  { role: 'FRONT_DESK', label: 'Front desk', summary: 'Court bookings, walk-ins, the counter and bar tabs.', selfService: false, home: ROLE_HOME_ROUTE.FRONT_DESK },
  { role: 'KITCHEN_MANAGER', label: 'Kitchen', summary: 'The live kitchen board for bar & café orders.', selfService: false, home: ROLE_HOME_ROUTE.KITCHEN_MANAGER },
  { role: 'STORE_MANAGER', label: 'Store manager', summary: 'Products, stock and shop orders.', selfService: false, home: ROLE_HOME_ROUTE.STORE_MANAGER },
];

export const roleInfo = (role: UserRole) => ROLES.find((r) => r.role === role)!;
