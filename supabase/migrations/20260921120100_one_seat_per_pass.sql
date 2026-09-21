-- One seat per pass, per class — enforced by the database.
--
-- The function that books with a pass now refuses a second seat, but a rule
-- that lives only in one function is a rule waiting to be walked around: the
-- Admin, an import or a future screen could still write the row. This makes
-- the duplicate impossible to store at all.
--
-- Cancelled bookings are left out of the rule on purpose: cancelling and
-- booking the same class again is normal.

-- The rows that are already duplicated have to go first, or the index cannot
-- be built. Keep the first booking of each pass-and-class pair and drop the
-- later ones — they were never paid for with a credit (the redemption step
-- they belonged to had failed), so nothing is lost by removing them.
-- On a fresh database this matches nothing.
delete from public.class_bookings cb
where cb.user_offering_id is not null
  and cb.status <> 'cancelled'
  and exists (
    select 1 from public.class_bookings keep
     where keep.schedule_id      = cb.schedule_id
       and keep.user_offering_id = cb.user_offering_id
       and keep.status          <> 'cancelled'
       and (keep.created_at < cb.created_at
            or (keep.created_at = cb.created_at and keep.id < cb.id))
  );

create unique index if not exists class_bookings_one_seat_per_pass
  on public.class_bookings (schedule_id, user_offering_id)
  where user_offering_id is not null and status <> 'cancelled';

comment on index public.class_bookings_one_seat_per_pass is
  'A pass or membership can hold only one seat in a given class session.';
