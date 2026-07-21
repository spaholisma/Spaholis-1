-- Give bookings the same off-site place + availability-block controls the
-- internal calendar entries have, so web/request bookings are fully editable.
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS offsite_location text;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS blocks_availability boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.offsite_location IS 'Free-text place for an off-site booking (hotel, villa, client address).';
COMMENT ON COLUMN public.bookings.blocks_availability IS 'When true, blocks ALL website availability during the booking time (e.g. an off-site event tying up staff).';

-- Availability blocks now also include bookings flagged blocks_availability,
-- not just calendar entries.
CREATE OR REPLACE FUNCTION public.get_availability_blocks(_from timestamptz, _to timestamptz)
RETURNS TABLE(block_start timestamptz, block_end timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select x.block_start, x.block_end
  from (
    select
      case
        when e.is_all_day or (e.end_date is not null and e.end_date > e.entry_date)
          then (e.entry_date::timestamp at time zone 'America/Costa_Rica')
        else ((e.entry_date + e.start_time) at time zone 'America/Costa_Rica')
      end as block_start,
      case
        when e.is_all_day or (e.end_date is not null and e.end_date > e.entry_date)
          then (((coalesce(e.end_date, e.entry_date) + 1)::timestamp) at time zone 'America/Costa_Rica')
        else ((e.entry_date + e.start_time) at time zone 'America/Costa_Rica')
               + make_interval(mins => greatest(e.duration_minutes, 0))
      end as block_end
    from public.admin_calendar_entries e
    where e.blocks_availability = true
    union all
    select b.start_time, b.end_time
    from public.bookings b
    where b.blocks_availability = true
      and b.start_time is not null and b.end_time is not null
      and b.status not in ('cancelled', 'payment_failed')
  ) x
  where x.block_start <= _to and x.block_end >= _from;
$function$;
