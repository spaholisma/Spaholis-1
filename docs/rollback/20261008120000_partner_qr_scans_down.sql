-- ROLLBACK for supabase/migrations/20261008120000_partner_qr_scans.sql
--
-- Kept OUTSIDE supabase/migrations on purpose, so it is never applied by accident.
-- Run by hand (SQL editor) only if the QR scan counter has to be removed.
--
-- What it removes: only the two objects that migration created.
-- What it keeps:   every other table, function, policy and row in the database.
-- What is lost:    the QR scan counts collected since the migration was applied.
--                  To keep them, export first:
--                    select * from public.partner_qr_scans order by scanned_at;
--
-- Safe at any time: the /go page ignores a failed or missing RPC
-- (src/lib/qrScans.ts), so visitors still reach WhatsApp / Google Reviews.

begin;
drop function if exists public.record_partner_qr_scan(text, text, text, text);
drop table if exists public.partner_qr_scans;  -- also drops its index and policy
commit;

notify pgrst, 'reload schema';
