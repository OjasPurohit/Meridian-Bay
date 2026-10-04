-- =====================================================================================
-- 0009 — A public trial is a request the owner approves
--
-- The website no longer takes a court by itself: it files an enquiry of type TRIAL (sport + preferred time). The owner
-- approves it (a TRIAL court booking is created and shows in every calendar) or declines it. trial_booking_id is the
-- booking an approval created; handled_at set with no booking = declined. Nothing existing is touched.
-- =====================================================================================

ALTER TABLE enquiries ADD COLUMN trial_booking_id uuid REFERENCES court_bookings(id);
