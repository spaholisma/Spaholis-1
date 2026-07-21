-- Add group_id to the viewer's safe booking feed so read-only users see the
-- same sub-calendar colors as coordinators/admins.
DROP FUNCTION IF EXISTS public.get_treatment_bookings(date, date);
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
  room_id uuid,
  group_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select
    b.id, b.title, b.guest_name, s.title, s.type,
    coalesce(s.duration_minutes, 60), b.booking_date, b.booking_time, b.status, b.room_id, b.group_id
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
