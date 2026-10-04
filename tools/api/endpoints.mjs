// SINGLE SOURCE OF TRUTH for the HTTP API. Everything else is generated from this file by tools/gen-docs.mjs:
//   docs/api/API_CONTRACT.md, docs/api/openapi.yaml, shared/types/requests.generated.ts,
//   docs/security/PERMISSIONS_MATRIX.md, docs/requirements/TRACEABILITY_MATRIX.md
// To change the API: edit THIS file -> `npm run docs:build` -> commit all regenerated files together (see TEAM_GUIDELINES.md).
//
// Field DSL:  f(name, type, required, rule)
//   types: uuid string text int number money percent bool date datetime time email phone url
//          enum:ENUM_NAME   (from shared/constants/enums.ts)   array:<type>   object[] (needs `of`)
// Roles: M=MEMBER F=FRONT_DESK K=KITCHEN_MANAGER S=STORE_MANAGER O=OWNER_ADMIN, PUB=no auth.  A trailing `:own` limits the role to its own records.
//
// Scope note (ADR-016): the club has no social play, no bar tabs / table management, no CRM pipeline (quotes, follow-ups, funnel),
// no in-app notifications and no stock ledger. Derived values (payment status, totals, membership status, invoice paid / overdue ...)
// are returned by the API but computed by SQL views, never stored (ADR-015, ADR-016).

export const PUB = 'PUBLIC';
const M = 'MEMBER', F = 'FRONT_DESK', K = 'KITCHEN_MANAGER', S = 'STORE_MANAGER', O = 'OWNER_ADMIN';
const Mo = 'MEMBER:own', Fo = 'FRONT_DESK:own', Ko = 'KITCHEN_MANAGER:own', So = 'STORE_MANAGER:own';
const ANY = [M, F, K, S, O];

const f = (name, type, required = false, rule = '', of = null) => ({ name, type, required: !!required, rule, of });
const memberRef = f('member_id', 'uuid', false, 'Staff only: book/order on behalf of this member. MEMBER callers: omit (implied = self).');
const guestName = f('guest_name', 'string', false, 'Walk-in name. Staff only. Required when no member_id.');
const guestPhone = f('guest_phone', 'string', false, 'Walk-in phone (E.164 or 10-digit). Staff only.');
const method = (req, rule = '') => f('payment_method', 'enum:PAYMENT_METHOD', req, rule);
const from = f('from', 'date', true, 'Inclusive IST business date.');
const to = f('to', 'date', true, 'Inclusive IST business date; to >= from; max 366 days.');

// ep(id, METHOD, path, roles, feature, action, summary, opts)
//   action: V view | C create | U update | D delete | A approve
//   opts: { reqs, query, body, res, status, errors, rules, tables, scope, guest }
export const endpoints = [];
const ep = (id, method, path, roles, feature, action, summary, o = {}) =>
  endpoints.push({ id, module: id.split('.')[0], method, path, roles: Array.isArray(roles) ? roles : [roles], feature, action, summary, reqs: [], query: [], body: [], res: 'void', status: method === 'POST' && action === 'C' ? 201 : 200, errors: [], rules: '', tables: [], scope: '', guest: false, ...o });

// =================================================================================== AUTH
ep('auth.signup', 'POST', '/auth/signup', PUB, 'Authentication', 'C', 'Visitor joins as a member: account + the chosen membership, paid online, in one step; the member is logged in.', {
  reqs: ['FR-AUTH-001', 'FR-MEM-012'], res: 'AuthSession', tables: ['users', 'members', 'memberships', 'payments'], errors: ['EMAIL_TAKEN', 'APPLICATION_PENDING', 'MEMBERSHIP_PLAN_NOT_FOUND', 'JUNIOR_AGE_INVALID', 'PAYMENT_FAILED'],
  body: [f('full_name', 'string', 1, '2-120 chars'), f('email', 'email', 1, 'unique (case-insensitive)'), f('phone', 'phone', 1), f('password', 'string', 1, 'min 8 chars, >=1 letter and >=1 digit'), f('date_of_birth', 'date', 0, 'must be in the past; REQUIRED for a JUNIOR plan'), f('address', 'text'), f('membership_plan_id', 'uuid', 0, 'the plan to buy now (paid ONLINE through the mock gateway). Omit to join without a plan.')],
  rules: 'Creates `users` (role MEMBER) + `members` (+ `memberships` + `payments` when a plan is given) in ONE transaction: if the payment fails nothing is created. The password is stored only as a bcrypt hash.' });
ep('auth.login', 'POST', '/auth/login', PUB, 'Authentication', 'C', 'Authenticate and receive a JWT plus the role-based landing route, or the EMPLOYEE_APPLICATION_PENDING state.', {
  reqs: ['FR-AUTH-002', 'FR-AUTH-003', 'FR-AUTH-008'], res: 'AuthSession', status: 200, tables: ['users', 'employee_applications'], errors: ['AUTH_INVALID', 'ACCOUNT_DISABLED'],
  body: [f('email', 'email', 1), f('password', 'string', 1)],
  rules: '`redirect_to` = ROLE_HOME_ROUTE[user.role]. Active users are checked first. If there is no such user but a PENDING job application for the email whose bcrypt hash matches, the answer is `{state: EMPLOYEE_APPLICATION_PENDING, redirect_to: /employee-application-pending}`: NO token, NO role. Never reveal whether the email exists (always AUTH_INVALID).' });
ep('auth.logout', 'POST', '/auth/logout', ANY, 'Authentication', 'U', 'End the session (stateless JWT: the client discards the token).', { reqs: ['FR-AUTH-004'], res: 'void' });
ep('auth.me', 'GET', '/auth/me', ANY, 'Authentication', 'V', 'Current user + role profile + landing route. Re-issues a fresh token.', { reqs: ['FR-AUTH-002'], res: 'AuthSession', tables: ['users', 'members', 'staff'] });
ep('auth.changePassword', 'POST', '/auth/change-password', ANY, 'Authentication', 'U', 'Change own password (clears must_change_password).', {
  reqs: ['FR-AUTH-006'], tables: ['users'], errors: ['AUTH_INVALID'],
  body: [f('current_password', 'string', 1), f('new_password', 'string', 1, 'min 8 chars, >=1 letter and >=1 digit')] });

// =================================================================================== PUBLIC
ep('public.club', 'GET', '/public/club', PUB, 'Public website', 'V', 'Club introduction, timings, contact and sports offered.', {
  reqs: ['FR-PUB-001', 'FR-PUB-007'], res: 'PublicClubInfo', tables: ['club_settings', 'courts'],
  rules: 'Built from club_settings where is_public = true plus distinct sport_type of active courts.' });

// =================================================================================== MEMBERS
ep('members.list', 'GET', '/members', [F, O], 'Members', 'V', 'Search and filter members.', {
  reqs: ['FR-MEM-002', 'FR-MEM-006'], res: 'Page<MemberSummary>', tables: ['members', 'users', 'memberships', 'membership_plans'], guest: false,
  query: [f('q', 'string', 0, 'matches full_name, phone, email, member_code (case-insensitive contains)'), f('membership_type', 'enum:MEMBERSHIP_TYPE'), f('membership_status', 'enum:MEMBERSHIP_STATUS'), f('no_plan', 'bool', 0, 'true = members with no current membership'), f('expiring_within_days', 'int', 0, '>=0') ] });
ep('members.create', 'POST', '/members', [F, O], 'Members', 'C', 'Register a new member at the front desk (optionally buying a plan immediately).', {
  reqs: ['FR-MEM-001', 'FR-MEM-012'], res: 'MemberDetail', tables: ['users', 'members', 'memberships', 'payments'], errors: ['EMAIL_TAKEN', 'MEMBERSHIP_PLAN_NOT_FOUND', 'JUNIOR_AGE_INVALID', 'PAYMENT_FAILED'],
  body: [f('full_name', 'string', 1), f('email', 'email', 1), f('phone', 'phone', 1), f('date_of_birth', 'date', 0, 'REQUIRED when membership_plan_id is a JUNIOR plan'), f('address', 'text'), f('emergency_contact_name', 'string'), f('emergency_contact_phone', 'phone'),
    f('initial_password', 'string', 0, 'if omitted the server generates one; account gets must_change_password = true'), f('membership_plan_id', 'uuid', 0, 'buy this plan now'), method(0, 'REQUIRED when membership_plan_id is given')],
  rules: 'One transaction: users + members (+ memberships + payments when a plan is bought).' });
