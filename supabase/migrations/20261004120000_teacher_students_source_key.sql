-- A teacher can now edit any student on her list — also the ones who came to
-- her from a class booking. The booking itself is never touched (Holis keeps
-- it as it was); her edit is her own record, tied to that student by the same
-- key her list groups bookings by: the email, or the name when there is none.
alter table public.teacher_students add column if not exists source_key text;

-- One edit per booked student, per teacher.
create unique index if not exists teacher_students_source_key_uniq
  on public.teacher_students (teacher_id, source_key)
  where source_key is not null;
