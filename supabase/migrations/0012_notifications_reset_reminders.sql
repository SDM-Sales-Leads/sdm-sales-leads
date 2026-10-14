-- Notifications (stored on the server, per user), reminder bookkeeping, password-reset codes, and the 5-minute reminder schedule.
-- All three tables are reachable only by the server (row level security on, no browser policies), like every other table here.

create table if not exists public.crm_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  type        text not null,                 -- assigned | changed | reminder | info
  lead_id     text,
  title       text not null,
  body        text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists crm_notifications_user_ix on public.crm_notifications (user_id, created_at desc);
alter table public.crm_notifications enable row level security;

create table if not exists public.crm_reminders_sent (
  key      text primary key,                 -- task:<id>:<due> | meet:<lead>:<date>T<time> | fu:<lead>:<date>
  sent_at  timestamptz not null default now()
);
alter table public.crm_reminders_sent enable row level security;

create table if not exists public.pw_resets (
  email       text primary key,
  code_hash   text not null,
  expires_at  timestamptz not null,
  tries       int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.pw_resets enable row level security;

-- reminders: look every 5 minutes (the server only acts between 07:00 and 20:00 Cairo time)
select cron.unschedule('sdm-reminders') where exists (select 1 from cron.job where jobname = 'sdm-reminders');
select cron.schedule(
  'sdm-reminders',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://iyubegbevtjcvtuubpaq.supabase.co/functions/v1/api/cron/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sdm_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
