-- Classes: book online right up to the moment the class starts.
--
-- reject_past_class_booking closed online booking 15 minutes before a class
-- (20260803130000). The studio would rather take a late booking: it now closes
-- when the class starts.
--
-- One thing changes besides the time. A PayPal payment is taken first and the
-- booking written after (paypal-capture-order), so with no margin someone who
-- starts paying at 7:59 for an 8:00 class and finishes at 8:00:10 would be
-- charged and then refused. So the time is checked where a payment BEGINS
-- (paypal-create-order, create-class-booking — both refuse a class that has
-- started) and the trigger lets the site's own server functions (service role)
-- through, so a payment begun in time is always honoured.
--
-- Unchanged: the team (super_admin, manager, coordinator) may still add someone
-- at any time, and every booking made from the browser — a free class, a pass,
-- a membership, the no-login membership link — is refused once the class starts.
create or replace function public.reject_past_class_booking()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE st timestamptz; uid uuid; is_staff boolean;
BEGIN
  SELECT start_time INTO st FROM public.class_schedule WHERE id = NEW.schedule_id;
  uid := auth.uid();
  is_staff := uid IS NOT NULL AND (
    has_role(uid, 'super_admin') OR has_role(uid, 'manager') OR has_role(uid, 'coordinator')
  );
  IF st IS NOT NULL AND st <= now() AND NOT is_staff
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'This class has already started — online booking is closed.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $function$;
