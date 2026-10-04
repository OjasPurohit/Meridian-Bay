// Who owns what. Used by gen-docs (API contract headers, DATABASE_SCHEMA owner column, TEAM_GUIDELINES table).
export const DEVS = {
  D1: { name: 'Dev 1', title: 'Platform, Identity & Public Experience', ui: 'Public website, login/signup, Member dashboard, enquiry inbox' },
  D2: { name: 'Dev 2', title: 'Membership, Courts & Front Desk', ui: 'Front Desk dashboard (member registration/search, bookings), member booking screens, court/plan admin screens' },
  D3: { name: 'Dev 3', title: 'Commerce, Cafe & Kitchen', ui: 'Shop pages (public + member + counter POS), Cafe order screen, Kitchen dashboard, stock & menu admin screens' },
  D4: { name: 'Dev 4', title: 'Owner, Finance & Reporting', ui: 'Owner dashboard, reports, finance, invoices/business-client portal, staff/HR/payroll/leave, settings, payments service' },
};

export const MODULE_OWNER = {
  auth: 'D1', public: 'D1', enquiries: 'D1',
  members: 'D2', memberships: 'D2', courts: 'D2', bookings: 'D2', events: 'D4',
  shop: 'D3', inventory: 'D3', bar: 'D3', kitchen: 'D3',
  clients: 'D4', invoices: 'D4', payments: 'D4', staff: 'D4', reports: 'D4', settings: 'D4',
};

export const MODULE_TITLE = {
  auth: 'Authentication', public: 'Public website', members: 'Members', memberships: 'Membership plans & memberships', courts: 'Courts & availability',
  bookings: 'Court bookings', events: 'Events', shop: 'Shop', inventory: 'Inventory', bar: 'Cafe', kitchen: 'Kitchen',
  enquiries: 'Enquiries', clients: 'Business clients', invoices: 'Invoices', payments: 'Payments', staff: 'Staff & HR', reports: 'Reports', settings: 'Club settings',
};

export const TABLE_OWNER = {
  users: 'D1', enquiries: 'D1',
  members: 'D2', membership_plans: 'D2', memberships: 'D2', courts: 'D2', court_bookings: 'D2',
  products: 'D3', shop_orders: 'D3', shop_order_items: 'D3', bar_menu_items: 'D3', bar_orders: 'D3', bar_order_items: 'D3',
  events: 'D4', event_registrations: 'D4', payments: 'D4', invoices: 'D4', invoice_items: 'D4', business_clients: 'D4', staff: 'D4', employee_applications: 'D4', staff_shifts: 'D4', leave_requests: 'D4', payroll_payments: 'D4', tax_inputs: 'D4', tax_periods: 'D4', club_settings: 'D4',
};

// One sentence per table: the real-world thing it represents (ADR-016). Shown in docs/database/DATABASE_SCHEMA.md.
export const TABLE_PURPOSE = {
  users: 'Login identity + role for every person (member, front desk, kitchen, store manager, owner). One table, one auth path; account on/off lives here (is_active).',
  members: 'Club profile of a user with role MEMBER (member code, date of birth, emergency contact). Gold/Silver/Junior is NOT stored here: see memberships.',
  staff: 'Employee record (designation, salary, hire date) for FRONT_DESK / KITCHEN_MANAGER / STORE_MANAGER / OWNER_ADMIN users.',
  employee_applications: 'Job applications: PENDING until the owner approves (creating users + staff) or rejects. Not an employee. The applicant bcrypt hash exists only while PENDING.',
  business_clients: 'Companies invoiced by the club (no login).',
  membership_plans: 'Gold / Silver / Junior definitions: price, discounts, plays per day, max age, benefits (all behaviour is data-driven).',
  memberships: 'One row per membership TERM: member + plan + start/end date + price paid. ACTIVE / EXPIRED is derived from the dates (views membership_terms, member_membership_status), never stored.',
  enquiries: 'Contact and trial requests from the website or the desk: a plain inbox (handled_at NULL = still waiting).',
  courts: 'Courts / nets with sport, surface and walk-in hourly rate.',
  court_bookings: 'The ONLY table holding court occupancy (regular bookings and maintenance blocks). cancelled_at NULL = the booking stands; the exclusion constraint prevents overlaps. Amounts and status are derived (view court_booking_totals).',
  products: 'Shop catalogue AND current stock (stock_quantity): one shelf for counter and online.',
  shop_orders: 'Counter (IN_STORE) and online (PICKUP / DELIVERY) shop orders. Totals and payment status are derived (view shop_order_totals).',
  shop_order_items: 'Shop order lines with price snapshots.',
  bar_menu_items: 'Cafe menu.',
  bar_orders: 'Cafe orders; also the kitchen queue (status NEW -> SERVED). table_label says where it is served; there are no tabs or table records. Totals and payment status are derived (view bar_order_totals).',
  bar_order_items: 'Cafe order lines with price snapshots.',
  payments: 'Revenue ledger: every rupee received (and refunded). Revenue category and refund status are derived (view payment_ledger). All finance reports aggregate this table.',
  invoices: 'Tax-exclusive invoices for business clients (and membership invoices to a member): lifecycle DRAFT / SENT / VOID. Totals and the paid / overdue state are derived (view invoice_totals).',
  invoice_items: 'Invoice lines.',
  events: 'Club events (tournament, clinic, camp, mixer, social) the owner creates; every role reads the same rows.',
  event_registrations: 'Which member registered for which event (one row per member and event; capacity is enforced from the count).',
  staff_shifts: 'Shift roster (same-day shifts).',
  leave_requests: 'Staff leave with approval workflow (who decided and when is stored on the row).',
  tax_inputs: 'Input tax the club paid on its own purchases (supplier, taxable amount, tax, eligibility): the only source of Input Tax Credit in the owner tax overview.',
  tax_periods: 'Calendar months the owner has marked as reported in the internal tax overview (a tracking flag, not a government filing).',
  payroll_payments: 'Monthly salary payments to employees (paid_on NULL = pending).',
  club_settings: 'Owner-editable policy values (hours, tax rates, delivery fee, cut-offs).',
};
