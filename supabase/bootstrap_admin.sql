-- Run ONCE after you created your own login in Supabase (Authentication -> Users -> Add user, "Auto Confirm User" on).
-- It turns that login into the first administrator. Change the e-mail and name below.
insert into public.app_users (id, email, name, role, department, active, must_change_password)
select id, email, 'Your Name', 'Admin', 'CRM', true, false
from auth.users
where lower(email) = lower('you@company.com')
on conflict (id) do update set role = 'Admin', active = true;
