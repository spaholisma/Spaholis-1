-- A Drop-in is one class.
--
-- The Drop-in offering had no credits at all, so a guest who bought one
-- (first time: 19 Sep 2026, online, $23) held a pass that book_class_with_
-- membership_token() rejected with "No credits remaining". Applied live on
-- 19 Sep together with fixing that one purchase; kept here so a rebuilt
-- database gets it too.
update public.offerings set credits = 1 where type = 'drop_in' and credits is null;

update public.user_offerings
   set credits_total = 1, credits_remaining = 1
 where type = 'drop_in' and credits_remaining is null and status = 'active';
