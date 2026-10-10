-- The private classes each teacher can pick by name in her Teacher Panel.
--
-- Some private classes are not on the class schedule (GYROTONIC® on the
-- tower, Couple's & Connection, Kinesiology…). The team adds them per teacher
-- in Admin → Teachers → Details; she then picks one in "Which class" and sets
-- her prices. Only the team edits the list — a teacher cannot change her own.
--
-- Additive: one new column with an empty default. Evelina starts with the
-- three she has today.

alter table public.teachers
  add column if not exists private_class_choices text[] not null default '{}';

update public.teachers
   set private_class_choices = array['GYROTONIC®', 'Couple''s & Connection', 'Kinesiology']
 where id = '0839ddb9-ebec-4917-bc7e-570fe0ed9594'
   and private_class_choices = '{}';

-- Same function as before, plus: a teacher cannot change her own list.
create or replace function public.teachers_protect_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 1 then
    new.updated_at := now();
    return new;
  end if;

  if not (public.has_role(auth.uid(),'super_admin') or public.has_role(auth.uid(),'manager')) then
    -- A teacher may edit her name and her payment instructions. Nothing that
    -- affects what she owes, and nothing that grants access.
    new.studio_rate := old.studio_rate;
    new.user_id     := old.user_id;
    new.email       := old.email;
    new.active      := old.active;
    -- The private classes she can pick are set by the team.
    new.private_class_choices := old.private_class_choices;

    if btrim(coalesce(new.display_name,'')) = '' then
      raise exception 'Your name cannot be empty';
    end if;
    if lower(btrim(new.display_name)) is distinct from lower(btrim(old.display_name))
       and exists (
         select 1 from public.teachers
         where id <> old.id and lower(btrim(display_name)) = lower(btrim(new.display_name))
       ) then
      raise exception 'Another teacher already uses that name';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $function$;

notify pgrst, 'reload schema';
