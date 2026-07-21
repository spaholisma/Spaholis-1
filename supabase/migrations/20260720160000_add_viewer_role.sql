-- Read-only calendar role: sees the treatments schedule (operational fields
-- only), never card/contact/health data, and cannot write anything.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'viewer';
