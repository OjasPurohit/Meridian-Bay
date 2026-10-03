// Who owns what. Used by gen-docs (API contract headers, DATABASE_SCHEMA owner column, TEAM_GUIDELINES table).
export const DEVS = {
  D1: { name: 'Dev 1', title: 'Platform, Identity & Public Experience', ui: 'Public website, login/signup, Member dashboard, notification bell, enquiry/CRM screens' },
  D2: { name: 'Dev 2', title: 'Membership, Courts & Front Desk', ui: 'Front Desk dashboard (member registration/search, bookings, social play), member booking screens, court/plan admin screens' },
  D3: { name: 'Dev 3', title: 'Commerce, Bar & Kitchen', ui: 'Shop pages (public + member + counter POS), Bar POS (tables/tabs/orders), Kitchen dashboard, inventory & menu admin screens' },
  D4: { name: 'Dev 4', title: 'Owner, Finance & Reporting', ui: 'Owner dashboard, reports, finance, invoices/business-client portal, staff/HR/payroll/leave, settings, payments service' },
};

export const MODULE_OWNER = {
  auth: 'D1', public: 'D1', notifications: 'D1', enquiries: 'D1',
  members: 'D2', memberships: 'D2', courts: 'D2', bookings: 'D2', social: 'D2',
  shop: 'D3', inventory: 'D3', bar: 'D3', kitchen: 'D3',
  clients: 'D4', invoices: 'D4', payments: 'D4', staff: 'D4', reports: 'D4', settings: 'D4',
};

export const MODULE_TITLE = {
  auth: 'Authentication', public: 'Public website', members: 'Members', memberships: 'Membership plans & memberships', courts: 'Courts & availability',
  bookings: 'Court bookings', social: 'Social play', shop: 'Shop', inventory: 'Inventory', bar: 'Bar / POS', kitchen: 'Kitchen',
  enquiries: 'Enquiries & CRM', clients: 'Business clients', invoices: 'Invoices', payments: 'Payments', staff: 'Staff & HR', reports: 'Reports', notifications: 'Notifications', settings: 'Club settings',
};

export const TABLE_OWNER = {
  users: 'D1', notifications: 'D1', enquiries: 'D1', enquiry_follow_ups: 'D1', quotes: 'D1',
  members: 'D2', membership_plans: 'D2', memberships: 'D2', courts: 'D2', court_bookings: 'D2', social_sessions: 'D2', social_session_participants: 'D2',
  products: 'D3', shop_orders: 'D3', shop_order_items: 'D3', inventory_movements: 'D3', bar_menu_items: 'D3', bar_tables: 'D3', bar_tabs: 'D3', bar_orders: 'D3', bar_order_items: 'D3', order_status_events: 'D3',
  payments: 'D4', invoices: 'D4', invoice_items: 'D4', business_clients: 'D4', staff: 'D4', staff_shifts: 'D4', leave_requests: 'D4', payroll_payments: 'D4', club_settings: 'D4',
};

export const TABLE_PURPOSE = {
  users: 'Login identity + role for every person (member, staff, kitchen, business client, owner). One table, one auth path.',
  members: 'Club profile of a user with role MEMBER. Gold/Silver/Junior is NOT stored here — see memberships.',
  staff: 'Employee record for FRONT_DESK / KITCHEN_MANAGER / OWNER_ADMIN users.',
  business_clients: 'Companies invoiced by the club; optional portal login via user_id.',
  membership_plans: 'Gold / Silver / Junior definitions: price, discounts, plays per day, age limits, benefits (all behaviour is data-driven).',
  memberships: 'One row per membership TERM. A purchase, renewal or plan change adds a row => this table is the membership history.',
  enquiries: 'Leads from the website, phone or walk-ins (incl. trial requests).',
  enquiry_follow_ups: 'Log of every contact attempt on an enquiry.',
  quotes: 'Price quotes sent against an enquiry.',
  courts: 'Courts / nets with sport, surface and walk-in hourly rate.',
  court_bookings: 'The ONLY table holding court occupancy (regular, trial, social-session hold, maintenance). Exclusion constraint prevents overlaps.',
  social_sessions: 'Friday social-play sessions; each owns one SOCIAL_SESSION booking that holds the court.',
  social_session_participants: 'People (members or guests) in a social session.',
  products: 'Shop catalogue AND current stock (stock_quantity) — one shelf for counter and online.',
  shop_orders: 'Counter (PHYSICAL) and website (ONLINE) shop orders; pickup / delivery / in-store.',
  shop_order_items: 'Order lines with price snapshots.',
  inventory_movements: 'Immutable stock ledger; SUM(quantity_change) = products.stock_quantity.',
  bar_menu_items: 'Bar & cafeteria menu.',
  bar_tables: 'Physical tables and their live status.',
  bar_tabs: 'Open / settled tabs for members and guests.',
  bar_orders: 'Bar/cafeteria orders; also the kitchen queue (status NEW -> SERVED).',
  bar_order_items: 'Bar order lines with price snapshots.',
  order_status_events: 'Audit trail of kitchen status changes.',
  payments: 'Revenue ledger: every rupee received (and refunded). All finance reports aggregate this table.',
  invoices: 'Tax-exclusive invoices for business clients and membership invoices.',
  invoice_items: 'Invoice lines.',
  staff_shifts: 'Shift roster (same-day shifts).',
  leave_requests: 'Staff leave with approval workflow.',
  payroll_payments: 'Monthly salary payments to employees.',
  notifications: 'In-app notifications per user.',
  club_settings: 'Owner-editable policy values (hours, tax rates, delivery fee, cut-offs, social-play window).',
};
