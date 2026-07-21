-- Safe booking feed for the read-only calendar: ONLY operational fields
-- (name, service, time, room, status). Deliberately excludes email, phone,
-- price, card_authorization and intake_form (health). SECURITY DEFINER so it
-- bypasses RLS, but the has_role gate in WHERE returns rows only to staff;
-- clients / anon get an empty set.
CREATE OR REPLACE FUNCTION public.get_treatment_bookings(_from date, _to date)
RETURNS TABLE(
  id uuid,
  title text,
  guest_name text,
  service_title text,
  service_type text,
  duration_minutes integer,
  booking_date date,
  booking_time time without time zone,
  status text,
  room_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    b.id, b.title, b.guest_name, s.title, s.type,
    coalesce(s.duration_minutes, 60), b.booking_date, b.booking_time, b.status, b.room_id
  from public.bookings b
  left join public.services s on s.id = b.service_id
  where
    (
      has_role(auth.uid(), 'viewer'::app_role)
      or has_role(auth.uid(), 'coordinator'::app_role)
      or has_role(auth.uid(), 'manager'::app_role)
      or has_role(auth.uid(), 'super_admin'::app_role)
    )
    and s.type = 'treatment'
    and b.booking_date between _from and _to
    and b.status not in ('cancelled', 'payment_failed');
$function$;

REVOKE ALL ON FUNCTION public.get_treatment_bookings(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_treatment_bookings(date, date) TO authenticated;

-- Viewers may READ the treatments calendar entries (schedules, lunch, off-site,
-- blocks) — operational info, no client data. No write policy = read-only.
DROP POLICY IF EXISTS "Viewers read treatment entries" ON public.admin_calendar_entries;
CREATE POLICY "Viewers read treatment entries"
ON public.admin_calendar_entries
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role) AND calendar_type = 'treatment');

-- Grant the viewer role to holisdevices@gmail.com.
INSERT INTO public.user_roles (user_id, role)
SELECT 'cf59b43a-45cb-4c41-92a1-f21e14132127'::uuid, 'viewer'::app_role
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = 'cf59b43a-45cb-4c41-92a1-f21e14132127'::uuid AND role = 'viewer'::app_role
);