ep('members.me', 'GET', '/members/me', M, 'Members', 'V', 'Own member profile, active plan, benefits and plays used today.', { reqs: ['FR-MEM-003', 'FR-MEM-005'], res: 'MemberDetail', tables: ['members', 'memberships', 'membership_plans'], errors: ['MEMBER_NOT_FOUND'] });
ep('members.get', 'GET', '/members/:id', [Mo, F, O], 'Members', 'V', 'Member profile (staff can look up anyone; a member only themselves).', { reqs: ['FR-MEM-003', 'FR-MEM-005'], res: 'MemberDetail', tables: ['members', 'memberships'], errors: ['MEMBER_NOT_FOUND'] });
ep('members.update', 'PATCH', '/members/:id', [Mo, F, O], 'Members', 'U', 'Update profile fields.', {
  reqs: ['FR-MEM-013', 'FR-MEM-003'], res: 'MemberDetail', tables: ['members', 'users'], errors: ['MEMBER_NOT_FOUND'],
  body: [f('full_name', 'string'), f('phone', 'phone'), f('date_of_birth', 'date'), f('address', 'text'), f('emergency_contact_name', 'string'), f('emergency_contact_phone', 'phone'), f('photo_url', 'url'), f('is_active', 'bool', 0, 'OWNER_ADMIN only')] });
ep('members.history', 'GET', '/members/:id/history', [Mo, F, O], 'Members', 'V', 'Unified timeline of everything the member did at the club (memberships, bookings, shop, cafe, payments).', {
  reqs: ['FR-MEM-004'], res: 'Page<MemberHistoryEvent>', tables: ['memberships', 'court_bookings', 'shop_orders', 'bar_orders', 'payments'], errors: ['MEMBER_NOT_FOUND'],
  query: [f('event_type', 'enum:HISTORY_EVENT_TYPE'), f('from', 'date'), f('to', 'date')] , rules: 'Newest first. Assembled server-side (UNION of the listed tables).' });
ep('members.memberships', 'GET', '/members/:id/memberships', [Mo, F, O], 'Members', 'V', 'All membership terms of a member (plan changes, renewals, expiries).', { reqs: ['FR-MEM-004', 'FR-MEM-005'], res: 'MembershipView[]', tables: ['memberships', 'membership_plans'], errors: ['MEMBER_NOT_FOUND'] });

// =================================================================================== MEMBERSHIPS
ep('memberships.plans', 'GET', '/memberships/plans', PUB, 'Membership plans', 'V', 'Gold / Silver / Junior plans with price, benefits and discounts.', {
  reqs: ['FR-PUB-002', 'FR-MEM-011'], res: 'MembershipPlan[]', tables: ['membership_plans'], query: [f('include_inactive', 'bool', 0, 'OWNER_ADMIN only')] });
ep('memberships.planCreate', 'POST', '/memberships/plans', O, 'Membership plans', 'C', 'Create a plan.', {
  reqs: ['FR-MEM-011'], res: 'MembershipPlan', tables: ['membership_plans'],
  body: [f('membership_type', 'enum:MEMBERSHIP_TYPE', 1), f('name', 'string', 1), f('description', 'text'), f('duration_months', 'int', 1, '>0'), f('price', 'money', 1), f('court_discount_percent', 'percent', 0, '0-100; 100 = free courts'), f('shop_discount_percent', 'percent'), f('bar_discount_percent', 'percent'), f('max_plays_per_day', 'int', 0, 'default 2'), f('max_age', 'int', 0, 'Junior: 17'), f('benefits', 'array:string'), f('sort_order', 'int')],
  rules: 'UNIQUE (membership_type, duration_months). Violations return VALIDATION_ERROR.' });
ep('memberships.planUpdate', 'PATCH', '/memberships/plans/:id', O, 'Membership plans', 'U', 'Edit a plan. Existing memberships keep their snapshot (prices are copied to bookings/orders at transaction time).', {
  reqs: ['FR-MEM-011'], res: 'MembershipPlan', tables: ['membership_plans'], errors: ['MEMBERSHIP_PLAN_NOT_FOUND'],
  body: [f('name', 'string'), f('description', 'text'), f('price', 'money'), f('court_discount_percent', 'percent'), f('shop_discount_percent', 'percent'), f('bar_discount_percent', 'percent'), f('max_plays_per_day', 'int'), f('benefits', 'array:string'), f('sort_order', 'int'), f('is_active', 'bool')] });
ep('memberships.purchase', 'POST', '/memberships', [Mo, F, O], 'Memberships', 'C', 'Buy or renew a membership. Records the payment.', {
  reqs: ['FR-MEM-007', 'FR-MEM-012', 'FR-FIN-001'], res: 'MembershipPurchaseResult', tables: ['memberships', 'payments'], guest: false,
  errors: ['MEMBER_NOT_FOUND', 'MEMBERSHIP_PLAN_NOT_FOUND', 'MEMBERSHIP_ALREADY_ACTIVE', 'JUNIOR_AGE_INVALID', 'PAYMENT_FAILED'],
  body: [f('member_id', 'uuid', 0, 'Staff only; MEMBER callers: implied = self'), f('membership_plan_id', 'uuid', 1), method(1, 'MEMBER callers must use ONLINE'), f('gateway_reference', 'string')],
  rules: 'No current term: new membership starting today (derived status ACTIVE). Current term ends within `membership_expiry_warning_days`: new term starts the day after the current end_date (derived status UPCOMING until then). Otherwise MEMBERSHIP_ALREADY_ACTIVE (the DB rejects overlapping live terms: memberships_no_overlap). end_date = start_date + duration_months - 1 day. A membership is only member + plan + start/end date + price_paid: its status is derived from the dates (view membership_terms), never stored.' });
ep('memberships.changePlan', 'POST', '/memberships/:id/change-plan', [F, O], 'Memberships', 'U', 'Upgrade / downgrade: closes the current term and starts a new one on the new plan.', {
  reqs: ['FR-MEM-008', 'FR-MEM-012', 'FR-FIN-001'], res: 'MembershipPurchaseResult', tables: ['memberships', 'payments'], guest: false,
  errors: ['MEMBERSHIP_NOT_FOUND', 'MEMBERSHIP_PLAN_NOT_FOUND', 'MEMBERSHIP_EXPIRED', 'JUNIOR_AGE_INVALID', 'INVALID_STATUS_TRANSITION', 'PAYMENT_FAILED'],
  body: [f('new_membership_plan_id', 'uuid', 1), method(1)],
  rules: 'Only an ACTIVE term can be changed (an EXPIRED one => MEMBERSHIP_EXPIRED: buy a new membership instead). Old row: end_date = yesterday (it simply ends; its derived status becomes EXPIRED). New row: start_date = today (derived status ACTIVE), full new-plan price charged (no pro-rata; see ASSUMPTIONS A-07). Future bookings keep their already-snapshotted price.' });
