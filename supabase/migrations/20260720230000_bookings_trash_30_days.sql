-- 30-day recycle bin for deleted bookings. A soft-delete snapshots the booking
-- (and its card authorization) as JSONB, then removes it from `bookings` so all
-- existing queries/availability automatically stop seeing it. Restore rebuilds
-- the row(s); a purge drops anything older than 30 days.
CREATE TABLE IF NOT EXISTS public.deleted_bookings (
  id uuid PRIMARY KEY,
  booking jsonb NOT NULL,
  card_auth jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid
);
ALTER TABLE public.deleted_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read trash" ON public.deleted_bookings;
CREATE POLICY "Staff read trash" ON public.deleted_bookings
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'manager'::app_role)
  OR has_role(auth.uid(),'coordinator'::app_role)
);

CREATE OR REPLACE FUNCTION public.soft_delete_booking(_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b_json jsonb; ca_json jsonb; uid uuid;
BEGIN
  uid := auth.uid();
  IF NOT (has_role(uid,'super_admin'::app_role) OR has_role(uid,'manager'::app_role) OR has_role(uid,'coordinator'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT to_jsonb(b.*) INTO b_json FROM public.bookings b WHERE b.id = _booking_id;
  IF b_json IS NULL THEN RETURN; END IF;
  SELECT to_jsonb(ca.*) INTO ca_json FROM public.booking_card_authorizations ca WHERE ca.booking_id = _booking_id;
  INSERT INTO public.deleted_bookings (id, booking, card_auth, deleted_at, deleted_by)
  VALUES (_booking_id, b_json, ca_json, now(), uid)
  ON CONFLICT (id) DO UPDATE SET booking = EXCLUDED.booking, card_auth = EXCLUDED.card_auth, deleted_at = now(), deleted_by = uid;
  DELETE FROM public.bookings WHERE id = _booking_id;
  DELETE FROM public.deleted_bookings WHERE deleted_at < now() - interval '30 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_booking(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b_json jsonb; ca_json jsonb; uid uuid;
BEGIN
  uid := auth.uid();
  IF NOT (has_role(uid,'super_admin'::app_role) OR has_role(uid,'manager'::app_role) OR has_role(uid,'coordinator'::app_role)) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  SELECT booking, card_auth INTO b_json, ca_json FROM public.deleted_bookings WHERE id = _id;
  IF b_json IS NULL THEN RAISE EXCEPTION 'not in trash'; END IF;
  INSERT INTO public.bookings SELECT * FROM jsonb_populate_record(null::public.bookings, b_json)
  ON CONFLICT (id) DO NOTHING;
  IF ca_json IS NOT NULL THEN
    INSERT INTO public.booking_card_authorizations SELECT * FROM jsonb_populate_record(null::public.booking_card_authorizations, ca_json)
    ON CONFLICT (booking_id) DO NOTHING;
  END IF;
  DELETE FROM public.deleted_bookings WHERE id = _id;
  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.purge_deleted_bookings()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  DELETE FROM public.deleted_bookings WHERE deleted_at < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_booking(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_deleted_bookings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_bookings() TO authenticated;
