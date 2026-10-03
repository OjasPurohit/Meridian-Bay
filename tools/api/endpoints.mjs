// SINGLE SOURCE OF TRUTH for the HTTP API. Everything else is generated from this file by tools/gen-docs.mjs:
//   docs/api/API_CONTRACT.md, docs/api/openapi.yaml, shared/types/requests.generated.ts,
//   docs/security/PERMISSIONS_MATRIX.md, docs/requirements/TRACEABILITY_MATRIX.md
// To change the API: edit THIS file -> `npm run docs:build` -> commit all regenerated files together (see TEAM_GUIDELINES.md).
//
// Field DSL:  f(name, type, required, rule)
//   types: uuid string text int number money percent bool date datetime time email phone url
//          enum:ENUM_NAME   (from shared/constants/enums.ts)   array:<type>   object[] (needs `of`)
// Roles: M=MEMBER F=FRONT_DESK K=KITCHEN_MANAGER B=BUSINESS_CLIENT O=OWNER_ADMIN, PUB=no auth.  A trailing `:own` limits the role to its own records.

export const PUB = 'PUBLIC';
const M = 'MEMBER', F = 'FRONT_DESK', K = 'KITCHEN_MANAGER', B = 'BUSINESS_CLIENT', O = 'OWNER_ADMIN';
const Mo = 'MEMBER:own', Bo = 'BUSINESS_CLIENT:own', Fo = 'FRONT_DESK:own', Ko = 'KITCHEN_MANAGER:own';
const ANY = [M, F, K, B, O];

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
ep('auth.signup', 'POST', '/auth/signup', PUB, 'Authentication', 'C', 'Visitor creates an account (role MEMBER, no plan yet) and is logged in.', {
  reqs: ['FR-AUTH-001'], res: 'AuthSession', tables: ['users', 'members'], errors: ['EMAIL_TAKEN'],
  body: [f('full_name', 'string', 1, '2-120 chars'), f('email', 'email', 1, 'unique (case-insensitive)'), f('phone', 'phone', 1), f('password', 'string', 1, 'min 8 chars, >=1 letter and >=1 digit'), f('date_of_birth', 'date', 0, 'must be in the past')],
  rules: 'Creates `users` (role MEMBER) + `members` in one transaction. No membership is created: until a plan is bought the member pays walk-in rates.' });
ep('auth.login', 'POST', '/auth/login', PUB, 'Authentication', 'C', 'Authenticate and receive a JWT plus the role-based landing route.', {
  reqs: ['FR-AUTH-002', 'FR-AUTH-003'], res: 'AuthSession', status: 200, tables: ['users'], errors: ['AUTH_INVALID', 'ACCOUNT_DISABLED'],
  body: [f('email', 'email', 1), f('password', 'string', 1)],
  rules: '`redirect_to` = ROLE_HOME_ROUTE[user.role]. Never reveal whether the email exists (always AUTH_INVALID). Updates users.last_login_at.' });
ep('auth.logout', 'POST', '/auth/logout', ANY, 'Authentication', 'U', 'End the session (stateless JWT: the client discards the token).', { reqs: ['FR-AUTH-004'], res: 'void' });
ep('auth.me', 'GET', '/auth/me', ANY, 'Authentication', 'V', 'Current user + role profile + landing route. Re-issues a fresh token.', { reqs: ['FR-AUTH-002'], res: 'AuthSession', tables: ['users', 'members', 'staff', 'business_clients'] });
ep('auth.changePassword', 'POST', '/auth/change-password', ANY, 'Authentication', 'U', 'Change own password (clears must_change_password).', {
  reqs: ['FR-AUTH-006'], tables: ['users'], errors: ['AUTH_INVALID'],
  body: [f('current_password', 'string', 1), f('new_password', 'string', 1, 'min 8 chars, >=1 letter and >=1 digit')] });

// =================================================================================== PUBLIC
ep('public.club', 'GET', '/public/club', PUB, 'Public website', 'V', 'Club introduction, timings, contact, sports offered, social-play window.', {
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
  body: [f('full_name', 'string'), f('phone', 'phone'), f('date_of_birth', 'date'), f('address', 'text'), f('emergency_contact_name', 'string'), f('emergency_contact_phone', 'phone'), f('photo_url', 'url'), f('notes', 'text', 0, 'staff only'), f('is_active', 'bool', 0, 'OWNER_ADMIN only')] });
ep('members.history', 'GET', '/members/:id/history', [Mo, F, O], 'Members', 'V', 'Unified timeline of everything the member did at the club (memberships, bookings, social play, shop, bar, payments).', {
  reqs: ['FR-MEM-004'], res: 'Page<MemberHistoryEvent>', tables: ['memberships', 'court_bookings', 'social_session_participants', 'shop_orders', 'bar_orders', 'payments'], errors: ['MEMBER_NOT_FOUND'],
  query: [f('event_type', 'enum:HISTORY_EVENT_TYPE'), f('from', 'date'), f('to', 'date')] , rules: 'Newest first. Assembled server-side (UNION of the listed tables).' });
ep('members.memberships', 'GET', '/members/:id/memberships', [Mo, F, O], 'Members', 'V', 'All membership terms of a member (plan changes, renewals, expiries).', { reqs: ['FR-MEM-004', 'FR-MEM-005'], res: 'MembershipView[]', tables: ['memberships', 'membership_plans'], errors: ['MEMBER_NOT_FOUND'] });

// =================================================================================== MEMBERSHIPS
ep('memberships.plans', 'GET', '/memberships/plans', PUB, 'Membership plans', 'V', 'Gold / Silver / Junior plans with price, benefits and discounts.', {
  reqs: ['FR-PUB-002', 'FR-MEM-011'], res: 'MembershipPlan[]', tables: ['membership_plans'], query: [f('include_inactive', 'bool', 0, 'OWNER_ADMIN only')] });
ep('memberships.planCreate', 'POST', '/memberships/plans', O, 'Membership plans', 'C', 'Create a plan.', {
  reqs: ['FR-MEM-011'], res: 'MembershipPlan', tables: ['membership_plans'],
  body: [f('membership_type', 'enum:MEMBERSHIP_TYPE', 1), f('name', 'string', 1), f('description', 'text'), f('duration_months', 'int', 1, '>0'), f('price', 'money', 1), f('court_discount_percent', 'percent', 0, '0-100; 100 = free courts'), f('shop_discount_percent', 'percent'), f('bar_discount_percent', 'percent'), f('max_plays_per_day', 'int', 0, 'default 2'), f('min_age', 'int'), f('max_age', 'int'), f('benefits', 'array:string'), f('sort_order', 'int')],
  rules: 'UNIQUE (membership_type, duration_months). Violations return VALIDATION_ERROR.' });
ep('memberships.planUpdate', 'PATCH', '/memberships/plans/:id', O, 'Membership plans', 'U', 'Edit a plan. Existing memberships keep their snapshot (prices are copied to bookings/orders at transaction time).', {
  reqs: ['FR-MEM-011'], res: 'MembershipPlan', tables: ['membership_plans'], errors: ['MEMBERSHIP_PLAN_NOT_FOUND'],
  body: [f('name', 'string'), f('description', 'text'), f('price', 'money'), f('court_discount_percent', 'percent'), f('shop_discount_percent', 'percent'), f('bar_discount_percent', 'percent'), f('max_plays_per_day', 'int'), f('benefits', 'array:string'), f('sort_order', 'int'), f('is_active', 'bool')] });
ep('memberships.purchase', 'POST', '/memberships', [Mo, F, O], 'Memberships', 'C', 'Buy or renew a membership. Records the payment.', {
  reqs: ['FR-MEM-007', 'FR-MEM-012', 'FR-FIN-001'], res: 'MembershipPurchaseResult', tables: ['memberships', 'payments'], guest: false,
  errors: ['MEMBER_NOT_FOUND', 'MEMBERSHIP_PLAN_NOT_FOUND', 'MEMBERSHIP_ALREADY_ACTIVE', 'JUNIOR_AGE_INVALID', 'PAYMENT_FAILED'],
  body: [f('member_id', 'uuid', 0, 'Staff only; MEMBER callers: implied = self'), f('membership_plan_id', 'uuid', 1), method(1, 'MEMBER callers must use ONLINE'), f('gateway_reference', 'string')],
  rules: 'No current term: new ACTIVE membership starting today. Current term ends within `membership_expiry_warning_days`: new term is UPCOMING and starts the day after the current end_date. Otherwise MEMBERSHIP_ALREADY_ACTIVE. end_date = start_date + duration_months - 1 day.' });
ep('memberships.changePlan', 'POST', '/memberships/:id/change-plan', [F, O], 'Memberships', 'U', 'Upgrade / downgrade: closes the current term and starts a new one on the new plan.', {
  reqs: ['FR-MEM-008', 'FR-MEM-012', 'FR-FIN-001'], res: 'MembershipPurchaseResult', tables: ['memberships', 'payments'], guest: false,
  errors: ['MEMBERSHIP_NOT_FOUND', 'MEMBERSHIP_PLAN_NOT_FOUND', 'MEMBERSHIP_EXPIRED', 'JUNIOR_AGE_INVALID', 'INVALID_STATUS_TRANSITION', 'PAYMENT_FAILED'],
  body: [f('new_membership_plan_id', 'uuid', 1), method(1)],
  rules: 'Only an ACTIVE term can be changed (an EXPIRED one => MEMBERSHIP_EXPIRED: buy a new membership instead). Old row -> status CHANGED, end_date = yesterday. New row: status ACTIVE, start_date = today, previous_membership_id = old.id, full new-plan price charged (no pro-rata; see ASSUMPTIONS A-07). Future bookings keep their already-snapshotted price.' });
