-- Coordinators manage the treatments calendar, so let them edit and delete
-- bookings (titles, room, time, status, off-site, block flag, etc.) — not just
-- view them. Full admins already have ALL via their own policy.
DROP POLICY IF EXISTS "Coordinators can update bookings" ON public.bookings;
CREATE POLICY "Coordinators can update bookings"
ON public.bookings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'coordinator'::app_role))
WITH CHECK (has_role(auth.uid(), 'coordinator'::app_role));

DROP POLICY IF EXISTS "Coordinators can delete bookings" ON public.bookings;
CREATE POLICY "Coordinators can delete bookings"
ON public.bookings FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'coordinator'::app_role));
