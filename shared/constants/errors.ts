/**
 * CANONICAL ERROR CODES — single source of truth.
 * API error body:  { "success": false, "error": { "code": "<KEY>", "message": "...", "details"?: {...} } }
 * Developers MUST use these keys. Never invent ad-hoc error strings.
 * `status` is the HTTP status the API must return for the code.
 * `group` is only used to render docs/contracts/ERROR_CODES.md.
 */

export const ERROR_CODES = {
  // ---- generic / auth ----
  VALIDATION_ERROR: { status: 400, group: 'Generic', message: 'Request validation failed.' },
  AUTH_INVALID: { status: 401, group: 'Auth', message: 'Invalid email or password.' },
  AUTH_UNAUTHORIZED: { status: 401, group: 'Auth', message: 'Authentication required or token expired.' },
  FORBIDDEN: { status: 403, group: 'Auth', message: 'You do not have permission to perform this action.' },
  EMAIL_TAKEN: { status: 409, group: 'Auth', message: 'An account with this email already exists.' },
  ACCOUNT_DISABLED: { status: 403, group: 'Auth', message: 'This account has been deactivated.' },
  NOT_FOUND: { status: 404, group: 'Generic', message: 'Resource not found.' },
  INVALID_STATUS_TRANSITION: { status: 409, group: 'Generic', message: 'This status change is not allowed.' },
  INTERNAL_ERROR: { status: 500, group: 'Generic', message: 'Unexpected server error.' },

  // ---- members / memberships ----
  MEMBER_NOT_FOUND: { status: 404, group: 'Membership', message: 'Member not found.' },
  MEMBERSHIP_NOT_FOUND: { status: 404, group: 'Membership', message: 'Membership not found.' },
  MEMBERSHIP_PLAN_NOT_FOUND: { status: 404, group: 'Membership', message: 'Membership plan not found.' },
  MEMBERSHIP_EXPIRED: { status: 403, group: 'Membership', message: 'Membership has expired; member rates do not apply.' },
  MEMBERSHIP_ALREADY_ACTIVE: { status: 409, group: 'Membership', message: 'Member already has an active membership.' },
  JUNIOR_AGE_INVALID: { status: 422, group: 'Membership', message: 'Junior plan requires the member to be under 18.' },

  // ---- courts / bookings / social play ----
  COURT_NOT_FOUND: { status: 404, group: 'Courts', message: 'Court not found.' },
  COURT_UNAVAILABLE: { status: 409, group: 'Courts', message: 'Court is closed, inactive, blocked, or outside opening hours.' },
  INVALID_SLOT: { status: 422, group: 'Courts', message: 'Start time must be on a 30-minute boundary, in the future, within opening hours.' },
  BOOKING_NOT_FOUND: { status: 404, group: 'Courts', message: 'Booking not found.' },
  BOOKING_CONFLICT: { status: 409, group: 'Courts', message: 'This court is already booked for that time.' },
  DAILY_BOOKING_LIMIT: { status: 409, group: 'Courts', message: 'Member has reached the maximum plays allowed per day.' },
  BOOKING_NOT_CANCELLABLE: { status: 409, group: 'Courts', message: 'This booking can no longer be cancelled.' },
  SOCIAL_SESSION_NOT_FOUND: { status: 404, group: 'Social play', message: 'Social session not found.' },
  SOCIAL_SESSION_FULL: { status: 409, group: 'Social play', message: 'This social session is full.' },
  SOCIAL_PLAY_NOT_ALLOWED: { status: 422, group: 'Social play', message: 'Social sessions can only be created in the configured social-play window.' },
  ALREADY_JOINED: { status: 409, group: 'Social play', message: 'Already joined this social session.' },
  NOT_A_PARTICIPANT: { status: 404, group: 'Social play', message: 'Participant not found in this session.' },

  // ---- shop / inventory ----
  PRODUCT_NOT_FOUND: { status: 404, group: 'Shop', message: 'Product not found.' },
  OUT_OF_STOCK: { status: 409, group: 'Shop', message: 'Insufficient stock for one or more items.' },
  ORDER_NOT_FOUND: { status: 404, group: 'Shop', message: 'Order not found.' },
  DELIVERY_ADDRESS_REQUIRED: { status: 422, group: 'Shop', message: 'Delivery address is required for delivery orders.' },
  SKU_TAKEN: { status: 409, group: 'Shop', message: 'SKU already exists.' },

  // ---- bar / kitchen ----
  MENU_ITEM_NOT_FOUND: { status: 404, group: 'Bar', message: 'Menu item not found.' },
  MENU_ITEM_UNAVAILABLE: { status: 409, group: 'Bar', message: 'Menu item is currently unavailable.' },
  TABLE_NOT_FOUND: { status: 404, group: 'Bar', message: 'Table not found.' },
  TABLE_OCCUPIED: { status: 409, group: 'Bar', message: 'Table is already occupied or out of service.' },
  TAB_NOT_FOUND: { status: 404, group: 'Bar', message: 'Tab not found.' },
  TAB_NOT_OPEN: { status: 409, group: 'Bar', message: 'Tab is not open.' },
  TAB_HAS_ACTIVE_ORDERS: { status: 409, group: 'Bar', message: 'Tab has orders that are not yet served or cancelled.' },

  // ---- payments / invoices ----
  PAYMENT_FAILED: { status: 402, group: 'Finance', message: 'Payment could not be completed.' },
  PAYMENT_NOT_FOUND: { status: 404, group: 'Finance', message: 'Payment not found.' },
  PAYMENT_AMOUNT_MISMATCH: { status: 422, group: 'Finance', message: 'Payment amount does not match the amount due.' },
  ALREADY_PAID: { status: 409, group: 'Finance', message: 'This item is already fully paid.' },
  REFUND_EXCEEDS_PAYMENT: { status: 422, group: 'Finance', message: 'Refund amount exceeds the amount paid.' },
  INVOICE_NOT_FOUND: { status: 404, group: 'Finance', message: 'Invoice not found.' },
  INVOICE_NOT_EDITABLE: { status: 409, group: 'Finance', message: 'Invoice can no longer be edited.' },
  BUSINESS_CLIENT_NOT_FOUND: { status: 404, group: 'Finance', message: 'Business client not found.' },

  // ---- enquiries ----
  ENQUIRY_NOT_FOUND: { status: 404, group: 'Enquiries', message: 'Enquiry not found.' },
  QUOTE_NOT_FOUND: { status: 404, group: 'Enquiries', message: 'Quote not found.' },
  ENQUIRY_ALREADY_CONVERTED: { status: 409, group: 'Enquiries', message: 'Enquiry has already been converted.' },

  // ---- staff / HR ----
  STAFF_NOT_FOUND: { status: 404, group: 'Staff', message: 'Staff member not found.' },
  SHIFT_NOT_FOUND: { status: 404, group: 'Staff', message: 'Shift not found.' },
  SHIFT_OVERLAP: { status: 409, group: 'Staff', message: 'Shift overlaps with an existing shift for this employee.' },
  LEAVE_NOT_FOUND: { status: 404, group: 'Staff', message: 'Leave request not found.' },
  LEAVE_OVERLAP: { status: 409, group: 'Staff', message: 'Leave overlaps with an existing leave request.' },
  PAYROLL_EXISTS: { status: 409, group: 'Staff', message: 'Payroll for this period already exists.' },

  // ---- misc ----
  NOTIFICATION_NOT_FOUND: { status: 404, group: 'Misc', message: 'Notification not found.' },
  SETTING_NOT_FOUND: { status: 404, group: 'Misc', message: 'Setting not found.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
