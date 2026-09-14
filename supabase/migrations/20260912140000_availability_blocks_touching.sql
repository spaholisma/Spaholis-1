-- A treatment that merely touches a full-spa block is not blocked by it.
--
-- get_availability_blocks returned every block with block_start <= _to and
-- block_end >= _from, so a lunch block from 12:00 to 13:00 counted as
-- colliding with a 10:30–12:00 massage (ends as lunch begins) and with a
-- 13:00–14:30 one (starts as lunch ends). The website filters with a strict
-- overlap and offered those times; create-booking rejects on any row this
-- returns, so the guest filled in the whole form, card included, and was
-- told "This time is not available" at the last step. That happened on
-- 11 September at 9:39, 9:40 and 10:09 AM. Only genuine overlap counts now.
--
-- Same function otherwise: language, security definer, search_path and grants
-- are unchanged.

create or replace function public.get_availability_blocks(_from timestamp with time zone, _to timestamp with time zone)
returns table(block_start timestamp with time zone, block_end timestamp with time zone)
language sql
stable security definer
set search_path to 'public'
as $function$
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
  where x.block_start < _to and x.block_end > _from;
$function$;
