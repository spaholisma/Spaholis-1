-- Teachers make their own events (a Wellness Sunday, a Chakradance…).
--
-- An event is a class in the "Special Event" category, so it shows on the
-- Classes page under "Workshops & Special Events" exactly like the ones Holis
-- adds, and it is booked and paid the same way (to her). What is new is that
-- it belongs to a teacher: she can create it, edit it, switch it off and
-- delete it — only her own, and only through these functions, which decide
-- which fields she may set. Its dates are ordinary sessions, added and removed
-- with the rules her calendar already uses.

alter table public.classes
  add column if not exists teacher_id uuid references public.teachers(id) on delete set null;
create index if not exists classes_teacher_id_idx on public.classes (teacher_id);

-- Create (no _id) or edit (her own _id) an event. Returns its id.
create or replace function public.teacher_save_event(
  _id uuid, _title text, _description text, _image_url text, _price numeric,
  _price_label text, _max_capacity integer, _duration_minutes integer,
  _location text, _is_active boolean
) returns uuid
 language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_teacher uuid := public.current_teacher_id();
  v_name    text := public.current_teacher_name();
  v_title   text := btrim(coalesce(_title, ''));
  v_desc    text := nullif(btrim(coalesce(_description, '')), '');
  v_price   numeric := round(coalesce(_price, 0), 2);
  v_id      uuid;
begin
  if v_teacher is null then
    raise exception 'Only teachers can save events';
  end if;
  if length(v_title) < 3 or length(v_title) > 120 then
    raise exception 'Give the event a title (3 to 120 characters)';
  end if;
  if v_desc is not null and length(v_desc) > 4000 then
    raise exception 'The description is too long (4000 characters at most)';
  end if;
  if v_price < 0 or v_price > 5000 then
    raise exception 'The price must be between 0 and 5000';
  end if;
  if _max_capacity is null or _max_capacity < 1 or _max_capacity > 200 then
    raise exception 'Spots must be between 1 and 200';
  end if;
  if _duration_minutes is null or _duration_minutes < 15 or _duration_minutes > 720 then
    raise exception 'The duration must be between 15 minutes and 12 hours';
  end if;
  if _image_url is not null and btrim(_image_url) <> '' and _image_url !~* '^https://[^[:space:]]+$' then
    raise exception 'The photo link must start with https://';
  end if;

  if _id is null then
    insert into public.classes (
      title, description, category, instructor, duration_minutes, price, max_capacity,
      is_active, requires_payment, is_recurring, image_url, location, price_label, teacher_id
    ) values (
      v_title, v_desc, 'Special Event', v_name, _duration_minutes, v_price, _max_capacity,
      coalesce(_is_active, true), v_price > 0, false, nullif(btrim(coalesce(_image_url, '')), ''),
      coalesce(nullif(btrim(coalesce(_location, '')), ''), 'Holis Wellness Center'),
      nullif(btrim(coalesce(_price_label, '')), ''), v_teacher
    ) returning id into v_id;
  else
    update public.classes set
      title = v_title,
      description = v_desc,
      duration_minutes = _duration_minutes,
      price = v_price,
      requires_payment = v_price > 0,
      max_capacity = _max_capacity,
      is_active = coalesce(_is_active, is_active),
      image_url = nullif(btrim(coalesce(_image_url, '')), ''),
      location = coalesce(nullif(btrim(coalesce(_location, '')), ''), 'Holis Wellness Center'),
      price_label = nullif(btrim(coalesce(_price_label, '')), ''),
      updated_at = now()
    where id = _id and teacher_id = v_teacher
    returning id into v_id;
    if v_id is null then
      raise exception 'That event is not yours';
    end if;
  end if;
  return v_id;
end $function$;

-- Show or hide one of her events on the website.
create or replace function public.teacher_set_event_active(_id uuid, _active boolean)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_teacher uuid := public.current_teacher_id();
begin
  if v_teacher is null then raise exception 'Only teachers can change events'; end if;
  update public.classes set is_active = coalesce(_active, false), updated_at = now()
   where id = _id and teacher_id = v_teacher;
  if not found then raise exception 'That event is not yours'; end if;
end $function$;

-- Delete one of her events. Only while nobody ever booked it: its bookings
-- are history (payments, attendance), so a booked event is switched off instead.
create or replace function public.teacher_delete_event(_id uuid)
 returns void
 language plpgsql security definer set search_path to 'public'
as $function$
declare v_teacher uuid := public.current_teacher_id();
begin
  if v_teacher is null then raise exception 'Only teachers can delete events'; end if;
  if not exists (select 1 from public.classes where id = _id and teacher_id = v_teacher) then
    raise exception 'That event is not yours';
  end if;
  if exists (
    select 1 from public.class_bookings b
      join public.class_schedule s on s.id = b.schedule_id
     where s.class_id = _id
  ) then
    raise exception 'Someone has booked this event, so it cannot be deleted — switch it off instead';
  end if;
  -- Removing her own empty dates is not news for anyone.
  perform set_config('holis.quiet_teacher_notify', 'on', true);
  delete from public.class_schedule where class_id = _id;
  delete from public.classes where id = _id and teacher_id = v_teacher;
end $function$;

revoke all on function public.teacher_save_event(uuid, text, text, text, numeric, text, integer, integer, text, boolean) from public;
revoke all on function public.teacher_set_event_active(uuid, boolean) from public;
revoke all on function public.teacher_delete_event(uuid) from public;
grant execute on function public.teacher_save_event(uuid, text, text, text, numeric, text, integer, integer, text, boolean) to authenticated;
grant execute on function public.teacher_set_event_active(uuid, boolean) to authenticated;
grant execute on function public.teacher_delete_event(uuid) to authenticated;

notify pgrst, 'reload schema';
