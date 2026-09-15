-- A role for staff who manage the Treatments calendar exactly as an admin does,
-- without the rest of the admin panel. Added on its own: Postgres cannot use a
-- new enum value inside the transaction that creates it.
alter type public.app_role add value if not exists 'treatment_admin';
