-- Coordinators (reception) can now move a booking to another date and time.
--
-- Changes to an appointment go through a person on WhatsApp or email, and the
-- person who takes that message is reception — who until now could cancel a
-- booking but not reschedule it, so every move had to wait for an admin. The
-- date, the time and the start/end instants the calendar derives from them are
-- released; the room, service, price, staff and payment stay admin-only.

create or replace function public.bookings_restrict_customer_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  -- Trusted card-on-file confirmation flow (flag set only inside
  -- save_card_authorization, never reachable by a normal client update).
  if current_setting('holis.card_auth_flow', true) = '1' then return new; end if;
  if has_role(auth.uid(), 'super_admin') or has_role(auth.uid(), 'manager') then
    return new;
  end if;

  if not has_role(auth.uid(), 'coordinator') then
    raise exception 'Bookings cannot be changed online. To cancel or change an appointment, email us at spaholisma@gmail.com.';
  end if;

  if new.user_id is distinct from old.user_id then raise exception 'Cannot change booking owner'; end if;
  if new.service_id is distinct from old.service_id then raise exception 'Cannot change booking service'; end if;
  if new.room_id is distinct from old.room_id then raise exception 'Cannot change booking room'; end if;
  if new.staff_id is distinct from old.staff_id then raise exception 'Cannot change booking staff'; end if;
  if new.total_price is distinct from old.total_price then raise exception 'Cannot change booking price'; end if;
  if new.discount_amount is distinct from old.discount_amount then raise exception 'Cannot change discount amount'; end if;
  if new.coupon_code is distinct from old.coupon_code then raise exception 'Cannot change coupon code'; end if;
  if new.payment_id is distinct from old.payment_id then raise exception 'Cannot change payment id'; end if;
  if new.notification_sent_at is distinct from old.notification_sent_at then raise exception 'Cannot change notification tracking'; end if;
  if new.status is distinct from old.status and new.status <> 'cancelled' then
    raise exception 'Coordinators may only cancel bookings';
  end if;

  return new;
end;
$$;
