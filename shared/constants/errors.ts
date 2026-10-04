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
  APPLICATION_PENDING: { status: 409, group: 'Auth', message: 'A job application for this email is already waiting for the owner. Log in to see its status.' },
  APPLICATION_NOT_FOUND: { status: 404, group: 'Staff', message: 'Job application not found.' },
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

  // ---- courts / bookings ----
  COURT_NOT_FOUND: { status: 404, group: 'Courts', message: 'Court not found.' },
  COURT_UNAVAILABLE: { status: 409, group: 'Courts', message: 'Court is closed, inactive, blocked, or outside opening hours.' },
  INVALID_SLOT: { status: 422, group: 'Courts', message: 'Start time must be on a 30-minute boundary, in the future, within opening hours.' },
  BOOKING_NOT_FOUND: { status: 404, group: 'Courts', message: 'Booking not found.' },
  BOOKING_CONFLICT: { status: 409, group: 'Courts', message: 'This court is already booked for that time.' },
  DAILY_BOOKING_LIMIT: { status: 409, group: 'Courts', message: 'Member has reached the maximum plays allowed per day.' },
  BOOKING_NOT_CANCELLABLE: { status: 409, group: 'Courts', message: 'This booking can no longer be cancelled.' },

  // ---- shop / inventory ----
  PRODUCT_NOT_FOUND: { status: 404, group: 'Shop', message: 'Product not found.' },
  OUT_OF_STOCK: { status: 409, group: 'Shop', message: 'Insufficient stock for one or more items.' },
  ORDER_NOT_FOUND: { status: 404, group: 'Shop', message: 'Order not found.' },
  DELIVERY_ADDRESS_REQUIRED: { status: 422, group: 'Shop', message: 'Delivery address is required for delivery orders.' },
  SKU_TAKEN: { status: 409, group: 'Shop', message: 'SKU already exists.' },

  // ---- cafe / kitchen ----
  MENU_ITEM_NOT_FOUND: { status: 404, group: 'Bar', message: 'Menu item not found.' },
  MENU_ITEM_UNAVAILABLE: { status: 409, group: 'Bar', message: 'Menu item is currently unavailable.' },

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

  // ---- staff / HR ----
  STAFF_NOT_FOUND: { status: 404, group: 'Staff', message: 'Staff member not found.' },
  SHIFT_NOT_FOUND: { status: 404, group: 'Staff', message: 'Shift not found.' },
  SHIFT_OVERLAP: { status: 409, group: 'Staff', message: 'Shift overlaps with an existing shift for this employee.' },
  LEAVE_NOT_FOUND: { status: 404, group: 'Staff', message: 'Leave request not found.' },
  LEAVE_OVERLAP: { status: 409, group: 'Staff', message: 'Leave overlaps with an existing leave request.' },
  PAYROLL_EXISTS: { status: 409, group: 'Staff', message: 'Payroll for this period already exists.' },
  TRIAL_ALREADY_BOOKED: { status: 409, group: 'Courts', message: 'This phone number already has an upcoming trial booked.' },
  COURT_NAME_TAKEN: { status: 409, group: 'Courts', message: 'A court with this name already exists.' },
  EVENT_NOT_FOUND: { status: 404, group: 'Events', message: 'Event not found.' },
  EVENT_FULL: { status: 409, group: 'Events', message: 'This event is full.' },
  EVENT_ENDED: { status: 409, group: 'Events', message: 'This event has already ended.' },

  // ---- settings ----
  SETTING_NOT_FOUND: { status: 404, group: 'Misc', message: 'Setting not found.' },
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;
