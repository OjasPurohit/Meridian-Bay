-- =====================================================================================
-- 0007 — Free trial sessions are court bookings
--
-- A visitor books a trial hour on the public website. It is a real court booking (it occupies the slot and shows in the
-- owner and front-desk calendars), so it uses court_bookings with its own booking type instead of a second table.
-- guest_email keeps the visitor's contact detail next to guest_name / guest_phone. Nothing existing is touched.
-- =====================================================================================

ALTER TYPE booking_type ADD VALUE 'TRIAL';

ALTER TABLE court_bookings ADD COLUMN guest_email text;
