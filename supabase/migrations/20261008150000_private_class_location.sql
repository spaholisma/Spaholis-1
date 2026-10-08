-- Private class requests: where the guest would like the class.
--
-- The request form now asks for the place — the Holis Wellness studio, the
-- guest's own place (with the address), or the beach (only with the teachers
-- who give it there). It is kept in bookings.intake_form->'private_class'
-- (location, location_label, location_address); no table changes.
--
-- The teacher's list of her requests also returns it. Same function as before
-- with two columns added at the end; the return type changes, so it is dropped
-- and created again, with the same grants.

drop function if exists public.teacher_private_class_requests();

create function public.teacher_private_class_requests()
 returns table(booking_id uuid, created_at timestamp with time zone, guest_name text, guest_email text, guest_phone text,
               kind_title text, people integer, class_title text, preferred text, status text, note text,
               quoted_price numeric, location_label text, location_address text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select b.id, b.created_at, b.guest_name, b.guest_email, b.guest_phone,
         b.intake_form->'private_class'->>'kind_title',
         nullif(b.intake_form->'private_class'->>'people', '')::int,
         b.intake_form->'private_class'->>'class_title',
         b.intake_form->'private_class'->>'preferred',
         coalesce(s.status, 'new'),
         s.note,
         case when (b.intake_form->'private_class'->>'offering_id') ~* '^[0-9a-f-]{36}$'
              then public.private_offering_price(
                     (b.intake_form->'private_class'->>'offering_id')::uuid,
                     b.intake_form->'private_class'->>'kind',
                     nullif(b.intake_form->'private_class'->>'people', '')::int)
         end,
         b.intake_form->'private_class'->>'location_label',
         left(b.intake_form->'private_class'->>'location_address', 300)
  from public.bookings b
  join public.teachers t on t.id = public.current_teacher_id()
  left join public.private_class_teacher_status s
    on s.booking_id = b.id and s.teacher_id = t.id
  where b.intake_form ? 'private_class'
    and public.norm_name(b.intake_form->'private_class'->>'teacher_name') = public.norm_name(t.display_name)
  order by b.created_at desc
  limit 200
$function$;

revoke all on function public.teacher_private_class_requests() from public, anon;
grant execute on function public.teacher_private_class_requests() to authenticated;

notify pgrst, 'reload schema';