ep('memberships.cancel', 'POST', '/memberships/:id/cancel', O, 'Memberships', 'U', 'Cancel a membership (no automatic refund).', { reqs: ['FR-MEM-009'], res: 'MembershipView', tables: ['memberships'], errors: ['MEMBERSHIP_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('reason', 'text', 1)] });
ep('memberships.expiring', 'GET', '/memberships/expiring', [F, O], 'Memberships', 'V', 'Members whose current term ends soon (default window = membership_expiry_warning_days).', {
  reqs: ['FR-MEM-006', 'FR-MEM-005'], res: 'MemberSummary[]', tables: ['memberships', 'members'], query: [f('days', 'int', 0, '1-365')] });
ep('memberships.runExpiry', 'POST', '/memberships/run-expiry', O, 'Memberships', 'U', 'Idempotent maintenance job: ACTIVE past end_date -> EXPIRED, UPCOMING reaching start_date -> ACTIVE, sends expiry notifications. Also called by a daily scheduler.', {
  reqs: ['FR-MEM-010', 'FR-NOTIF-003'], res: 'ExpiryRunResult', tables: ['memberships', 'notifications'], status: 200 });

// =================================================================================== COURTS
ep('courts.list', 'GET', '/courts', PUB, 'Courts', 'V', 'Court catalogue.', { reqs: ['FR-COURT-001', 'FR-PUB-003'], res: 'Court[]', tables: ['courts'], query: [f('sport_type', 'enum:SPORT_TYPE'), f('include_inactive', 'bool', 0, 'staff only')] });
ep('courts.availability', 'GET', '/courts/availability', PUB, 'Courts', 'V', 'Slot grid per court for one day: a slot every 30 min, each a 1-hour session.', {
  reqs: ['FR-COURT-002', 'FR-COURT-003', 'FR-PUB-003'], res: 'CourtAvailability[]', tables: ['courts', 'court_bookings', 'social_sessions'], errors: ['COURT_NOT_FOUND'],
  query: [f('date', 'date', 1, 'today .. today+60d (IST)'), f('sport_type', 'enum:SPORT_TYPE'), f('court_id', 'uuid')],
  rules: 'Slots: first start = club_open_time, last start = club_close_time - 1h, step 30 min. Status PAST for starts before now. SOCIAL slots expose spots_left. `booking_id` only for FRONT_DESK/OWNER_ADMIN; never expose who booked.' });
ep('courts.create', 'POST', '/courts', O, 'Courts', 'C', 'Add a court.', { reqs: ['FR-COURT-015'], res: 'Court', tables: ['courts'], body: [f('name', 'string', 1, 'unique'), f('sport_type', 'enum:SPORT_TYPE', 1), f('description', 'text'), f('surface', 'string'), f('walk_in_rate_per_hour', 'money', 1), f('image_url', 'url'), f('sort_order', 'int')] });
ep('courts.update', 'PATCH', '/courts/:id', O, 'Courts', 'U', 'Edit court / change rate / deactivate.', { reqs: ['FR-COURT-015'], res: 'Court', tables: ['courts'], errors: ['COURT_NOT_FOUND'], body: [f('name', 'string'), f('description', 'text'), f('surface', 'string'), f('walk_in_rate_per_hour', 'money'), f('image_url', 'url'), f('sort_order', 'int'), f('is_active', 'bool')] });
ep('courts.block', 'POST', '/courts/:id/blocks', O, 'Courts', 'C', 'Block a court for maintenance (creates 1-hour MAINTENANCE bookings covering the range).', {
  reqs: ['FR-COURT-013'], res: 'BookingDetail[]', tables: ['court_bookings'], errors: ['COURT_NOT_FOUND', 'BOOKING_CONFLICT', 'INVALID_SLOT'],
  body: [f('start_at', 'datetime', 1, 'on a 30-min boundary'), f('end_at', 'datetime', 1, 'multiple of 1h after start_at'), f('reason', 'string')], rules: 'Fails with BOOKING_CONFLICT (and creates nothing) if any hour overlaps a live booking.' });
ep('courts.unblock', 'DELETE', '/courts/blocks/:booking_id', O, 'Courts', 'D', 'Remove a maintenance block (sets the MAINTENANCE booking to CANCELLED).', { reqs: ['FR-COURT-013'], res: 'BookingDetail', tables: ['court_bookings'], errors: ['BOOKING_NOT_FOUND'] });

// =================================================================================== BOOKINGS
ep('bookings.price', 'GET', '/bookings/price', [M, F, O], 'Court bookings', 'V', 'Price preview before confirming (applies the member plan discount and shows plays used today).', {
  reqs: ['FR-COURT-012', 'FR-COURT-007'], res: 'PriceBreakdown', tables: ['courts', 'memberships', 'membership_plans'], errors: ['COURT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INVALID_SLOT'], guest: true,
  query: [f('court_id', 'uuid', 1), f('start_at', 'datetime', 1), f('member_id', 'uuid', 0, 'staff only; omit for walk-in pricing')] });
ep('bookings.create', 'POST', '/bookings', [M, F, O], 'Court bookings', 'C', 'Book a court (member self-service, or staff for a member / walk-in / phone caller).', {
  reqs: ['FR-COURT-004', 'FR-COURT-005', 'FR-COURT-006', 'FR-COURT-007', 'FR-COURT-008', 'FR-COURT-009', 'FR-COURT-003'], res: 'BookingDetail', tables: ['court_bookings', 'payments', 'notifications'], guest: true,
  errors: ['COURT_NOT_FOUND', 'MEMBER_NOT_FOUND', 'INVALID_SLOT', 'COURT_UNAVAILABLE', 'BOOKING_CONFLICT', 'DAILY_BOOKING_LIMIT', 'PAYMENT_FAILED'],
  body: [f('court_id', 'uuid', 1), f('start_at', 'datetime', 1, 'on a :00/:30 boundary, in the future, session must end by club_close_time'), memberRef, guestName, guestPhone, method(0, 'omit = pay later at the desk (payment_status PENDING). MEMBER callers pay ONLINE or later at desk.'), f('notes', 'text')],
  rules: 'Transaction: lock member (advisory) -> check plays-per-day (REGULAR + joined social, IST day, max = plan.max_plays_per_day, default 2) -> compute price -> INSERT (DB exclusion constraint `court_bookings_no_overlap` is the final arbiter; map SQLSTATE 23P01 to BOOKING_CONFLICT) -> optional payment. Expired/no membership => customer_type MEMBER but walk-in price. Free (amount_due 0) => payment_status NOT_REQUIRED.' });
ep('bookings.list', 'GET', '/bookings', [Mo, F, O], 'Court bookings', 'V', 'List bookings (day view for the desk, own bookings for a member).', {
  reqs: ['FR-COURT-011', 'FR-COURT-016'], res: 'Page<BookingDetail>', tables: ['court_bookings', 'courts', 'members'], guest: true,
  query: [f('from', 'date'), f('to', 'date'), f('court_id', 'uuid'), f('member_id', 'uuid', 0, 'staff only'), f('status', 'enum:BOOKING_STATUS'), f('booking_type', 'enum:BOOKING_TYPE'), f('upcoming', 'bool', 0, 'true = start_at >= now')] });
ep('bookings.get', 'GET', '/bookings/:id', [Mo, F, O], 'Court bookings', 'V', 'Booking detail.', { reqs: ['FR-COURT-011', 'FR-COURT-016'], res: 'BookingDetail', tables: ['court_bookings'], errors: ['BOOKING_NOT_FOUND'] });
ep('bookings.cancel', 'POST', '/bookings/:id/cancel', [Mo, F, O], 'Court bookings', 'U', 'Cancel a booking before it starts; frees the slot and refunds per policy.', {
  reqs: ['FR-COURT-010'], res: 'BookingCancelResult', tables: ['court_bookings', 'payments', 'notifications'], guest: true, errors: ['BOOKING_NOT_FOUND', 'BOOKING_NOT_CANCELLABLE', 'INVALID_STATUS_TRANSITION'],
  body: [f('reason', 'text'), f('refund', 'bool', 0, 'staff only: override policy (default: refund if start_at - now >= cancellation_cutoff_hours)')],
  rules: 'Only CONFIRMED/PENDING and start_at in the future. Member callers: own bookings only, and policy decides the refund. Refund = SUCCEEDED payment refunded in full (payments.status REFUNDED) and booking.payment_status REFUNDED.' });
ep('bookings.complete', 'POST', '/bookings/:id/complete', [F, O], 'Court bookings', 'U', 'Mark a booking COMPLETED (also done automatically by the daily job after end_at).', { reqs: ['FR-COURT-014'], res: 'BookingDetail', tables: ['court_bookings'], errors: ['BOOKING_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });

// =================================================================================== SOCIAL PLAY
ep('social.list', 'GET', '/social-play/sessions', PUB, 'Social play', 'V', 'Upcoming Friday social-play sessions with spots left.', { reqs: ['FR-SOC-002', 'FR-PUB-008'], res: 'SocialSessionView[]', tables: ['social_sessions', 'court_bookings', 'social_session_participants'], query: [f('from', 'date'), f('to', 'date'), f('status', 'enum:SOCIAL_SESSION_STATUS')] });
ep('social.get', 'GET', '/social-play/sessions/:id', [M, F, O], 'Social play', 'V', 'Session detail including participants.', { reqs: ['FR-SOC-002'], res: 'SocialSessionView', tables: ['social_sessions', 'social_session_participants'], errors: ['SOCIAL_SESSION_NOT_FOUND'] });
ep('social.create', 'POST', '/social-play/sessions', [F, O], 'Social play', 'C', 'Open a court for social play (holds the court via a SOCIAL_SESSION booking).', {
  reqs: ['FR-SOC-001', 'FR-SOC-005'], res: 'SocialSessionView', tables: ['social_sessions', 'court_bookings'], errors: ['COURT_NOT_FOUND', 'SOCIAL_PLAY_NOT_ALLOWED', 'BOOKING_CONFLICT', 'INVALID_SLOT'],
  body: [f('court_id', 'uuid', 1), f('start_at', 'datetime', 1, 'must fall on social_play_weekday (IST) inside the social-play window'), f('title', 'string', 1), f('description', 'text'), f('capacity', 'int', 1, '>=2'), f('fee_per_person', 'money', 1, '>=0; tax-inclusive guest fee')] });
ep('social.join', 'POST', '/social-play/sessions/:id/join', [M, F, O], 'Social play', 'C', 'Join a session (member self-service, or staff for a member / guest).', {
  reqs: ['FR-SOC-003', 'FR-SOC-005', 'FR-SOC-007', 'FR-COURT-008'], res: 'ParticipantView', tables: ['social_session_participants', 'payments'], guest: true,
  errors: ['SOCIAL_SESSION_NOT_FOUND', 'SOCIAL_SESSION_FULL', 'ALREADY_JOINED', 'DAILY_BOOKING_LIMIT', 'MEMBER_NOT_FOUND', 'PAYMENT_FAILED'],
  body: [memberRef, guestName, guestPhone, method(0, 'omit = pay later at desk')],
  rules: 'Fee = fee_per_person minus the member plan court_discount_percent (expired/no plan: full fee). Capacity check and insert in one transaction with a row lock on the session. Counts toward the member daily plays limit.' });
ep('social.leave', 'POST', '/social-play/sessions/:id/leave', [Mo, F, O], 'Social play', 'U', 'Leave a session (refund per cancellation policy).', {
  reqs: ['FR-SOC-004'], res: 'ParticipantView', tables: ['social_session_participants', 'payments'], guest: true, errors: ['SOCIAL_SESSION_NOT_FOUND', 'NOT_A_PARTICIPANT', 'BOOKING_NOT_CANCELLABLE'],
  body: [f('participant_id', 'uuid', 0, 'staff only; required for staff callers')] });
ep('social.cancel', 'POST', '/social-play/sessions/:id/cancel', [F, O], 'Social play', 'U', 'Cancel the whole session; releases the court and refunds all participants.', {
  reqs: ['FR-SOC-006'], res: 'SocialSessionView', tables: ['social_sessions', 'court_bookings', 'social_session_participants', 'payments'], errors: ['SOCIAL_SESSION_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('reason', 'text')] });

// =================================================================================== SHOP
ep('shop.products', 'GET', '/shop/products', PUB, 'Shop catalogue', 'V', 'Browse products (stock_status for everyone; exact quantities for staff).', {
  reqs: ['FR-SHOP-001', 'FR-PUB-004', 'FR-SHOP-008'], res: 'Page<ProductView>', tables: ['products'],
  query: [f('category', 'enum:PRODUCT_CATEGORY'), f('q', 'string'), f('in_stock', 'bool'), f('include_inactive', 'bool', 0, 'OWNER_ADMIN only')], rules: '`member_price` is included when the caller is a MEMBER with a current plan.' });
ep('shop.product', 'GET', '/shop/products/:id', PUB, 'Shop catalogue', 'V', 'Product detail.', { reqs: ['FR-SHOP-001'], res: 'ProductView', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'] });
ep('shop.productCreate', 'POST', '/shop/products', O, 'Shop catalogue', 'C', 'Create a product (optionally with opening stock).', {
  reqs: ['FR-SHOP-002', 'FR-INV-003'], res: 'ProductView', tables: ['products', 'inventory_movements'], errors: ['SKU_TAKEN'],
  body: [f('sku', 'string', 1, 'unique'), f('name', 'string', 1), f('category', 'enum:PRODUCT_CATEGORY', 1), f('brand', 'string'), f('description', 'text'), f('price', 'money', 1, 'tax-inclusive'), f('image_url', 'url'), f('initial_stock', 'int', 0, '>=0; creates an OPENING inventory movement'), f('low_stock_threshold', 'int', 0, 'default = setting low_stock_default_threshold')] });
ep('shop.productUpdate', 'PATCH', '/shop/products/:id', O, 'Shop catalogue', 'U', 'Edit a product. Stock is NEVER edited here: use /inventory/adjustments.', {
  reqs: ['FR-SHOP-002'], res: 'ProductView', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'],
  body: [f('name', 'string'), f('category', 'enum:PRODUCT_CATEGORY'), f('brand', 'string'), f('description', 'text'), f('price', 'money'), f('image_url', 'url'), f('low_stock_threshold', 'int'), f('is_active', 'bool')] });
ep('shop.productDelete', 'DELETE', '/shop/products/:id', O, 'Shop catalogue', 'D', 'Retire a product (soft delete: is_active = false; order history stays intact).', { reqs: ['FR-SHOP-002'], res: 'ProductView', tables: ['products'], errors: ['PRODUCT_NOT_FOUND'] });
ep('shop.orderCreate', 'POST', '/shop/orders', [M, F, O], 'Shop orders', 'C', 'Place a shop order: member online order (pickup/delivery) or staff counter sale.', {
  reqs: ['FR-SHOP-003', 'FR-SHOP-004', 'FR-SHOP-005', 'FR-SHOP-006', 'FR-SHOP-007', 'FR-SHOP-008', 'FR-INV-001', 'FR-FIN-001'], res: 'ShopOrderDetail', tables: ['shop_orders', 'shop_order_items', 'products', 'inventory_movements', 'payments'], guest: true,
  errors: ['PRODUCT_NOT_FOUND', 'OUT_OF_STOCK', 'DELIVERY_ADDRESS_REQUIRED', 'MEMBER_NOT_FOUND', 'PAYMENT_FAILED'],
  body: [f('items', 'object[]', 1, '1-50 lines; duplicate products are merged', [f('product_id', 'uuid', 1), f('quantity', 'int', 1, '1-99')]), f('fulfillment', 'enum:ORDER_FULFILLMENT', 1, 'MEMBER: PICKUP|DELIVERY. Staff: IN_STORE'), f('delivery_address', 'text', 0, 'required when fulfillment = DELIVERY'), memberRef, guestName, guestPhone, method(0, 'MEMBER: ONLINE. Staff counter sale: CASH|CARD|UPI (required for IN_STORE)'), f('notes', 'text')],
  rules: 'channel = ONLINE for MEMBER callers, PHYSICAL for staff (server-derived, not sent). One transaction: `UPDATE products SET stock_quantity = stock_quantity - :q WHERE id = :id AND stock_quantity >= :q` per line (0 rows => OUT_OF_STOCK, rollback) + inventory_movements(SALE) + snapshot unit_price + discount = subtotal x shop_discount_percent + delivery_fee (unless free_delivery_above) + payment. Raising stock below threshold creates LOW_STOCK notifications. IN_STORE orders are created COMPLETED; ONLINE start PLACED.' });
ep('shop.orderList', 'GET', '/shop/orders', [Mo, F, O], 'Shop orders', 'V', 'List shop orders (members see their own).', {
  reqs: ['FR-SHOP-011', 'FR-SHOP-009'], res: 'Page<ShopOrderDetail>', tables: ['shop_orders', 'shop_order_items'], guest: true,
  query: [f('status', 'enum:SHOP_ORDER_STATUS'), f('channel', 'enum:ORDER_CHANNEL'), f('fulfillment', 'enum:ORDER_FULFILLMENT'), f('member_id', 'uuid', 0, 'staff only'), f('from', 'date'), f('to', 'date')] });
ep('shop.orderGet', 'GET', '/shop/orders/:id', [Mo, F, O], 'Shop orders', 'V', 'Order detail with lines.', { reqs: ['FR-SHOP-011', 'FR-SHOP-009'], res: 'ShopOrderDetail', tables: ['shop_orders'], errors: ['ORDER_NOT_FOUND'] });
ep('shop.orderStatus', 'PATCH', '/shop/orders/:id/status', [F, O], 'Shop orders', 'U', 'Advance an order: PLACED -> CONFIRMED -> READY_FOR_PICKUP | OUT_FOR_DELIVERY -> COMPLETED.', {
  reqs: ['FR-SHOP-009', 'FR-SHOP-005', 'FR-SHOP-006'], res: 'ShopOrderDetail', tables: ['shop_orders', 'notifications'], errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('status', 'enum:SHOP_ORDER_STATUS', 1, 'must be allowed by SHOP_ORDER_TRANSITIONS; READY_FOR_PICKUP only for PICKUP orders, OUT_FOR_DELIVERY only for DELIVERY orders')], rules: 'Use /shop/orders/:id/cancel for cancellations. Notifies the member (SHOP_ORDER_UPDATE).' });
ep('shop.orderCancel', 'POST', '/shop/orders/:id/cancel', [Mo, F, O], 'Shop orders', 'U', 'Cancel an order: restores stock and refunds.', {
  reqs: ['FR-SHOP-010', 'FR-INV-001'], res: 'ShopOrderDetail', tables: ['shop_orders', 'products', 'inventory_movements', 'payments'], guest: true, errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('reason', 'text')], rules: 'MEMBER may cancel only own order while PLACED. Staff while not COMPLETED/CANCELLED. Inserts inventory_movements(CANCELLATION), refunds payment, payment_status REFUNDED.' });

// =================================================================================== INVENTORY
ep('inventory.list', 'GET', '/inventory', [F, O], 'Inventory', 'V', 'Stock levels for every product (same shelf for counter and online).', {
  reqs: ['FR-INV-001', 'FR-INV-002'], res: 'Page<InventoryItem>', tables: ['products'], query: [f('category', 'enum:PRODUCT_CATEGORY'), f('low_stock_only', 'bool'), f('q', 'string')] });
ep('inventory.lowStock', 'GET', '/inventory/low-stock', [F, O], 'Inventory', 'V', 'Products at or below their low-stock threshold (includes out of stock).', { reqs: ['FR-INV-002'], res: 'InventoryItem[]', tables: ['products'], rules: 'stock_quantity <= low_stock_threshold AND is_active. stock_status: 0 => OUT_OF_STOCK, <= threshold => LOW_STOCK, else IN_STOCK.' });
ep('inventory.adjust', 'POST', '/inventory/adjustments', O, 'Inventory', 'C', 'Restock or correct stock; always writes a ledger row.', {
  reqs: ['FR-INV-003', 'FR-INV-005'], res: 'StockAdjustmentResult', tables: ['products', 'inventory_movements', 'notifications'], errors: ['PRODUCT_NOT_FOUND'],
  body: [f('product_id', 'uuid', 1), f('quantity_change', 'int', 1, 'non-zero; negative allowed only if result stays >= 0 (else VALIDATION_ERROR)'), f('reason', 'enum:INVENTORY_REASON', 1, 'RESTOCK | ADJUSTMENT | DAMAGE | RETURN only'), f('notes', 'text')] });
ep('inventory.movements', 'GET', '/inventory/movements', O, 'Inventory', 'V', 'Stock ledger.', { reqs: ['FR-INV-004'], res: 'Page<InventoryMovementView>', tables: ['inventory_movements', 'products'], query: [f('product_id', 'uuid'), f('reason', 'enum:INVENTORY_REASON'), f('from', 'date'), f('to', 'date')] });

// =================================================================================== BAR
ep('bar.menu', 'GET', '/bar/menu', PUB, 'Bar menu', 'V', 'Bar & cafeteria menu.', { reqs: ['FR-BAR-001', 'FR-PUB-005'], res: 'BarMenuItem[]', tables: ['bar_menu_items'], query: [f('category', 'enum:MENU_CATEGORY'), f('include_unavailable', 'bool', 0, 'staff only')] });
ep('bar.menuCreate', 'POST', '/bar/menu-items', O, 'Bar menu', 'C', 'Add a menu item.', { reqs: ['FR-BAR-011'], res: 'BarMenuItem', tables: ['bar_menu_items'], body: [f('name', 'string', 1, 'unique'), f('category', 'enum:MENU_CATEGORY', 1), f('description', 'text'), f('price', 'money', 1, 'tax-inclusive'), f('sort_order', 'int')] });
ep('bar.menuUpdate', 'PATCH', '/bar/menu-items/:id', O, 'Bar menu', 'U', 'Edit a menu item / mark unavailable.', { reqs: ['FR-BAR-011'], res: 'BarMenuItem', tables: ['bar_menu_items'], errors: ['MENU_ITEM_NOT_FOUND'], body: [f('name', 'string'), f('category', 'enum:MENU_CATEGORY'), f('description', 'text'), f('price', 'money'), f('is_available', 'bool'), f('sort_order', 'int')] });
ep('bar.tables', 'GET', '/bar/tables', [F, K, O], 'Bar tables', 'V', 'Tables with live status, open tab and active order count.', { reqs: ['FR-BAR-002'], res: 'BarTableView[]', tables: ['bar_tables', 'bar_tabs', 'bar_orders'] });
ep('bar.tableCreate', 'POST', '/bar/tables', O, 'Bar tables', 'C', 'Add a table.', { reqs: ['FR-BAR-002'], res: 'BarTable', tables: ['bar_tables'], body: [f('label', 'string', 1, 'unique'), f('capacity', 'int', 1, '>0')] });
ep('bar.tableUpdate', 'PATCH', '/bar/tables/:id', [F, O], 'Bar tables', 'U', 'Set table status (e.g. free it, mark out of service).', { reqs: ['FR-BAR-002'], res: 'BarTable', tables: ['bar_tables'], errors: ['TABLE_NOT_FOUND', 'TABLE_OCCUPIED'], body: [f('status', 'enum:TABLE_STATUS'), f('label', 'string', 0, 'OWNER_ADMIN only'), f('capacity', 'int', 0, 'OWNER_ADMIN only')], rules: 'Cannot set AVAILABLE while the table has an OPEN tab or an active order.' });
ep('bar.orderCreate', 'POST', '/bar/orders', [F, O], 'Bar orders', 'C', 'Take a bar/cafeteria order at a table (or counter). Appears instantly on the kitchen board.', {
  reqs: ['FR-BAR-003', 'FR-BAR-004', 'FR-BAR-005', 'FR-BAR-008', 'FR-BAR-013', 'FR-KIT-001'], res: 'BarOrderDetail', tables: ['bar_orders', 'bar_order_items', 'order_status_events', 'bar_tables', 'payments'], guest: true,
  errors: ['TABLE_NOT_FOUND', 'TABLE_OCCUPIED', 'TAB_NOT_FOUND', 'TAB_NOT_OPEN', 'MENU_ITEM_NOT_FOUND', 'MENU_ITEM_UNAVAILABLE', 'MEMBER_NOT_FOUND', 'PAYMENT_FAILED'],
  body: [f('bar_table_id', 'uuid'), f('bar_tab_id', 'uuid', 0, 'add to an OPEN tab; member/guest then inherited from the tab'), memberRef, f('guest_name', 'string'), f('items', 'object[]', 1, '1-50 lines', [f('bar_menu_item_id', 'uuid', 1), f('quantity', 'int', 1, '1-50'), f('notes', 'string')]), method(0, 'pay now (CASH|CARD|UPI); omit to leave PENDING or put on a tab'), f('notes', 'text')],
  rules: 'At least one of bar_table_id, member_id, guest_name, bar_tab_id. Member discount = subtotal x bar_discount_percent of the member\'s CURRENT plan (automatic; never asked). Guests pay list price. Snapshot unit_price + item_name. Writes order_status_events(null -> NEW). Table -> OCCUPIED. payment_method with a bar_tab_id is a VALIDATION_ERROR (tab payments happen at settlement).' });
ep('bar.orderList', 'GET', '/bar/orders', [Mo, F, O], 'Bar orders', 'V', 'List bar orders (members see their own).', {
  reqs: ['FR-BAR-012', 'FR-BAR-009'], res: 'Page<BarOrderDetail>', tables: ['bar_orders', 'bar_order_items'], guest: true,
  query: [f('status', 'enum:ORDER_STATUS'), f('payment_status', 'enum:PAYMENT_STATUS'), f('bar_table_id', 'uuid'), f('bar_tab_id', 'uuid'), f('member_id', 'uuid', 0, 'staff only'), f('from', 'date'), f('to', 'date')] });
ep('bar.orderGet', 'GET', '/bar/orders/:id', [Mo, F, O], 'Bar orders', 'V', 'Bar order detail.', { reqs: ['FR-BAR-012'], res: 'BarOrderDetail', tables: ['bar_orders'], errors: ['ORDER_NOT_FOUND'] });
ep('bar.orderCancel', 'POST', '/bar/orders/:id/cancel', [F, O], 'Bar orders', 'U', 'Cancel a bar order while it is NEW or ACCEPTED.', { reqs: ['FR-BAR-010'], res: 'BarOrderDetail', tables: ['bar_orders', 'order_status_events', 'payments'], guest: true, errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('reason', 'text', 1)], rules: 'Refunds a payment if the order was already paid. Frees the table if it was the last active order.' });
ep('bar.tabOpen', 'POST', '/bar/tabs', [F, O], 'Bar tabs', 'C', 'Open a tab for a member or guest so they can order now and settle before leaving.', {
  reqs: ['FR-BAR-006', 'FR-BAR-013'], res: 'BarTabDetail', tables: ['bar_tabs', 'bar_tables'], guest: true, errors: ['TABLE_NOT_FOUND', 'TABLE_OCCUPIED', 'MEMBER_NOT_FOUND'],
  body: [f('bar_table_id', 'uuid'), memberRef, f('guest_name', 'string', 0, 'required when no member_id')] });
ep('bar.tabList', 'GET', '/bar/tabs', [Mo, F, O], 'Bar tabs', 'V', 'List tabs.', { reqs: ['FR-BAR-006', 'FR-BAR-012'], res: 'Page<BarTabDetail>', tables: ['bar_tabs'], guest: true, query: [f('status', 'enum:TAB_STATUS'), f('member_id', 'uuid', 0, 'staff only'), f('from', 'date'), f('to', 'date')] });
ep('bar.tabGet', 'GET', '/bar/tabs/:id', [Mo, F, O], 'Bar tabs', 'V', 'Tab with its orders and live running total.', { reqs: ['FR-BAR-006', 'FR-BAR-012'], res: 'BarTabDetail', tables: ['bar_tabs', 'bar_orders'], errors: ['TAB_NOT_FOUND'] });
ep('bar.tabSettle', 'POST', '/bar/tabs/:id/settle', [F, O], 'Bar tabs', 'U', 'Settle a tab: one payment for the whole tab, orders marked PAID, table freed.', {
  reqs: ['FR-BAR-007', 'FR-BAR-008', 'FR-FIN-001'], res: 'BarSettleResult', tables: ['bar_tabs', 'bar_orders', 'payments', 'bar_tables'], guest: true,
  errors: ['TAB_NOT_FOUND', 'TAB_NOT_OPEN', 'TAB_HAS_ACTIVE_ORDERS', 'PAYMENT_FAILED'], body: [method(1, 'CASH | CARD | UPI')],
  rules: 'Allowed only when every non-cancelled order is SERVED (else TAB_HAS_ACTIVE_ORDERS). Writes subtotal/discount/tax/total to bar_tabs, payment (source_type TAB, category BAR), tab SETTLED. Amount = sum of order totals; client cannot override it.' });
ep('bar.tabVoid', 'POST', '/bar/tabs/:id/void', O, 'Bar tabs', 'U', 'Void a tab that has no billable orders.', { reqs: ['FR-BAR-006'], res: 'BarTabDetail', tables: ['bar_tabs'], errors: ['TAB_NOT_FOUND', 'TAB_NOT_OPEN', 'TAB_HAS_ACTIVE_ORDERS'] });
ep('bar.dailySummary', 'GET', '/bar/daily-summary', [F, O], 'Bar orders', 'V', 'What the bar earned on a day: revenue by method, discounts, open tabs, who was on shift.', { reqs: ['FR-BAR-009'], res: 'BarDailySummary', tables: ['payments', 'bar_orders', 'bar_tabs', 'staff_shifts'], query: [f('date', 'date', 0, 'default today (IST)')] });

// =================================================================================== KITCHEN
ep('kitchen.list', 'GET', '/kitchen/orders', [K, O], 'Kitchen orders', 'V', 'Kitchen board: incoming and in-progress orders (oldest first). No prices, no payment data.', {
  reqs: ['FR-KIT-001', 'FR-KIT-002', 'FR-KIT-004'], res: 'KitchenOrder[]', tables: ['bar_orders', 'bar_order_items', 'bar_tables'], query: [f('status', 'array:enum:ORDER_STATUS', 0, 'default NEW,ACCEPTED,PREPARING,READY'), f('date', 'date', 0, 'default today')], rules: 'Client polls every 5 s (see ADR-010). Projection only: never include unit_price, totals, member discount or payment fields.' });
ep('kitchen.get', 'GET', '/kitchen/orders/:id', [K, O], 'Kitchen orders', 'V', 'One kitchen order.', { reqs: ['FR-KIT-002'], res: 'KitchenOrder', tables: ['bar_orders'], errors: ['ORDER_NOT_FOUND'] });
ep('kitchen.status', 'PATCH', '/kitchen/orders/:id/status', [K, O], 'Kitchen orders', 'U', 'Move an order forward: NEW -> ACCEPTED -> PREPARING -> READY -> SERVED (or reject NEW/ACCEPTED with CANCELLED).', {
  reqs: ['FR-KIT-003', 'FR-KIT-005', 'FR-KIT-006', 'FR-NOTIF-003'], res: 'KitchenOrder', tables: ['bar_orders', 'order_status_events', 'notifications', 'bar_tables'], errors: ['ORDER_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('status', 'enum:ORDER_STATUS', 1, 'next status per ORDER_TRANSITIONS'), f('note', 'string', 0, 'required when status = CANCELLED (reason)')], rules: 'Writes order_status_events. READY sets ready_at and notifies the staff member who took the order (ORDER_READY); SERVED sets served_at. CANCELLED sets cancelled_at/cancellation_reason.' });

// =================================================================================== ENQUIRIES
ep('enquiries.create', 'POST', '/enquiries', [PUB, F, O], 'Enquiries', 'C', 'Submit an enquiry or trial-session request. Public callers are forced to source WEBSITE; staff log PHONE / WALK_IN enquiries.', {
  reqs: ['FR-ENQ-001', 'FR-ENQ-002', 'FR-ENQ-003', 'FR-ENQ-008', 'FR-PUB-006'], res: 'EnquiryView', tables: ['enquiries', 'notifications'], guest: true, errors: ['MEMBERSHIP_PLAN_NOT_FOUND'],
  body: [f('name', 'string', 1), f('phone', 'phone', 1), f('email', 'email'), f('enquiry_type', 'enum:ENQUIRY_TYPE', 0, 'default GENERAL'), f('message', 'text'), f('membership_plan_id', 'uuid'), f('sport_type', 'enum:SPORT_TYPE', 0, 'TRIAL'), f('preferred_start_at', 'datetime', 0, 'TRIAL: must be in the future'), f('source', 'enum:ENQUIRY_SOURCE', 0, 'staff only: PHONE | WALK_IN')],
  rules: 'Creates status NEW and a NEW_ENQUIRY notification for every active FRONT_DESK and OWNER_ADMIN user. Rate-limit public submissions (5/hour/IP).' });
ep('enquiries.summary', 'GET', '/enquiries/summary', [F, O], 'Enquiries', 'V', 'Funnel counts by status, conversion rate, follow-ups due.', { reqs: ['FR-ENQ-010'], res: 'EnquiryFunnel', tables: ['enquiries'], query: [f('from', 'date'), f('to', 'date')] });
ep('enquiries.list', 'GET', '/enquiries', [F, O], 'Enquiries', 'V', 'List and filter enquiries.', { reqs: ['FR-ENQ-004'], res: 'Page<EnquiryView>', tables: ['enquiries'], query: [f('status', 'enum:ENQUIRY_STATUS'), f('enquiry_type', 'enum:ENQUIRY_TYPE'), f('source', 'enum:ENQUIRY_SOURCE'), f('assigned_to_user_id', 'uuid'), f('follow_up_due', 'bool', 0, 'next_follow_up_at <= now and status open'), f('q', 'string')] });
ep('enquiries.get', 'GET', '/enquiries/:id', [F, O], 'Enquiries', 'V', 'Enquiry with follow-ups and quotes.', { reqs: ['FR-ENQ-004', 'FR-ENQ-005'], res: 'EnquiryDetail', tables: ['enquiries', 'enquiry_follow_ups', 'quotes'], errors: ['ENQUIRY_NOT_FOUND'] });
ep('enquiries.update', 'PATCH', '/enquiries/:id', [F, O], 'Enquiries', 'U', 'Assign, reschedule follow-up, change status. (CONVERTED only via /convert.)', {
  reqs: ['FR-ENQ-004', 'FR-ENQ-005'], res: 'EnquiryView', tables: ['enquiries'], errors: ['ENQUIRY_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('status', 'enum:ENQUIRY_STATUS', 0, 'per ENQUIRY_TRANSITIONS; not CONVERTED'), f('assigned_to_user_id', 'uuid'), f('next_follow_up_at', 'datetime'), f('lost_reason', 'text', 0, 'required when status = LOST'), f('name', 'string'), f('phone', 'phone'), f('email', 'email'), f('message', 'text')] });
ep('enquiries.followUp', 'POST', '/enquiries/:id/follow-ups', [F, O], 'Enquiries', 'C', 'Log a follow-up contact; optionally move the status and set the next follow-up.', {
  reqs: ['FR-ENQ-005'], res: 'EnquiryDetail', tables: ['enquiry_follow_ups', 'enquiries'], errors: ['ENQUIRY_NOT_FOUND', 'INVALID_STATUS_TRANSITION'],
  body: [f('method', 'enum:FOLLOW_UP_METHOD', 1), f('note', 'text', 1), f('next_follow_up_at', 'datetime'), f('new_status', 'enum:ENQUIRY_STATUS', 0, 'default: NEW -> CONTACTED')] });
ep('enquiries.quoteCreate', 'POST', '/enquiries/:id/quotes', [F, O], 'Enquiries', 'C', 'Create (and optionally send) a quote.', {
  reqs: ['FR-ENQ-006'], res: 'Quote', tables: ['quotes', 'enquiries'], errors: ['ENQUIRY_NOT_FOUND', 'MEMBERSHIP_PLAN_NOT_FOUND'],
  body: [f('membership_plan_id', 'uuid'), f('description', 'text', 1), f('amount', 'money', 1), f('valid_until', 'date', 1), f('send_now', 'bool', 0, 'true => status SENT and enquiry -> QUOTE_SENT')] });
ep('enquiries.quoteUpdate', 'PATCH', '/quotes/:id', [F, O], 'Enquiries', 'U', 'Mark a quote SENT / ACCEPTED / REJECTED / EXPIRED.', { reqs: ['FR-ENQ-006'], res: 'Quote', tables: ['quotes'], errors: ['QUOTE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('status', 'enum:QUOTE_STATUS', 1)] });
ep('enquiries.trialBooking', 'POST', '/enquiries/:id/trial-booking', [F, O], 'Enquiries', 'C', 'Book the trial session on a court for this enquiry (booking_type TRIAL, free).', {
  reqs: ['FR-ENQ-009', 'FR-ENQ-002'], res: 'BookingDetail', tables: ['court_bookings', 'enquiries'], errors: ['ENQUIRY_NOT_FOUND', 'COURT_NOT_FOUND', 'INVALID_SLOT', 'BOOKING_CONFLICT'],
  body: [f('court_id', 'uuid', 1), f('start_at', 'datetime', 1)] });
ep('enquiries.convert', 'POST', '/enquiries/:id/convert', [F, O], 'Enquiries', 'C', 'Convert an enquiry into a registered member with a membership.', {
  reqs: ['FR-ENQ-007', 'FR-MEM-001', 'FR-FIN-001'], res: 'EnquiryConvertResult', tables: ['enquiries', 'users', 'members', 'memberships', 'payments'], errors: ['ENQUIRY_NOT_FOUND', 'ENQUIRY_ALREADY_CONVERTED', 'EMAIL_TAKEN', 'MEMBERSHIP_PLAN_NOT_FOUND', 'JUNIOR_AGE_INVALID', 'PAYMENT_FAILED'],
  body: [f('email', 'email', 0, 'required if the enquiry has no email'), f('date_of_birth', 'date'), f('address', 'text'), f('initial_password', 'string'), f('membership_plan_id', 'uuid', 1), method(1)], rules: 'One transaction: member + membership + payment; enquiry.status = CONVERTED, converted_member_id set; accepted quote (if any) -> ACCEPTED.' });

// =================================================================================== BUSINESS CLIENTS + INVOICES
ep('clients.list', 'GET', '/business-clients', O, 'Business clients', 'V', 'Business clients with invoiced / paid / outstanding totals.', { reqs: ['FR-INVC-001'], res: 'Page<BusinessClientDetail>', tables: ['business_clients', 'invoices'], query: [f('q', 'string'), f('is_active', 'bool')] });
ep('clients.create', 'POST', '/business-clients', O, 'Business clients', 'C', 'Register a business client (optionally with a portal login).', {
  reqs: ['FR-INVC-001', 'FR-AUTH-007'], res: 'BusinessClientDetail', tables: ['business_clients', 'users'], errors: ['EMAIL_TAKEN'],
  body: [f('company_name', 'string', 1), f('contact_name', 'string', 1), f('email', 'email', 1), f('phone', 'phone'), f('gstin', 'string', 0, '15-char GSTIN'), f('billing_address', 'text'), f('notes', 'text'), f('create_login', 'bool', 0, 'true => creates users(role BUSINESS_CLIENT)'), f('initial_password', 'string', 0, 'required when create_login = true')] });
ep('clients.me', 'GET', '/business-clients/me', B, 'Business clients', 'V', 'Own client profile + totals (business dashboard header).', { reqs: ['FR-INVC-008'], res: 'BusinessClientDetail', tables: ['business_clients', 'invoices'], errors: ['BUSINESS_CLIENT_NOT_FOUND'] });
ep('clients.get', 'GET', '/business-clients/:id', O, 'Business clients', 'V', 'Client detail.', { reqs: ['FR-INVC-001'], res: 'BusinessClientDetail', tables: ['business_clients'], errors: ['BUSINESS_CLIENT_NOT_FOUND'] });
ep('clients.update', 'PATCH', '/business-clients/:id', O, 'Business clients', 'U', 'Edit a client.', { reqs: ['FR-INVC-001'], res: 'BusinessClientDetail', tables: ['business_clients'], errors: ['BUSINESS_CLIENT_NOT_FOUND'], body: [f('company_name', 'string'), f('contact_name', 'string'), f('email', 'email'), f('phone', 'phone'), f('gstin', 'string'), f('billing_address', 'text'), f('notes', 'text'), f('is_active', 'bool')] });
ep('invoices.list', 'GET', '/invoices', [Bo, Mo, O], 'Invoices', 'V', 'List invoices (a business client sees only theirs; a member only their membership invoices).', {
  reqs: ['FR-INVC-005', 'FR-INVC-008', 'FR-FIN-006', 'FR-INVC-009'], res: 'Page<InvoiceView>', tables: ['invoices'],
  query: [f('status', 'enum:INVOICE_STATUS'), f('invoice_type', 'enum:INVOICE_TYPE'), f('business_client_id', 'uuid', 0, 'OWNER_ADMIN only'), f('member_id', 'uuid', 0, 'OWNER_ADMIN only'), f('from', 'date'), f('to', 'date'), f('overdue', 'bool')], rules: 'OVERDUE is derived: due_date < today (IST) and amount_paid < total_amount and status in (SENT, PARTIALLY_PAID); the daily job persists it.' });
ep('invoices.create', 'POST', '/invoices', O, 'Invoices', 'C', 'Create a business-client or membership invoice.', {
  reqs: ['FR-INVC-002', 'FR-INVC-006', 'FR-INVC-003'], res: 'InvoiceDetail', tables: ['invoices', 'invoice_items'], errors: ['BUSINESS_CLIENT_NOT_FOUND', 'MEMBER_NOT_FOUND'],
  body: [f('invoice_type', 'enum:INVOICE_TYPE', 1), f('business_client_id', 'uuid', 0, 'required for BUSINESS'), f('member_id', 'uuid', 0, 'required for MEMBERSHIP'), f('issue_date', 'date', 0, 'default today'), f('due_date', 'date', 1, '>= issue_date'), f('items', 'object[]', 1, '>=1 line', [f('description', 'string', 1), f('quantity', 'int', 1), f('unit_price', 'money', 1, 'TAX-EXCLUSIVE')]), f('tax_rate', 'percent', 0, 'default setting tax_rate_business'), f('notes', 'text'), f('send_now', 'bool')],
  rules: 'Invoices are tax-EXCLUSIVE: subtotal = sum(line_total); tax_amount = round(subtotal x tax_rate / 100, 2); total_amount = subtotal + tax_amount.' });
ep('invoices.get', 'GET', '/invoices/:id', [Bo, Mo, O], 'Invoices', 'V', 'Invoice with lines, payments and outstanding amount.', { reqs: ['FR-INVC-005', 'FR-INVC-008'], res: 'InvoiceDetail', tables: ['invoices', 'invoice_items', 'payments'], errors: ['INVOICE_NOT_FOUND'] });
ep('invoices.update', 'PATCH', '/invoices/:id', O, 'Invoices', 'U', 'Edit a DRAFT invoice.', { reqs: ['FR-INVC-002'], res: 'InvoiceDetail', tables: ['invoices', 'invoice_items'], errors: ['INVOICE_NOT_FOUND', 'INVOICE_NOT_EDITABLE'], body: [f('due_date', 'date'), f('items', 'object[]', 0, 'replaces all lines', [f('description', 'string', 1), f('quantity', 'int', 1), f('unit_price', 'money', 1)]), f('tax_rate', 'percent'), f('notes', 'text')] });
ep('invoices.send', 'POST', '/invoices/:id/send', O, 'Invoices', 'U', 'Issue the invoice to the client (DRAFT -> SENT) and notify them.', { reqs: ['FR-INVC-003', 'FR-NOTIF-003'], res: 'InvoiceDetail', tables: ['invoices', 'notifications'], errors: ['INVOICE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });
ep('invoices.void', 'POST', '/invoices/:id/void', O, 'Invoices', 'A', 'Void an invoice that has no payments.', { reqs: ['FR-INVC-007'], res: 'InvoiceDetail', tables: ['invoices'], errors: ['INVOICE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });

// =================================================================================== PAYMENTS
ep('payments.create', 'POST', '/payments', [Mo, Bo, F, O], 'Payments', 'C', 'Record a payment against a booking, social participation, membership, shop order, bar order, tab or invoice.', {
  reqs: ['FR-FIN-001', 'FR-FIN-002', 'FR-INVC-004', 'FR-FIN-010'], res: 'PaymentView', tables: ['payments', 'court_bookings', 'social_session_participants', 'shop_orders', 'bar_orders', 'bar_tabs', 'invoices'], guest: true,
  errors: ['PAYMENT_FAILED', 'PAYMENT_AMOUNT_MISMATCH', 'ALREADY_PAID', 'BOOKING_NOT_FOUND', 'NOT_A_PARTICIPANT', 'ORDER_NOT_FOUND', 'TAB_NOT_FOUND', 'INVOICE_NOT_FOUND', 'MEMBERSHIP_NOT_FOUND'],
  body: [f('source_type', 'enum:PAYMENT_SOURCE_TYPE', 1), f('source_id', 'uuid', 1), f('amount', 'money', 0, 'default = remaining due. Partial payments allowed ONLY for INVOICE; every other source must equal the full amount due'), method(1, 'MEMBER / BUSINESS_CLIENT: ONLINE only. FRONT_DESK: CASH | CARD | UPI. OWNER_ADMIN: any'), f('gateway_reference', 'string'), f('notes', 'text')],
  rules: 'revenue_category derived from source_type (INVOICE: BUSINESS or MEMBERSHIP from invoice_type). tax_amount derived (tax-inclusive sources) or proportional (invoices). Updates the source payment_status (invoices: amount_paid + status PARTIALLY_PAID/PAID) in the same transaction. BAR_ORDER sources that belong to a tab are rejected (settle the tab). ONLINE goes through the mock gateway of the hackathon build (ADR-011): an amount whose paise are .13 (e.g. 100.13) returns PAYMENT_FAILED.' });
ep('payments.list', 'GET', '/payments', [Mo, Bo, Fo, O], 'Payments', 'V', 'Payment history. Members / clients: own. Front desk: payments they received. Owner: all.', {
  reqs: ['FR-FIN-004', 'FR-INVC-005', 'FR-FIN-003'], res: 'Page<PaymentView>', tables: ['payments'],
  query: [f('source_type', 'enum:PAYMENT_SOURCE_TYPE'), f('revenue_category', 'enum:REVENUE_CATEGORY'), f('method', 'enum:PAYMENT_METHOD'), f('status', 'enum:PAYMENT_TXN_STATUS'), f('member_id', 'uuid', 0, 'OWNER_ADMIN only'), f('business_client_id', 'uuid', 0, 'OWNER_ADMIN only'), f('from', 'date'), f('to', 'date')] });
ep('payments.get', 'GET', '/payments/:id', [Mo, Bo, Fo, O], 'Payments', 'V', 'One payment = the receipt.', { reqs: ['FR-FIN-004'], res: 'PaymentView', tables: ['payments'], errors: ['PAYMENT_NOT_FOUND'] });
ep('payments.refund', 'POST', '/payments/:id/refund', O, 'Payments', 'A', 'Refund (fully or partly) a payment. Cancellation flows refund automatically; this is for manual corrections.', {
  reqs: ['FR-FIN-005'], res: 'PaymentView', tables: ['payments'], errors: ['PAYMENT_NOT_FOUND', 'REFUND_EXCEEDS_PAYMENT'], body: [f('amount', 'money', 1, '> 0, <= amount - refunded_amount'), f('reason', 'text', 1)] });

// =================================================================================== STAFF / HR
ep('staff.list', 'GET', '/staff', O, 'Staff records', 'V', 'Staff directory.', { reqs: ['FR-STAFF-001'], res: 'Page<StaffView>', tables: ['staff', 'users'], query: [f('q', 'string'), f('role', 'enum:USER_ROLE'), f('is_active', 'bool')] });
ep('staff.create', 'POST', '/staff', O, 'Staff records', 'C', 'Create a staff account (front desk, kitchen manager or another owner) and employee record.', {
  reqs: ['FR-STAFF-001', 'FR-AUTH-007'], res: 'StaffView', tables: ['users', 'staff'], errors: ['EMAIL_TAKEN'],
  body: [f('full_name', 'string', 1), f('email', 'email', 1), f('phone', 'phone'), f('role', 'enum:USER_ROLE', 1, 'FRONT_DESK | KITCHEN_MANAGER | OWNER_ADMIN only'), f('password', 'string', 1), f('designation', 'string', 1), f('default_area', 'enum:SHIFT_AREA'), f('monthly_salary', 'money', 1), f('joined_on', 'date')] });
ep('staff.get', 'GET', '/staff/:id', [Fo, Ko, O], 'Staff records', 'V', 'Employee record.', { reqs: ['FR-STAFF-001', 'FR-STAFF-007'], res: 'StaffView', tables: ['staff'], errors: ['STAFF_NOT_FOUND'] });
ep('staff.update', 'PATCH', '/staff/:id', O, 'Staff records', 'U', 'Edit an employee / deactivate (also disables login).', { reqs: ['FR-STAFF-001'], res: 'StaffView', tables: ['staff', 'users'], errors: ['STAFF_NOT_FOUND'], body: [f('full_name', 'string'), f('phone', 'phone'), f('designation', 'string'), f('default_area', 'enum:SHIFT_AREA'), f('monthly_salary', 'money'), f('is_active', 'bool')] });
ep('staff.shifts', 'GET', '/staff/shifts', [F, Ko, O], 'Shifts', 'V', 'Shift roster for a date range (front desk sees everyone read-only; kitchen only own).', { reqs: ['FR-STAFF-002', 'FR-STAFF-005', 'FR-STAFF-007'], res: 'ShiftView[]', tables: ['staff_shifts', 'staff'], query: [f('from', 'date', 1), f('to', 'date', 1, 'max 31 days'), f('staff_id', 'uuid'), f('area', 'enum:SHIFT_AREA')] });
ep('staff.shiftCreate', 'POST', '/staff/shifts', O, 'Shifts', 'C', 'Assign a shift.', { reqs: ['FR-STAFF-002'], res: 'ShiftView', tables: ['staff_shifts', 'notifications'], errors: ['STAFF_NOT_FOUND', 'SHIFT_OVERLAP'], body: [f('staff_id', 'uuid', 1), f('shift_date', 'date', 1), f('start_time', 'time', 1), f('end_time', 'time', 1, '> start_time (same day)'), f('area', 'enum:SHIFT_AREA', 1), f('notes', 'text')], rules: 'Rejects overlaps for the same staff/date and dates inside an APPROVED leave (SHIFT_OVERLAP).' });
ep('staff.shiftUpdate', 'PATCH', '/staff/shifts/:id', O, 'Shifts', 'U', 'Edit a shift.', { reqs: ['FR-STAFF-002'], res: 'ShiftView', tables: ['staff_shifts'], errors: ['SHIFT_NOT_FOUND', 'SHIFT_OVERLAP'], body: [f('shift_date', 'date'), f('start_time', 'time'), f('end_time', 'time'), f('area', 'enum:SHIFT_AREA'), f('notes', 'text')] });
ep('staff.shiftDelete', 'DELETE', '/staff/shifts/:id', O, 'Shifts', 'D', 'Remove a shift.', { reqs: ['FR-STAFF-002'], res: 'void', tables: ['staff_shifts'], errors: ['SHIFT_NOT_FOUND'] });
ep('staff.leaveList', 'GET', '/staff/leave-requests', [Fo, Ko, O], 'Leave', 'V', 'Leave requests (staff see their own; owner sees all).', { reqs: ['FR-STAFF-003', 'FR-STAFF-004'], res: 'Page<LeaveView>', tables: ['leave_requests', 'staff'], query: [f('status', 'enum:LEAVE_STATUS'), f('staff_id', 'uuid', 0, 'OWNER_ADMIN only'), f('from', 'date'), f('to', 'date')] });
ep('staff.leaveCreate', 'POST', '/staff/leave-requests', [F, K], 'Leave', 'C', 'Request leave (status PENDING); notifies the owner.', { reqs: ['FR-STAFF-003', 'FR-NOTIF-003'], res: 'LeaveView', tables: ['leave_requests', 'notifications'], errors: ['LEAVE_OVERLAP'], body: [f('leave_type', 'enum:LEAVE_TYPE', 1), f('start_date', 'date', 1), f('end_date', 'date', 1, '>= start_date'), f('reason', 'text')] });
ep('staff.leaveDecide', 'POST', '/staff/leave-requests/:id/decision', O, 'Leave', 'A', 'Approve or reject a PENDING leave request.', { reqs: ['FR-STAFF-004', 'FR-NOTIF-003'], res: 'LeaveView', tables: ['leave_requests', 'notifications'], errors: ['LEAVE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [f('decision', 'enum:LEAVE_DECISION', 1), f('note', 'text', 0, 'required when REJECT')], status: 200 });
ep('staff.leaveCancel', 'POST', '/staff/leave-requests/:id/cancel', [Fo, Ko, O], 'Leave', 'U', 'Cancel a PENDING or future APPROVED leave request.', { reqs: ['FR-STAFF-003'], res: 'LeaveView', tables: ['leave_requests'], errors: ['LEAVE_NOT_FOUND', 'INVALID_STATUS_TRANSITION'] });
ep('staff.payrollList', 'GET', '/staff/payroll', [Fo, Ko, O], 'Payroll', 'V', 'Salary payments (staff: own history).', { reqs: ['FR-STAFF-006', 'FR-FIN-008', 'FR-STAFF-007'], res: 'Page<PayrollView>', tables: ['payroll_payments', 'staff'], query: [f('staff_id', 'uuid', 0, 'OWNER_ADMIN only'), f('pay_period', 'date', 0, 'first day of month'), f('status', 'enum:PAYROLL_STATUS')] });
ep('staff.payrollCreate', 'POST', '/staff/payroll', O, 'Payroll', 'C', 'Create (and optionally pay) a salary record for a month.', { reqs: ['FR-STAFF-006', 'FR-FIN-008'], res: 'PayrollView', tables: ['payroll_payments'], errors: ['STAFF_NOT_FOUND', 'PAYROLL_EXISTS'], body: [f('staff_id', 'uuid', 1), f('pay_period', 'date', 1, 'first day of month'), f('amount', 'money', 0, 'default staff.monthly_salary'), method(1), f('mark_paid', 'bool'), f('notes', 'text')] });
ep('staff.payrollPay', 'POST', '/staff/payroll/:id/pay', O, 'Payroll', 'U', 'Mark a PENDING salary as PAID.', { reqs: ['FR-STAFF-006', 'FR-FIN-008'], res: 'PayrollView', tables: ['payroll_payments'], errors: ['NOT_FOUND', 'INVALID_STATUS_TRANSITION'], body: [method(0), f('paid_on', 'date', 0, 'default today')], status: 200 });

// =================================================================================== REPORTS (OWNER_ADMIN only)
const rep = (id, path, summary, res, reqs, query, tables, rules = '') => ep(id, 'GET', path, O, 'Reports', 'V', summary, { reqs, res, query, tables, rules });
rep('reports.dashboard', '/reports/dashboard', 'Owner dashboard KPIs for today / this week / this month across every module.', 'OwnerDashboard', ['FR-REP-001', 'FR-FIN-009', 'FR-MEM-014'], [f('period', 'enum:REPORT_PERIOD', 1, 'TODAY = IST today; WEEK = Monday..today; MONTH = 1st..today')], ['payments', 'memberships', 'court_bookings', 'shop_orders', 'bar_orders', 'enquiries', 'invoices', 'payroll_payments', 'leave_requests', 'products'], 'Revenue = SUM(payments.amount - refunded_amount) where status in (SUCCEEDED, PARTIALLY_REFUNDED), by paid_at in the range (IST).');
rep('reports.revenue', '/reports/revenue', 'Revenue by day, category (court/membership/shop/bar/business) or payment method.', 'RevenueReport', ['FR-REP-002', 'FR-FIN-003', 'FR-FIN-002'], [from, to, f('group_by', 'enum:REPORT_GROUP_BY', 0, 'default CATEGORY')], ['payments']);
rep('reports.courts', '/reports/courts', 'Court utilisation, cancellations and revenue per court.', 'CourtUtilizationReport', ['FR-REP-003'], [from, to], ['court_bookings', 'courts', 'payments'], 'utilization_percent = booked hours / available hours (open hours x days, minus MAINTENANCE).');
rep('reports.memberships', '/reports/memberships', 'Active members by type, new registrations, renewals, expiring, membership revenue.', 'MembershipReport', ['FR-REP-004', 'FR-MEM-014'], [from, to], ['memberships', 'members', 'payments']);
rep('reports.shop', '/reports/shop', 'Shop sales, channel split, top products, low stock.', 'ShopReport', ['FR-REP-005'], [from, to], ['shop_orders', 'shop_order_items', 'products']);
rep('reports.bar', '/reports/bar', 'Bar revenue per day (what the bar earned), by method, with open tabs.', 'BarDailySummary[]', ['FR-REP-006', 'FR-BAR-009'], [from, to], ['payments', 'bar_orders', 'bar_tabs']);
rep('reports.finance', '/reports/finance', 'Money in, refunds, outstanding invoices, overdue, payroll paid/pending, tax collected.', 'FinanceReport', ['FR-REP-009', 'FR-FIN-006', 'FR-FIN-008'], [from, to], ['payments', 'invoices', 'payroll_payments']);
rep('reports.tax', '/reports/tax', 'Tax collected (GST) by revenue category for filing.', 'TaxReport', ['FR-REP-007', 'FR-FIN-007'], [from, to], ['payments'], 'Sum of payments.tax_amount net of refunds (pro-rata), grouped by revenue_category.');
rep('reports.export', '/reports/export', 'Download a report as CSV to share with an accountant / partners. Response is text/csv, NOT the JSON envelope.', 'void', ['FR-REP-008'], [f('report', 'enum:EXPORT_REPORT', 1), from, to], ['payments', 'court_bookings', 'members', 'shop_orders', 'bar_orders']);

// =================================================================================== NOTIFICATIONS
ep('notifications.list', 'GET', '/notifications', ANY, 'Notifications', 'V', 'Own notifications, newest first.', { reqs: ['FR-NOTIF-001'], res: 'Page<Notification>', tables: ['notifications'], query: [f('unread_only', 'bool')], scope: 'Always the caller\'s own' });
ep('notifications.unreadCount', 'GET', '/notifications/unread-count', ANY, 'Notifications', 'V', 'Badge count.', { reqs: ['FR-NOTIF-001'], res: 'CountResult', tables: ['notifications'] });
ep('notifications.read', 'PATCH', '/notifications/:id/read', ANY, 'Notifications', 'U', 'Mark one notification read.', { reqs: ['FR-NOTIF-002'], res: 'Notification', tables: ['notifications'], errors: ['NOTIFICATION_NOT_FOUND'] });
ep('notifications.readAll', 'POST', '/notifications/read-all', ANY, 'Notifications', 'U', 'Mark all own notifications read.', { reqs: ['FR-NOTIF-002'], res: 'CountResult', tables: ['notifications'], status: 200 });

// =================================================================================== SETTINGS
ep('settings.list', 'GET', '/settings', O, 'Club settings', 'V', 'All club settings.', { reqs: ['FR-SET-001'], res: 'SettingView[]', tables: ['club_settings'] });
ep('settings.update', 'PATCH', '/settings/:key', O, 'Club settings', 'U', 'Change one setting (hours, tax rates, delivery fee, cut-offs...).', { reqs: ['FR-SET-001'], res: 'SettingView', tables: ['club_settings'], errors: ['SETTING_NOT_FOUND'], body: [f('value', 'string', 1, 'JSON scalar matching the existing value\'s type (string | number | boolean)')], rules: 'Only existing keys listed in SETTING_KEYS can be changed. `value` is validated against the type of the current value.' });

// ---------------------------------------------------------------------------------- derived helpers
export const roleName = (r) => r.split(':')[0];
export const isOwnOnly = (r) => r.endsWith(':own');
export const ALL_ROLES = [M, F, K, B, O];

// ---------------------------------------------------------------------------------- governing business rules per endpoint
// Rule ids live in docs/business-rules/BUSINESS_RULES.md (single place). The API contract cites them instead of restating them;
// tools/check-consistency.mjs verifies every id exists.
export const ruleRefs = {
  'auth.signup': ['R-SEC-02', 'R-MEM-05'], 'auth.login': ['R-SEC-02'], 'auth.changePassword': ['R-SEC-02'],
  'members.create': ['R-MEM-07', 'R-SEC-02'], 'members.me': ['R-MEM-04', 'R-COURT-04'], 'members.get': ['R-MEM-04', 'R-COURT-04'],
  'memberships.plans': ['R-MEM-02'], 'memberships.planCreate': ['R-MEM-02'], 'memberships.planUpdate': ['R-MEM-02', 'R-MEM-11'],
  'memberships.purchase': ['R-MEM-03', 'R-MEM-06', 'R-MEM-07', 'R-FIN-11'], 'memberships.changePlan': ['R-MEM-08', 'R-MEM-07'],
  'memberships.cancel': ['R-MEM-09'], 'memberships.expiring': ['R-MEM-04', 'R-MEM-10'], 'memberships.runExpiry': ['R-MEM-10', 'R-INVC-03', 'R-COURT-09'],
  'courts.availability': ['R-COURT-01', 'R-COURT-03'], 'courts.block': ['R-COURT-10', 'R-COURT-03'], 'courts.unblock': ['R-COURT-10'],
  'bookings.price': ['R-COURT-05', 'R-COURT-04', 'R-MEM-04'],
  'bookings.create': ['R-COURT-01', 'R-COURT-02', 'R-COURT-03', 'R-COURT-04', 'R-COURT-05', 'R-COURT-06', 'R-COURT-08', 'R-MEM-05'],
  'bookings.cancel': ['R-COURT-07'], 'bookings.complete': ['R-COURT-09'],
  'social.create': ['R-SOC-01', 'R-COURT-03'], 'social.join': ['R-SOC-02', 'R-SOC-03', 'R-SOC-04', 'R-SOC-06', 'R-COURT-04'],
  'social.leave': ['R-SOC-05'], 'social.cancel': ['R-SOC-05'], 'social.list': ['R-SOC-01'],
  'shop.products': ['R-SHOP-03', 'R-SHOP-04'], 'shop.productCreate': ['R-SHOP-09'], 'shop.productUpdate': ['R-SHOP-09'], 'shop.productDelete': ['R-SHOP-09'],
  'shop.orderCreate': ['R-SHOP-01', 'R-SHOP-02', 'R-SHOP-04', 'R-SHOP-05', 'R-SHOP-06', 'R-FIN-11'],
  'shop.orderStatus': ['R-SHOP-07'], 'shop.orderCancel': ['R-SHOP-08'],
  'inventory.list': ['R-SHOP-03'], 'inventory.lowStock': ['R-SHOP-03'], 'inventory.adjust': ['R-SHOP-02', 'R-SHOP-03'], 'inventory.movements': ['R-SHOP-02'],
  'bar.tableUpdate': ['R-BAR-06'], 'bar.orderCreate': ['R-BAR-01', 'R-BAR-02', 'R-BAR-03', 'R-BAR-05', 'R-BAR-06'], 'bar.orderCancel': ['R-BAR-08'],
  'bar.tabOpen': ['R-BAR-03'], 'bar.tabSettle': ['R-BAR-04', 'R-BAR-05'], 'bar.tabVoid': ['R-BAR-04'], 'bar.dailySummary': ['R-BAR-09'],
  'kitchen.list': ['R-BAR-07'], 'kitchen.status': ['R-BAR-07'],
  'enquiries.create': ['R-ENQ-01'], 'enquiries.list': ['R-ENQ-06'], 'enquiries.summary': ['R-ENQ-06'], 'enquiries.update': ['R-ENQ-02'], 'enquiries.followUp': ['R-ENQ-02'],
  'enquiries.quoteCreate': ['R-ENQ-03'], 'enquiries.quoteUpdate': ['R-ENQ-03'], 'enquiries.trialBooking': ['R-ENQ-05', 'R-COURT-03'], 'enquiries.convert': ['R-ENQ-04'],
  'invoices.list': ['R-INVC-03', 'R-FIN-08'], 'invoices.create': ['R-FIN-03', 'R-FIN-05'], 'invoices.update': ['R-INVC-01'], 'invoices.send': ['R-INVC-01'], 'invoices.void': ['R-INVC-04'], 'clients.create': ['R-INVC-05'],
  'payments.create': ['R-FIN-01', 'R-FIN-02', 'R-FIN-04', 'R-FIN-05', 'R-FIN-11', 'R-INVC-02'], 'payments.refund': ['R-FIN-06'], 'payments.list': ['R-FIN-01'],
  'staff.update': ['R-HR-03'], 'staff.shiftCreate': ['R-HR-01'], 'staff.shiftUpdate': ['R-HR-01'], 'staff.leaveCreate': ['R-HR-02'], 'staff.leaveDecide': ['R-HR-02'], 'staff.leaveCancel': ['R-HR-02'],
  'staff.payrollCreate': ['R-FIN-10'], 'staff.payrollPay': ['R-FIN-10'],
  'reports.dashboard': ['R-FIN-07', 'R-FIN-08', 'R-FIN-10'], 'reports.revenue': ['R-FIN-07'], 'reports.finance': ['R-FIN-07', 'R-FIN-08', 'R-FIN-10'], 'reports.tax': ['R-FIN-07'], 'reports.bar': ['R-BAR-09'],
};
