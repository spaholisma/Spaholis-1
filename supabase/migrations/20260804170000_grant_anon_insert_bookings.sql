-- Fix: anonymous (not-logged-in) visitors could not submit the public request /
-- consultation form. The form inserts a booking directly from the client, and
-- the RLS policy "Users can create bookings" (with_check: user_id IS NULL OR
-- auth.uid() = user_id) already allows anonymous guest rows — but the table-level
-- INSERT privilege for the `anon` role was missing, so the insert failed with
-- 42501 "permission denied for table bookings".
--
-- Granting INSERT restores the intended behaviour; RLS still gates every row.
GRANT INSERT ON public.bookings TO anon;