ep('memberships.cancel', 'POST', '/memberships/:id/cancel', O, 'Memberships', 'U', 'Cancel a membership (no automatic refund).', { reqs: ['FR-MEM-009'], res: 'MembershipView', tables: ['memberships'], errors: ['MEMBERSHIP_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('reason', 'text', 1)], rules: 'Sets cancelled_at and cancellation_reason (derived status CANCELLED); benefits stop immediately.' });
ep('memberships.expiring', 'GET', '/memberships/expiring', [F, O], 'Memberships', 'V', 'Members whose current term ends soon (default window = membership_expiry_warning_days).', {
  reqs: ['FR-MEM-006', 'FR-MEM-005'], res: 'MemberSummary[]', tables: ['memberships', 'members'], query: [f('days', 'int', 0, '1-365')] });

// =================================================================================== COURTS
ep('courts.list', 'GET', '/courts', PUB, 'Courts', 'V', 'Court catalogue.', { reqs: ['FR-COURT-001', 'FR-PUB-003'], res: 'Court[]', tables: ['courts'], query: [f('sport_type', 'enum:SPORT_TYPE'), f('include_inactive', 'bool', 0, 'staff only')] });
ep('courts.availability', 'GET', '/courts/availability', PUB, 'Courts', 'V', 'Slot grid per court for one day: a slot every 30 min, each a 1-hour session.', {
  reqs: ['FR-COURT-002', 'FR-COURT-003', 'FR-PUB-003'], res: 'CourtAvailability[]', tables: ['courts', 'court_bookings'], errors: ['COURT_NOT_FOUND'],
  query: [f('date', 'date', 1, 'today .. today+60d (IST)'), f('sport_type', 'enum:SPORT_TYPE'), f('court_id', 'uuid')],
  rules: 'Slots: first start = club_open_time, last start = club_close_time - 1h, step 30 min. Status PAST for starts before now. `booking_id` only for FRONT_DESK/OWNER_ADMIN; never expose who booked.' });
ep('courts.create', 'POST', '/courts', O, 'Courts', 'C', 'Add a court.', { reqs: ['FR-COURT-015'], res: 'Court', tables: ['courts'], errors: ['COURT_NAME_TAKEN'], body: [f('name', 'string', 1, 'unique'), f('sport_type', 'enum:SPORT_TYPE', 1), f('description', 'text'), f('surface', 'string'), f('walk_in_rate_per_hour', 'money', 1), f('image_url', 'url'), f('sort_order', 'int')] });
ep('courts.update', 'PATCH', '/courts/:id', O, 'Courts', 'U', 'Edit court / change rate / deactivate.', { reqs: ['FR-COURT-015'], res: 'Court', tables: ['courts'], errors: ['COURT_NOT_FOUND', 'COURT_NAME_TAKEN'], body: [f('name', 'string'), f('description', 'text'), f('surface', 'string'), f('walk_in_rate_per_hour', 'money'), f('image_url', 'url'), f('sort_order', 'int'), f('is_active', 'bool')] });
ep('courts.block', 'POST', '/courts/:id/blocks', O, 'Courts', 'C', 'Block a court for maintenance (creates 1-hour MAINTENANCE bookings covering the range).', {
  reqs: ['FR-COURT-013'], res: 'BookingDetail[]', tables: ['court_bookings'], errors: ['COURT_NOT_FOUND', 'BOOKING_CONFLICT', 'INVALID_SLOT'],
  body: [f('start_at', 'datetime', 1, 'on a 30-min boundary'), f('end_at', 'datetime', 1, 'multiple of 1h after start_at')], rules: 'Fails with BOOKING_CONFLICT (and creates nothing) if any hour overlaps a booking that stands.' });
ep('courts.unblock', 'DELETE', '/courts/blocks/:booking_id', O, 'Courts', 'D', 'Remove a maintenance block (sets cancelled_at on the MAINTENANCE booking).', { reqs: ['FR-COURT-013'], res: 'BookingDetail', tables: ['court_bookings'], errors: ['BOOKING_NOT_FOUND'] });

// =================================================================================== BOOKINGS
ep('bookings.price', 'GET', '/bookings/price', [M, F, O], 'Court bookings', 'V', 'Price preview before confirming (applies the member plan discount and shows plays used today).', {
  reqs: ['FR-COURT-012', 'FR-COURT-007'], res: 'PriceBreakdown', tables: ['courts', 'memberships', 'membership_plans'], errors: ['COURT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INVALID_SLOT'], guest: true,
  query: [f('court_id', 'uuid', 1), f('start_at', 'datetime', 1), f('member_id', 'uuid', 0, 'staff only; omit for walk-in pricing')] });
ep('bookings.create', 'POST', '/bookings', [M, F, O], 'Court bookings', 'C', 'Book a court (member self-service, or staff for a member / walk-in / phone caller).', {
  reqs: ['FR-COURT-004', 'FR-COURT-005', 'FR-COURT-006', 'FR-COURT-007', 'FR-COURT-008', 'FR-COURT-009', 'FR-COURT-003'], res: 'BookingDetail', tables: ['court_bookings', 'payments'], guest: true,
  errors: ['COURT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INVALID_SLOT', 'COURT_UNAVAILABLE', 'BOOKING_CONFLICT', 'DAILY_BOOKING_LIMIT', 'PAYMENT_FAILED'],
  body: [f('court_id', 'uuid', 1), f('start_at', 'datetime', 1, 'on a :00/:30 boundary, in the future, session must end by club_close_time'), memberRef, guestName, guestPhone, method(0, 'omit = pay later at the desk (payment_status PENDING). MEMBER callers pay ONLINE or later at desk.')],
  rules: 'Transaction: lock member (advisory) -> check plays-per-day (REGULAR bookings that stand, IST day, max = plan.max_plays_per_day, default 2) -> compute price -> INSERT (DB exclusion constraint `court_bookings_no_overlap` is the final arbiter; map SQLSTATE 23P01 to BOOKING_CONFLICT) -> optional payment. list_price and discount_amount are stored (snapshot); the amount due and payment_status are derived (view court_booking_totals). Expired/no membership => walk-in price. Free (amount due 0) => payment_status NOT_REQUIRED.' });
ep('bookings.trial', 'POST', '/bookings/trial', PUB, 'Court bookings', 'C', 'A visitor books a free trial hour from the public website: the first free active court of the chosen sport takes the slot.', {
  reqs: ['FR-PUB-006', 'FR-COURT-004'], res: 'BookingDetail', tables: ['court_bookings'], guest: true,
  errors: ['INVALID_SLOT', 'COURT_UNAVAILABLE', 'BOOKING_CONFLICT', 'TRIAL_ALREADY_BOOKED'],
  body: [f('name', 'string', 1), f('phone', 'phone', 1), f('email', 'email'), f('sport_type', 'enum:SPORT_TYPE', 1), f('start_at', 'datetime', 1, 'on a :00/:30 boundary, in the future, inside opening hours')],
  rules: 'Transaction: lock the phone number (advisory) -> at most one upcoming TRIAL per phone (TRIAL_ALREADY_BOOKED) -> pick the first active court of the sport (by name) with no standing booking in the slot, else BOOKING_CONFLICT -> INSERT booking_type TRIAL (list_price 0, so amount due is 0 and nothing is paid). The same table, calendar and exclusion constraint as every other court booking; owner and front desk see it in their calendars.' });
ep('bookings.list', 'GET', '/bookings', [Mo, F, O], 'Court bookings', 'V', 'List bookings (day view for the desk, own bookings for a member).', {
  reqs: ['FR-COURT-011', 'FR-COURT-016'], res: 'Page<BookingDetail>', tables: ['court_bookings', 'courts', 'members'], guest: true,
  query: [f('from', 'date'), f('to', 'date'), f('court_id', 'uuid'), f('member_id', 'uuid', 0, 'staff only'), f('status', 'enum:BOOKING_STATUS'), f('booking_type', 'enum:BOOKING_TYPE'), f('upcoming', 'bool', 0, 'true = start_at >= now')] });
ep('bookings.get', 'GET', '/bookings/:id', [Mo, F, O], 'Court bookings', 'V', 'Booking detail.', { reqs: ['FR-COURT-011', 'FR-COURT-016'], res: 'BookingDetail', tables: ['court_bookings'], errors: ['BOOKING_NOT_FOUND'] });
ep('bookings.cancel', 'POST', '/bookings/:id/cancel', [Mo, F, O], 'Court bookings', 'U', 'Cancel a booking before it starts; frees the slot and refunds per policy.', {
  reqs: ['FR-COURT-010'], res: 'BookingCancelResult', tables: ['court_bookings', 'payments'], guest: true, errors: ['BOOKING_NOT_FOUND', 'BOOKING_NOT_CANCELLABLE', 'INVALID_STATUS_TRANSITION'],
  body: [f('refund', 'bool', 0, 'staff only: override policy (default: refund if start_at - now >= cancellation_cutoff_hours)')],
  rules: 'Only a booking that stands and starts in the future. Sets cancelled_at (derived status CANCELLED). Member callers: own bookings only, and policy decides the refund. A refund is recorded on the payment (refunded_amount, refunded_at); the booking then reports payment_status REFUNDED.' });

// =================================================================================== SHOP
ep('shop.products', 'GET', '/shop/products', PUB, 'Shop catalogue', 'V', 'Browse products (stock_status for everyone; exact quantities for staff).', {
  reqs: ['FR-SHOP-001', 'FR-PUB-004', 'FR-SHOP-008'], res: 'Page<ProductView>', tables: ['products'],
  query: [f('category', 'enum:PRODUCT_CATEGORY'), f('q', 'string'), f('in_stock', 'bool'), f('include_inactive', 'bool', 0, 'OWNER_ADMIN only')], rules: '`member_price` is included when the caller is a MEMBER with a current plan.' });
ep('shop.product', 'GET', '/shop/products/:id', PUB, 'Shop catalogue', 'V', 'Product detail.', { reqs: ['FR-SHOP-001'], res: 'ProductView', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'] });
ep('shop.productCreate', 'POST', '/shop/products', [S, O], 'Shop catalogue', 'C', 'Create a product (optionally with opening stock).', {
  reqs: ['FR-SHOP-002', 'FR-INV-003'], res: 'ProductView', tables: ['products'], errors: ['SKU_TAKEN'],
  body: [f('sku', 'string', 1, 'unique'), f('name', 'string', 1), f('category', 'enum:PRODUCT_CATEGORY', 1), f('brand', 'string'), f('description', 'text'), f('price', 'money', 1, 'tax-inclusive'), f('image_url', 'url'), f('initial_stock', 'int', 0, '>=0; the starting stock_quantity'), f('low_stock_threshold', 'int', 0, 'default = setting low_stock_default_threshold')] });
ep('shop.productUpdate', 'PATCH', '/shop/products/:id', [S, O], 'Shop catalogue', 'U', 'Edit a product. Stock is NEVER edited here: use /inventory/adjustments.', {
  reqs: ['FR-SHOP-002'], res: 'ProductView', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'],
  body: [f('name', 'string'), f('category', 'enum:PRODUCT_CATEGORY'), f('brand', 'string'), f('description', 'text'), f('price', 'money'), f('image_url', 'url'), f('low_stock_threshold', 'int'), f('is_active', 'bool')] });
ep('shop.productDelete', 'DELETE', '/shop/products/:id', O, 'Shop catalogue', 'D', 'Retire a product (soft delete: is_active = false; order history stays intact).', { reqs: ['FR-SHOP-002'], res: 'ProductView', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'] });
ep('shop.orderCreate', 'POST', '/shop/orders', [M, F, S, O], 'Shop orders', 'C', 'Place a shop order: member online order (pickup/delivery) or staff counter sale.', {
  reqs: ['FR-SHOP-003', 'FR-SHOP-004', 'FR-SHOP-005', 'FR-SHOP-006', 'FR-SHOP-007', 'FR-SHOP-008', 'FR-INV-001', 'FR-FIN-001'], res: 'ShopOrderDetail', tables: ['shop_orders', 'shop_order_items', 'products', 'payments'], guest: true,
  errors: ['PRODUCT_NOT_FOUND', 'OUT_OF_STOCK', 'DELIVERY_ADDRESS_REQUIRED', 'MEMBER_NOT_FOUND', 'PAYMENT_FAILED'],
  body: [f('items', 'object[]', 1, '1-50 lines; duplicate products are merged', [f('product_id', 'uuid', 1), f('quantity', 'int', 1, '1-99')]), f('fulfillment', 'enum:ORDER_FULFILLMENT', 1, 'MEMBER: PICKUP|DELIVERY. Staff: IN_STORE'), f('delivery_address', 'text', 0, 'required when fulfillment = DELIVERY'), memberRef, guestName, guestPhone, method(0, 'MEMBER: ONLINE. Staff counter sale: CASH|CARD|UPI (required for IN_STORE)')],
  rules: 'IN_STORE = a counter sale made by staff; PICKUP / DELIVERY = placed online by a member (no separate channel column: it follows from fulfillment). One transaction: `UPDATE products SET stock_quantity = stock_quantity - :q WHERE id = :id AND stock_quantity >= :q` per line (0 rows => OUT_OF_STOCK, rollback) + snapshot unit_price + discount_amount = subtotal x shop_discount_percent + delivery_fee (unless free_delivery_above) + payment. Totals and payment_status are derived (view shop_order_totals). IN_STORE orders are created COMPLETED; online orders start PLACED.' });
ep('shop.orderList', 'GET', '/shop/orders', [Mo, F, S, O], 'Shop orders', 'V', 'List shop orders (members see their own).', {
  reqs: ['FR-SHOP-011', 'FR-SHOP-009'], res: 'Page<ShopOrderDetail>', tables: ['shop_orders', 'shop_order_items'], guest: true,
  query: [f('status', 'enum:SHOP_ORDER_STATUS'), f('fulfillment', 'enum:ORDER_FULFILLMENT'), f('member_id', 'uuid', 0, 'staff only'), f('from', 'date'), f('to', 'date')] });
ep('shop.orderGet', 'GET', '/shop/orders/:id', [Mo, F, S, O], 'Shop orders', 'V', 'Order detail with lines.', { reqs: ['FR-SHOP-011', 'FR-SHOP-009'], res: 'ShopOrderDetail', tables: ['shop_orders'], errors: ['ORDER_NOT_FOUND'] });
ep('shop.orderStatus', 'PATCH', '/shop/orders/:id/status', [F, S, O], 'Shop orders', 'U', 'Advance an order: PLACED -> CONFIRMED -> READY_FOR_PICKUP | OUT_FOR_DELIVERY -> COMPLETED.', {
  reqs: ['FR-SHOP-009', 'FR-SHOP-005', 'FR-SHOP-006'], res: 'ShopOrderDetail', tables: ['shop_orders'], errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('status', 'enum:SHOP_ORDER_STATUS', 1, 'must be allowed by SHOP_ORDER_TRANSITIONS; READY_FOR_PICKUP only for PICKUP orders, OUT_FOR_DELIVERY only for DELIVERY orders')], rules: 'Use /shop/orders/:id/cancel for cancellations.' });
ep('shop.orderCancel', 'POST', '/shop/orders/:id/cancel', [Mo, F, S, O], 'Shop orders', 'U', 'Cancel an order: restores stock and refunds.', {
  reqs: ['FR-SHOP-010', 'FR-INV-001'], res: 'ShopOrderDetail', tables: ['shop_orders', 'products', 'payments'], guest: true, errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  rules: 'MEMBER may cancel only own order while PLACED. Staff while not COMPLETED/CANCELLED. Adds the quantities back to products.stock_quantity and refunds the payment in full (the order then reports payment_status REFUNDED).' });

// =================================================================================== INVENTORY
ep('inventory.list', 'GET', '/inventory', [F, S, O], 'Inventory', 'V', 'Stock levels for every product (same shelf for counter and online).', {
  reqs: ['FR-INV-001', 'FR-INV-002'], res: 'Page<InventoryItem>', tables: ['products'], query: [f('category', 'enum:PRODUCT_CATEGORY'), f('low_stock_only', 'bool'), f('q', 'string')] });
ep('inventory.lowStock', 'GET', '/inventory/low-stock', [F, S, O], 'Inventory', 'V', 'Products at or below their low-stock threshold (includes out of stock).', { reqs: ['FR-INV-002'], res: 'InventoryItem[]', tables: ['products'], rules: 'stock_quantity <= low_stock_threshold AND is_active. stock_status: 0 => OUT_OF_STOCK, <= threshold => LOW_STOCK, else IN_STOCK.' });
ep('inventory.adjust', 'POST', '/inventory/adjustments', [S, O], 'Inventory', 'C', 'Restock or correct the stock of a product.', {
  reqs: ['FR-INV-003'], res: 'InventoryItem', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'],
  body: [f('product_id', 'uuid', 1), f('quantity_change', 'int', 1, 'non-zero; negative allowed only if the result stays >= 0 (else VALIDATION_ERROR)')],
  rules: '`UPDATE products SET stock_quantity = stock_quantity + :change WHERE id = :id AND stock_quantity + :change >= 0`. products.stock_quantity is the stock: there is no separate ledger (ADR-016).' });

// =================================================================================== CAFE (bar)
ep('bar.menu', 'GET', '/bar/menu', PUB, 'Cafe menu', 'V', 'Bar & cafeteria menu.', { reqs: ['FR-BAR-001', 'FR-PUB-005'], res: 'BarMenuItem[]', tables: ['bar_menu_items'], query: [f('category', 'enum:MENU_CATEGORY'), f('include_unavailable', 'bool', 0, 'staff only')] });
ep('bar.menuCreate', 'POST', '/bar/menu-items', O, 'Cafe menu', 'C', 'Add a menu item.', { reqs: ['FR-BAR-011'], res: 'BarMenuItem', tables: ['bar_menu_items'], body: [f('name', 'string', 1, 'unique'), f('category', 'enum:MENU_CATEGORY', 1), f('description', 'text'), f('price', 'money', 1, 'tax-inclusive'), f('sort_order', 'int')] });
ep('bar.menuUpdate', 'PATCH', '/bar/menu-items/:id', O, 'Cafe menu', 'U', 'Edit a menu item / mark unavailable.', { reqs: ['FR-BAR-011'], res: 'BarMenuItem', tables: ['bar_menu_items'], errors: ['MENU_ITEM_NOT_FOUND'], body: [f('name', 'string'), f('category', 'enum:MENU_CATEGORY'), f('description', 'text'), f('price', 'money'), f('is_available', 'bool'), f('sort_order', 'int')] });
ep('bar.menuStock', 'POST', '/bar/menu-items/:id/stock-adjustments', [K, O], 'Cafe menu', 'U', 'Kitchen stock: restock or correct the quantity on hand of one menu item.', {
  reqs: ['FR-BAR-011'], res: 'BarMenuItem', tables: ['bar_menu_items'], errors: ['MENU_ITEM_NOT_FOUND'],
  body: [f('quantity_change', 'int', 1, 'non-zero; negative allowed only if the result stays >= 0 (else VALIDATION_ERROR)')],
  rules: '`UPDATE bar_menu_items SET stock_quantity = stock_quantity + :change WHERE id = :id AND stock_quantity + :change >= 0`. Cafe orders take stock off the same column (R-SHOP-02 style, OUT_OF_STOCK when short) and a cancelled order puts it back. Shop products are not reachable from here: the kitchen manager has no access to /inventory.' });
ep('bar.memberLookup', 'GET', '/bar/member-lookup', [F, K, O], 'Cafe orders', 'V', 'Counter lookup of a member for the café till: identifies the customer and returns the café discount, nothing else (not the member list).', {
  reqs: ['FR-BAR-003', 'FR-BAR-004'], res: 'MemberPosLookup[]', tables: ['members', 'users', 'memberships', 'membership_plans'],
  query: [f('q', 'string', 1, 'member number (CCM-00001), e-mail, phone digits (6+) or part of the name (3+ letters); at most 5 matches')],
  rules: 'Active accounts only. Returns member id, member number, name, membership status, plan name and bar_discount_percent (0 without an active membership). The order itself is still priced by the server from member_id (R-BAR-01).' });
ep('bar.orderCreate', 'POST', '/bar/orders', [F, O], 'Cafe orders', 'C', 'Take a cafe order for a table label, member or guest. Appears instantly on the kitchen board.', {
  reqs: ['FR-BAR-003', 'FR-BAR-004', 'FR-BAR-005', 'FR-BAR-008', 'FR-BAR-013', 'FR-KIT-001'], res: 'BarOrderDetail', tables: ['bar_orders', 'bar_order_items', 'payments'], guest: true,
  errors: ['MENU_ITEM_NOT_FOUND', 'MENU_ITEM_UNAVAILABLE', 'MEMBER_NOT_FOUND', 'PAYMENT_FAILED'],
  body: [f('table_label', 'string', 0, 'free text, e.g. "T3" or "Court side"'), memberRef, f('guest_name', 'string'), f('items', 'object[]', 1, '1-50 lines', [f('bar_menu_item_id', 'uuid', 1), f('quantity', 'int', 1, '1-50'), f('notes', 'string')]), method(0, 'pay now (CASH|CARD|UPI); omit to pay later at the desk'), f('notes', 'text')],
  rules: 'At least one of table_label, member_id, guest_name. Member discount = subtotal x bar_discount_percent of the member\'s CURRENT plan, stored as discount_amount (automatic; never asked). Guests pay list price. Snapshot unit_price + item_name. The order starts NEW. Totals and payment_status are derived (view bar_order_totals).' });
ep('bar.orderList', 'GET', '/bar/orders', [Mo, F, O], 'Cafe orders', 'V', 'List cafe orders (members see their own).', {
  reqs: ['FR-BAR-012', 'FR-BAR-009'], res: 'Page<BarOrderDetail>', tables: ['bar_orders', 'bar_order_items'], guest: true,
  query: [f('status', 'enum:ORDER_STATUS'), f('payment_status', 'enum:PAYMENT_STATUS'), f('table_label', 'string'), f('member_id', 'uuid', 0, 'staff only'), f('from', 'date'), f('to', 'date')] });
ep('bar.orderGet', 'GET', '/bar/orders/:id', [Mo, F, O], 'Cafe orders', 'V', 'Cafe order detail.', { reqs: ['FR-BAR-012'], res: 'BarOrderDetail', tables: ['bar_orders'], errors: ['ORDER_NOT_FOUND'] });
ep('bar.orderCancel', 'POST', '/bar/orders/:id/cancel', [F, O], 'Cafe orders', 'U', 'Cancel a cafe order while it is still NEW.', { reqs: ['FR-BAR-010'], res: 'BarOrderDetail', tables: ['bar_orders', 'payments'], guest: true, errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], rules: 'Refunds the payment if the order was already paid.' });
ep('bar.dailySummary', 'GET', '/bar/daily-summary', [F, O], 'Cafe orders', 'V', 'What the cafe earned on a day: revenue by method, discounts, who was on shift.', { reqs: ['FR-BAR-009'], res: 'BarDailySummary', tables: ['payments', 'bar_orders', 'staff_shifts'], query: [f('date', 'date', 0, 'default today (IST)')] });

// =================================================================================== KITCHEN
ep('kitchen.list', 'GET', '/kitchen/orders', [K, O], 'Kitchen orders', 'V', 'Kitchen board: incoming and in-progress orders (oldest first). No prices, no payment data.', {
  reqs: ['FR-KIT-001', 'FR-KIT-002', 'FR-KIT-004'], res: 'KitchenOrder[]', tables: ['bar_orders', 'bar_order_items'], query: [f('status', 'array:enum:ORDER_STATUS', 0, 'default NEW,PREPARING,READY'), f('date', 'date', 0, 'default today')], rules: 'Client polls every 5 s (see ADR-010). Projection only: never include unit_price, totals, member discount or payment fields.' });
ep('kitchen.get', 'GET', '/kitchen/orders/:id', [K, O], 'Kitchen orders', 'V', 'One kitchen order.', { reqs: ['FR-KIT-002'], res: 'KitchenOrder', tables: ['bar_orders'], errors: ['ORDER_NOT_FOUND'] });
ep('kitchen.status', 'PATCH', '/kitchen/orders/:id/status', [K, O], 'Kitchen orders', 'U', 'Move an order along: NEW -> PREPARING -> READY -> SERVED (reject a NEW order with CANCELLED; a READY order may go back to PREPARING).', {
  reqs: ['FR-KIT-003', 'FR-KIT-005'], res: 'KitchenOrder', tables: ['bar_orders'], errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('status', 'enum:ORDER_STATUS', 1, 'next status per ORDER_TRANSITIONS')], rules: 'bar_orders.status is the only record of progress: there is no separate status history.' });

// =================================================================================== ENQUIRIES
ep('enquiries.create', 'POST', '/enquiries', [PUB, F, O], 'Enquiries', 'C', 'Submit an enquiry or trial-session request. Staff use the same endpoint to log phone and walk-in enquiries.', {
  reqs: ['FR-ENQ-001', 'FR-ENQ-002', 'FR-ENQ-003', 'FR-PUB-006'], res: 'EnquiryView', tables: ['enquiries'], guest: true, errors: ['MEMBERSHIP_PLAN_NOT_FOUND'],
  body: [f('name', 'string', 1), f('phone', 'phone', 1), f('email', 'email'), f('enquiry_type', 'enum:ENQUIRY_TYPE', 0, 'default GENERAL'), f('message', 'text'), f('membership_plan_id', 'uuid'), f('sport_type', 'enum:SPORT_TYPE', 0, 'TRIAL'), f('preferred_start_at', 'datetime', 0, 'TRIAL: must be in the future')],
  rules: 'Stored with handled_at NULL: it waits in the front desk inbox until somebody handles it. Rate-limit public submissions (5/hour/IP).' });
ep('enquiries.list', 'GET', '/enquiries', [F, O], 'Enquiries', 'V', 'The enquiry inbox: list and filter enquiries.', { reqs: ['FR-ENQ-004', 'FR-ENQ-008'], res: 'Page<EnquiryView>', tables: ['enquiries'], query: [f('handled', 'bool', 0, 'false = still waiting (handled_at IS NULL)'), f('enquiry_type', 'enum:ENQUIRY_TYPE'), f('q', 'string')] });
ep('enquiries.get', 'GET', '/enquiries/:id', [F, O], 'Enquiries', 'V', 'One enquiry.', { reqs: ['FR-ENQ-004'], res: 'EnquiryView', tables: ['enquiries'], errors: ['ENQUIRY_NOT_FOUND'] });
ep('enquiries.update', 'PATCH', '/enquiries/:id', [F, O], 'Enquiries', 'U', 'Mark an enquiry handled (or reopen it) and correct its details.', {
  reqs: ['FR-ENQ-004', 'FR-ENQ-008'], res: 'EnquiryView', tables: ['enquiries'], errors: ['ENQUIRY_NOT_FOUND'],
  body: [f('handled', 'bool', 0, 'true sets handled_at = now, false clears it'), f('name', 'string'), f('phone', 'phone'), f('email', 'email'), f('message', 'text')] });

// =================================================================================== BUSINESS CLIENTS + INVOICES
ep('clients.list', 'GET', '/business-clients', O, 'Business clients', 'V', 'Business clients with invoiced / paid / outstanding totals.', { reqs: ['FR-INVC-001'], res: 'Page<BusinessClientDetail>', tables: ['business_clients', 'invoices'], query: [f('q', 'string'), f('is_active', 'bool')] });
ep('clients.create', 'POST', '/business-clients', O, 'Business clients', 'C', 'Register a business client (a company the club invoices; it has no login).', {
  reqs: ['FR-INVC-001'], res: 'BusinessClientDetail', tables: ['business_clients'],
  body: [f('company_name', 'string', 1), f('contact_name', 'string', 1), f('email', 'email', 1), f('phone', 'phone'), f('gstin', 'string', 0, '15-char GSTIN'), f('billing_address', 'text'), f('notes', 'text')] });
ep('clients.get', 'GET', '/business-clients/:id', O, 'Business clients', 'V', 'Client detail.', { reqs: ['FR-INVC-001'], res: 'BusinessClientDetail', tables: ['business_clients'], errors: ['BUSINESS_CLIENT_NOT_FOUND'] });
ep('clients.update', 'PATCH', '/business-clients/:id', O, 'Business clients', 'U', 'Edit a client.', { reqs: ['FR-INVC-001'], res: 'BusinessClientDetail', tables: ['business_clients'], errors: ['BUSINESS_CLIENT_NOT_FOUND'], body: [f('company_name', 'string'), f('contact_name', 'string'), f('email', 'email'), f('phone', 'phone'), f('gstin', 'string'), f('billing_address', 'text'), f('notes', 'text'), f('is_active', 'bool')] });
ep('invoices.list', 'GET', '/invoices', [Mo, O], 'Invoices', 'V', 'List invoices (the owner sees all; a member only their membership invoices).', {
  reqs: ['FR-INVC-005', 'FR-INVC-008', 'FR-FIN-006', 'FR-INVC-009'], res: 'Page<InvoiceView>', tables: ['invoices', 'invoice_items', 'payments'],
  query: [f('status', 'enum:INVOICE_STATUS'), f('payment_state', 'enum:INVOICE_PAYMENT_STATE'), f('invoice_type', 'enum:INVOICE_TYPE'), f('business_client_id', 'uuid', 0, 'OWNER_ADMIN only'), f('member_id', 'uuid', 0, 'OWNER_ADMIN only'), f('from', 'date'), f('to', 'date'), f('overdue', 'bool')], rules: 'Paid / partially paid / overdue are DERIVED by the view invoice_totals (payment_state): OVERDUE = a SENT invoice whose due_date is before today (IST) and that is not fully paid. Nothing is persisted by a job.' });
ep('invoices.create', 'POST', '/invoices', O, 'Invoices', 'C', 'Create a business-client or membership invoice.', {
  reqs: ['FR-INVC-002', 'FR-INVC-006', 'FR-INVC-003'], res: 'InvoiceDetail', tables: ['invoices', 'invoice_items'], errors: ['BUSINESS_CLIENT_NOT_FOUND', 'MEMBER_NOT_FOUND'],
  body: [f('business_client_id', 'uuid', 0, 'addressed to a business client (exactly one of business_client_id / member_id)'), f('member_id', 'uuid', 0, 'addressed to a member (membership invoice)'), f('issue_date', 'date', 0, 'default today'), f('due_date', 'date', 1, '>= issue_date'), f('items', 'object[]', 1, '>=1 line', [f('description', 'string', 1), f('quantity', 'int', 1), f('unit_price', 'money', 1, 'TAX-EXCLUSIVE')]), f('tax_rate', 'percent', 0, 'default setting tax_rate_business'), f('notes', 'text'), f('send_now', 'bool')],
  rules: 'Invoices are tax-EXCLUSIVE: subtotal = sum(quantity x unit_price); tax_amount = round(subtotal x tax_rate / 100, 2); total_amount = subtotal + tax_amount. Only the lines and tax_rate are stored; the totals are derived (view invoice_totals).' });
ep('invoices.get', 'GET', '/invoices/:id', [Mo, O], 'Invoices', 'V', 'Invoice with lines, payments and outstanding amount.', { reqs: ['FR-INVC-005', 'FR-INVC-008'], res: 'InvoiceDetail', tables: ['invoices', 'invoice_items', 'payments'], errors: ['INVOICE_NOT_FOUND'] });
ep('invoices.update', 'PATCH', '/invoices/:id', O, 'Invoices', 'U', 'Edit a DRAFT invoice.', { reqs: ['FR-INVC-002'], res: 'InvoiceDetail', tables: ['invoices', 'invoice_items'], errors: ['INVOICE_NOT_FOUND', 'INVOICE_NOT_EDITABLE'], body: [f('due_date', 'date'), f('items', 'object[]', 0, 'replaces all lines', [f('description', 'string', 1), f('quantity', 'int', 1), f('unit_price', 'money', 1)]), f('tax_rate', 'percent'), f('notes', 'text')] });
ep('invoices.send', 'POST', '/invoices/:id/send', O, 'Invoices', 'U', 'Issue the invoice to the client (DRAFT -> SENT).', { reqs: ['FR-INVC-003'], res: 'InvoiceDetail', tables: ['invoices'], errors: ['INVOICE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });
ep('invoices.void', 'POST', '/invoices/:id/void', O, 'Invoices', 'A', 'Void an invoice that has no payments.', { reqs: ['FR-INVC-007'], res: 'InvoiceDetail', tables: ['invoices', 'payments'], errors: ['INVOICE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });

// =================================================================================== PAYMENTS
ep('payments.create', 'POST', '/payments', [Mo, F, K, S, O], 'Payments', 'C', 'Record a payment against a court booking, membership, shop order, cafe order or invoice.', {
  reqs: ['FR-FIN-001', 'FR-FIN-002', 'FR-INVC-004', 'FR-FIN-010'], res: 'PaymentView', tables: ['payments', 'court_bookings', 'shop_orders', 'bar_orders', 'invoices'], guest: true,
  errors: ['PAYMENT_FAILED', 'PAYMENT_AMOUNT_MISMATCH', 'ALREADY_PAID', 'BOOKING_NOT_FOUND', 'ORDER_NOT_FOUND', 'INVOICE_NOT_FOUND', 'MEMBERSHIP_NOT_FOUND'],
  body: [f('source_type', 'enum:PAYMENT_SOURCE_TYPE', 1), f('source_id', 'uuid', 1), f('amount', 'money', 0, 'default = remaining due. Partial payments allowed ONLY for INVOICE; every other source must equal the full amount due'), method(1, 'MEMBER: ONLINE only. FRONT_DESK: CASH | CARD | UPI. OWNER_ADMIN: any'), f('gateway_reference', 'string'), f('notes', 'text')],
  rules: 'The revenue category is derived from source_type (INVOICE: BUSINESS or MEMBERSHIP by the invoice recipient) by the view payment_ledger. tax_amount is computed at payment time (tax-inclusive sources) or pro rata (invoices). No status is written on the thing being paid: its payment status is derived from its payments. ONLINE goes through the mock gateway of the hackathon build (ADR-011): an amount whose paise are .13 (e.g. 100.13) returns PAYMENT_FAILED.' });
ep('payments.list', 'GET', '/payments', [Mo, Fo, Ko, So, O], 'Payments', 'V', 'Payment history. Members / clients: own. Front desk: payments they received. Owner: all.', {
  reqs: ['FR-FIN-004', 'FR-INVC-005', 'FR-FIN-003'], res: 'Page<PaymentView>', tables: ['payments'],
  query: [f('source_type', 'enum:PAYMENT_SOURCE_TYPE'), f('revenue_category', 'enum:REVENUE_CATEGORY'), f('method', 'enum:PAYMENT_METHOD'), f('status', 'enum:PAYMENT_TXN_STATUS'), f('member_id', 'uuid', 0, 'OWNER_ADMIN only'), f('business_client_id', 'uuid', 0, 'OWNER_ADMIN only'), f('from', 'date'), f('to', 'date')] });
ep('payments.get', 'GET', '/payments/:id', [Mo, Fo, Ko, So, O], 'Payments', 'V', 'One payment = the receipt.', { reqs: ['FR-FIN-004'], res: 'PaymentView', tables: ['payments'], errors: ['PAYMENT_NOT_FOUND'] });
ep('payments.refund', 'POST', '/payments/:id/refund', O, 'Payments', 'A', 'Refund (fully or partly) a payment. Cancellation flows refund automatically; this is for manual corrections.', {
  reqs: ['FR-FIN-005'], res: 'PaymentView', tables: ['payments'], errors: ['PAYMENT_NOT_FOUND', 'REFUND_EXCEEDS_PAYMENT'], body: [f('amount', 'money', 1, '> 0, <= amount - refunded_amount'), f('reason', 'text', 1)] });

// =================================================================================== STAFF / HR
ep('staff.list', 'GET', '/staff', O, 'Staff records', 'V', 'Staff directory.', { reqs: ['FR-STAFF-001'], res: 'Page<StaffView>', tables: ['staff', 'users'], query: [f('q', 'string'), f('role', 'enum:USER_ROLE'), f('is_active', 'bool')] });
ep('staff.create', 'POST', '/staff', O, 'Staff records', 'C', 'Create a staff account (front desk, kitchen, store manager or another owner) and employee record.', {
  reqs: ['FR-STAFF-001', 'FR-AUTH-007'], res: 'StaffView', tables: ['users', 'staff'], errors: ['EMAIL_TAKEN'],
  body: [f('full_name', 'string', 1), f('email', 'email', 1), f('phone', 'phone'), f('role', 'enum:USER_ROLE', 1, 'FRONT_DESK | KITCHEN_MANAGER | STORE_MANAGER | OWNER_ADMIN only'), f('password', 'string', 1), f('designation', 'string', 1), f('monthly_salary', 'money', 1), f('joined_on', 'date')] });
ep('staff.get', 'GET', '/staff/:id', [Fo, Ko, So, O], 'Staff records', 'V', 'Employee record.', { reqs: ['FR-STAFF-001', 'FR-STAFF-007'], res: 'StaffView', tables: ['staff'], errors: ['STAFF_NOT_FOUND'] });
ep('staff.update', 'PATCH', '/staff/:id', O, 'Staff records', 'U', 'Edit an employee / deactivate (is_active lives on the login: users.is_active).', { reqs: ['FR-STAFF-001'], res: 'StaffView', tables: ['staff', 'users'], errors: ['STAFF_NOT_FOUND'], body: [f('full_name', 'string'), f('phone', 'phone'), f('designation', 'string'), f('monthly_salary', 'money'), f('is_active', 'bool')] });
ep('staff.applicationCreate', 'POST', '/staff/applications', PUB, 'Job applications', 'C', 'A visitor applies to work at the club. Nothing is granted until the owner approves; the applicant can log in to see the status.', {
  reqs: ['FR-AUTH-008', 'FR-STAFF-008'], res: 'EmployeeApplicationPending', tables: ['employee_applications'], errors: ['EMAIL_TAKEN', 'APPLICATION_PENDING'],
  body: [f('full_name', 'string', 1, '2-120 chars'), f('email', 'email', 1), f('phone', 'phone', 1), f('password', 'string', 1, 'min 8 chars, >=1 letter and >=1 digit; kept only as a bcrypt hash until the owner decides')],
  rules: 'Creates a PENDING `employee_applications` row. No `users` / `staff` row exists yet. One PENDING application per email.' });
ep('staff.applicationList', 'GET', '/staff/applications', O, 'Job applications', 'V', 'Job applications, newest first (never includes password hashes).', { reqs: ['FR-STAFF-008'], res: 'EmployeeApplicationView[]', tables: ['employee_applications', 'users'], query: [f('status', 'enum:APPLICATION_STATUS')] });
ep('staff.applicationApprove', 'POST', '/staff/applications/:id/approve', O, 'Job applications', 'A', 'Approve an application and choose the role: creates the login (same email and password) and the staff record.', {
  reqs: ['FR-STAFF-008'], res: 'EmployeeApplicationView', tables: ['employee_applications', 'users', 'staff'], errors: ['APPLICATION_NOT_FOUND', 'INVALID_STATUS_TRANSITION', 'EMAIL_TAKEN'],
  body: [f('role', 'enum:USER_ROLE', 1, 'FRONT_DESK | KITCHEN_MANAGER | STORE_MANAGER'), f('designation', 'string', 0, 'default: the role name'), f('monthly_salary', 'money', 0, 'default 0.00')],
  rules: 'One transaction: lock the PENDING application, create `users` (bcrypt hash copied, role, active) + `staff`, mark it APPROVED with approved_role / reviewer / reviewed_at, clear the stored hash.' });
ep('staff.applicationReject', 'POST', '/staff/applications/:id/reject', O, 'Job applications', 'A', 'Decline an application. No account is created.', {
  reqs: ['FR-STAFF-008'], res: 'EmployeeApplicationView', tables: ['employee_applications'], errors: ['APPLICATION_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('note', 'string', 0, 'shown on the owner dashboard')], rules: 'Marks the application REJECTED and clears the stored hash; the applicant gets no access.' });
ep('events.list', 'GET', '/events', ANY, 'Events', 'V', 'All club events, soonest first. Every role reads the same rows; a member also gets `is_registered`.', { reqs: ['FR-EVT-002'], res: 'EventView[]', tables: ['events', 'event_registrations'] });
ep('events.create', 'POST', '/events', O, 'Events', 'C', 'Create an event.', { reqs: ['FR-EVT-001'], res: 'EventView', tables: ['events'], body: [f('title', 'string', 1), f('kind', 'enum:EVENT_KIND', 1), f('description', 'text'), f('location', 'string', 1), f('start_at', 'datetime', 1), f('end_at', 'datetime', 1, '> start_at'), f('capacity', 'int', 1, '>= 1'), f('fee', 'money', 0, 'default 0.00')] });
ep('events.register', 'POST', '/events/:id/registrations', M, 'Events', 'C', 'Register the calling member for an event (idempotent).', { reqs: ['FR-EVT-002'], res: 'EventView', tables: ['events', 'event_registrations'], errors: ['EVENT_NOT_FOUND', 'EVENT_FULL', 'EVENT_ENDED'], rules: 'Capacity is checked inside a transaction that locks the event row.' });
ep('events.unregister', 'DELETE', '/events/:id/registrations', M, 'Events', 'D', 'Cancel the calling member registration.', { reqs: ['FR-EVT-002'], res: 'EventView', tables: ['event_registrations'], errors: ['EVENT_NOT_FOUND'] });
ep('staff.shifts', 'GET', '/staff/shifts', [F, Ko, So, O], 'Shifts', 'V', 'Shift roster for a date range (front desk sees everyone read-only; kitchen only own).', { reqs: ['FR-STAFF-002', 'FR-STAFF-005', 'FR-STAFF-007'], res: 'ShiftView[]', tables: ['staff_shifts', 'staff'], query: [f('from', 'date', 1), f('to', 'date', 1, 'max 31 days'), f('staff_id', 'uuid'), f('area', 'enum:SHIFT_AREA')] });
ep('staff.shiftCreate', 'POST', '/staff/shifts', O, 'Shifts', 'C', 'Assign a shift.', { reqs: ['FR-STAFF-002'], res: 'ShiftView', tables: ['staff_shifts'], errors: ['STAFF_NOT_FOUND', 'SHIFT_OVERLAP'], body: [f('staff_id', 'uuid', 1), f('shift_date', 'date', 1), f('start_time', 'time', 1), f('end_time', 'time', 1, '> start_time (same day)'), f('area', 'enum:SHIFT_AREA', 1)], rules: 'Rejects overlaps for the same staff/date and dates inside an APPROVED leave (SHIFT_OVERLAP).' });
ep('staff.shiftUpdate', 'PATCH', '/staff/shifts/:id', O, 'Shifts', 'U', 'Edit a shift.', { reqs: ['FR-STAFF-002'], res: 'ShiftView', tables: ['staff_shifts'], errors: ['SHIFT_NOT_FOUND', 'SHIFT_OVERLAP'], body: [f('shift_date', 'date'), f('start_time', 'time'), f('end_time', 'time'), f('area', 'enum:SHIFT_AREA')] });
ep('staff.shiftDelete', 'DELETE', '/staff/shifts/:id', O, 'Shifts', 'D', 'Remove a shift.', { reqs: ['FR-STAFF-002'], res: 'void', tables: ['staff_shifts'], errors: ['SHIFT_NOT_FOUND'] });
ep('staff.leaveList', 'GET', '/staff/leave-requests', [Fo, Ko, So, O], 'Leave', 'V', 'Leave requests (staff see their own; owner sees all).', { reqs: ['FR-STAFF-003', 'FR-STAFF-004'], res: 'Page<LeaveView>', tables: ['leave_requests', 'staff'], query: [f('status', 'enum:LEAVE_STATUS'), f('staff_id', 'uuid', 0, 'OWNER_ADMIN only'), f('from', 'date'), f('to', 'date')] });
ep('staff.leaveCreate', 'POST', '/staff/leave-requests', [F, K, S], 'Leave', 'C', 'Request leave (status PENDING).', { reqs: ['FR-STAFF-003'], res: 'LeaveView', tables: ['leave_requests'], errors: ['LEAVE_OVERLAP'], body: [f('start_date', 'date', 1), f('end_date', 'date', 1, '>= start_date'), f('reason', 'text')] });
ep('staff.leaveDecide', 'POST', '/staff/leave-requests/:id/decision', O, 'Leave', 'A', 'Approve or reject a PENDING leave request.', { reqs: ['FR-STAFF-004'], res: 'LeaveView', tables: ['leave_requests'], errors: ['LEAVE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('decision', 'enum:LEAVE_DECISION', 1), f('note', 'text', 0, 'required when REJECT')], status: 200 });
ep('staff.leaveCancel', 'POST', '/staff/leave-requests/:id/cancel', [Fo, Ko, So, O], 'Leave', 'U', 'Cancel a PENDING or future APPROVED leave request.', { reqs: ['FR-STAFF-003'], res: 'LeaveView', tables: ['leave_requests'], errors: ['LEAVE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });
ep('staff.payrollList', 'GET', '/staff/payroll', [Fo, Ko, So, O], 'Payroll', 'V', 'Salary payments (staff: own history).', { reqs: ['FR-STAFF-006', 'FR-FIN-008', 'FR-STAFF-007'], res: 'Page<PayrollView>', tables: ['payroll_payments', 'staff'], query: [f('staff_id', 'uuid', 0, 'OWNER_ADMIN only'), f('pay_period', 'date', 0, 'first day of month'), f('paid', 'bool', 0, 'true = paid_on is set, false = still pending')] });
ep('staff.payrollCreate', 'POST', '/staff/payroll', O, 'Payroll', 'C', 'Create (and optionally pay) a salary record for a month.', { reqs: ['FR-STAFF-006', 'FR-FIN-008'], res: 'PayrollView', tables: ['payroll_payments'], errors: ['STAFF_NOT_FOUND', 'PAYROLL_EXISTS'], body: [f('staff_id', 'uuid', 1), f('pay_period', 'date', 1, 'first day of month'), f('amount', 'money', 0, 'default staff.monthly_salary'), method(1), f('mark_paid', 'bool', 0, 'true sets paid_on = today')] });
ep('staff.payrollPay', 'POST', '/staff/payroll/:id/pay', O, 'Payroll', 'U', 'Mark a pending salary as paid (sets paid_on).', { reqs: ['FR-STAFF-006', 'FR-FIN-008'], res: 'PayrollView', tables: ['payroll_payments'], errors: ['NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [method(0), f('paid_on', 'date', 0, 'default today')], status: 200 });

// =================================================================================== REPORTS (OWNER_ADMIN only)
const rep = (id, path, summary, res, reqs, query, tables, rules = '') => ep(id, 'GET', path, O, 'Reports', 'V', summary, { reqs, res, query, tables, rules });
rep('reports.dashboard', '/reports/dashboard', 'Owner dashboard KPIs for today / this week / this month across every module.', 'OwnerDashboard', ['FR-REP-001', 'FR-FIN-009', 'FR-MEM-014'], [f('period', 'enum:REPORT_PERIOD', 1, 'TODAY = IST today; WEEK = Monday..today; MONTH = 1st..today')], ['payments', 'memberships', 'court_bookings', 'shop_orders', 'bar_orders', 'enquiries', 'invoices', 'payroll_payments', 'leave_requests', 'products'], 'Revenue = SUM(payments.amount - refunded_amount) by paid_at in the range (IST), grouped by the derived revenue_category (view payment_ledger).');
rep('reports.revenue', '/reports/revenue', 'Revenue by day, category (court/membership/shop/bar/business) or payment method.', 'RevenueReport', ['FR-REP-002', 'FR-FIN-003', 'FR-FIN-002'], [from, to, f('group_by', 'enum:REPORT_GROUP_BY', 0, 'default CATEGORY')], ['payments']);
rep('reports.courts', '/reports/courts', 'Court utilisation, cancellations and revenue per court.', 'CourtUtilizationReport', ['FR-REP-003'], [from, to], ['court_bookings', 'courts', 'payments'], 'utilization_percent = booked hours / available hours (open hours x days, minus MAINTENANCE).');
rep('reports.memberships', '/reports/memberships', 'Active members by type, new registrations, renewals, expiring, membership revenue.', 'MembershipReport', ['FR-REP-004', 'FR-MEM-014'], [from, to], ['memberships', 'members', 'payments']);
rep('reports.shop', '/reports/shop', 'Shop sales, fulfillment split, top products, low stock.', 'ShopReport', ['FR-REP-005'], [from, to], ['shop_orders', 'shop_order_items', 'products']);
rep('reports.bar', '/reports/bar', 'Cafe revenue per day (what the cafe earned), by method.', 'BarDailySummary[]', ['FR-REP-006', 'FR-BAR-009'], [from, to], ['payments', 'bar_orders']);
rep('reports.finance', '/reports/finance', 'Money in, refunds, outstanding invoices, overdue, payroll paid/pending, tax collected.', 'FinanceReport', ['FR-REP-009', 'FR-FIN-006', 'FR-FIN-008'], [from, to], ['payments', 'invoices', 'payroll_payments']);
rep('reports.tax', '/reports/tax', 'Tax collected (GST) by revenue category for filing.', 'TaxReport', ['FR-REP-007', 'FR-FIN-007'], [from, to], ['payments'], 'Sum of payments.tax_amount net of refunds (pro-rata), grouped by the derived revenue_category.');
rep('reports.export', '/reports/export', 'Download a report as CSV to share with an accountant / partners. Response is text/csv, NOT the JSON envelope.', 'void', ['FR-REP-008'], [f('report', 'enum:EXPORT_REPORT', 1), from, to], ['payments', 'court_bookings', 'members', 'shop_orders', 'bar_orders']);

// =================================================================================== SETTINGS
ep('settings.list', 'GET', '/settings', O, 'Club settings', 'V', 'All club settings.', { reqs: ['FR-SET-001'], res: 'SettingView[]', tables: ['club_settings'] });
ep('settings.update', 'PATCH', '/settings/:key', O, 'Club settings', 'U', 'Change one setting (hours, tax rates, delivery fee, cut-offs...).', { reqs: ['FR-SET-001'], res: 'SettingView', tables: ['club_settings'], errors: ['SETTING_NOT_FOUND'], body: [f('value', 'string', 1, 'JSON scalar matching the existing value\'s type (string | number | boolean)')], rules: 'Only existing keys listed in SETTING_KEYS can be changed. `value` is validated against the type of the current value.' });

// ---------------------------------------------------------------------------------- derived helpers
export const roleName = (r) => r.split(':')[0];
export const isOwnOnly = (r) => r.endsWith(':own');
export const ALL_ROLES = [M, F, K, S, O];

// ---------------------------------------------------------------------------------- governing business rules per endpoint
// Rule ids live in docs/business-rules/BUSINESS_RULES.md (single place). The API contract cites them instead of restating them;
// tools/check-consistency.mjs verifies every id exists.
export const ruleRefs = {
  'auth.signup': ['R-SEC-02', 'R-MEM-05'], 'auth.login': ['R-SEC-02'], 'auth.changePassword': ['R-SEC-02'],
  'members.create': ['R-MEM-07', 'R-SEC-02'], 'members.me': ['R-MEM-04', 'R-COURT-04'], 'members.get': ['R-MEM-04', 'R-COURT-04'],
  'memberships.plans': ['R-MEM-02'], 'memberships.planCreate': ['R-MEM-02'], 'memberships.planUpdate': ['R-MEM-02', 'R-MEM-11'],
  'memberships.purchase': ['R-MEM-03', 'R-MEM-06', 'R-MEM-07', 'R-FIN-11'], 'memberships.changePlan': ['R-MEM-08', 'R-MEM-07'],
  'memberships.cancel': ['R-MEM-09'], 'memberships.expiring': ['R-MEM-04', 'R-MEM-10'],
  'courts.availability': ['R-COURT-01', 'R-COURT-03'], 'courts.block': ['R-COURT-10', 'R-COURT-03'], 'courts.unblock': ['R-COURT-10'],
  'bookings.price': ['R-COURT-05', 'R-COURT-04', 'R-MEM-04'],
  'bookings.create': ['R-COURT-01', 'R-COURT-02', 'R-COURT-03', 'R-COURT-04', 'R-COURT-05', 'R-COURT-06', 'R-COURT-08', 'R-MEM-05'],
  'bookings.cancel': ['R-COURT-07', 'R-COURT-09'],
  'shop.products': ['R-SHOP-03', 'R-SHOP-04'], 'shop.productCreate': ['R-SHOP-09'], 'shop.productUpdate': ['R-SHOP-09'], 'shop.productDelete': ['R-SHOP-09'],
  'shop.orderCreate': ['R-SHOP-01', 'R-SHOP-02', 'R-SHOP-04', 'R-SHOP-05', 'R-SHOP-06', 'R-FIN-11'],
  'shop.orderStatus': ['R-SHOP-07'], 'shop.orderCancel': ['R-SHOP-08'],
  'inventory.list': ['R-SHOP-03'], 'inventory.lowStock': ['R-SHOP-03'], 'inventory.adjust': ['R-SHOP-02', 'R-SHOP-03'],
  'bar.orderCreate': ['R-BAR-01', 'R-BAR-02', 'R-BAR-03', 'R-BAR-04', 'R-BAR-05'], 'bar.orderCancel': ['R-BAR-08'], 'bar.dailySummary': ['R-BAR-09'],
  'kitchen.list': ['R-BAR-07'], 'kitchen.status': ['R-BAR-07', 'R-BAR-08'],
  'enquiries.create': ['R-ENQ-01'], 'enquiries.list': ['R-ENQ-02'], 'enquiries.update': ['R-ENQ-02'],
  'invoices.list': ['R-INVC-03', 'R-FIN-08'], 'invoices.create': ['R-FIN-03', 'R-FIN-05'], 'invoices.update': ['R-INVC-01'], 'invoices.send': ['R-INVC-01'], 'invoices.void': ['R-INVC-04'], 'clients.create': ['R-INVC-05'],
  'payments.create': ['R-FIN-01', 'R-FIN-02', 'R-FIN-04', 'R-FIN-05', 'R-FIN-11', 'R-INVC-02'], 'payments.refund': ['R-FIN-06'], 'payments.list': ['R-FIN-01'],
  'staff.update': ['R-HR-03'], 'staff.shiftCreate': ['R-HR-01'], 'staff.shiftUpdate': ['R-HR-01'], 'staff.leaveCreate': ['R-HR-02'], 'staff.leaveDecide': ['R-HR-02'], 'staff.leaveCancel': ['R-HR-02'],
  'staff.payrollCreate': ['R-FIN-10'], 'staff.payrollPay': ['R-FIN-10'],
  'reports.dashboard': ['R-FIN-07', 'R-FIN-08', 'R-FIN-10'], 'reports.revenue': ['R-FIN-07'], 'reports.finance': ['R-FIN-07', 'R-FIN-08', 'R-FIN-10'], 'reports.tax': ['R-FIN-07'], 'reports.bar': ['R-BAR-09'],
};
