-- Automatic mailbox + Facebook sheet sync.
-- A free scheduler calls the system every hour at :05. The system itself only works at 09:00, 11:00, 13:00, 15:00 and
-- 17:00 Cairo time, Sunday to Thursday (see /cron/ingest in index.ts), so winter/summer clock changes do not matter.
-- To switch it off: run   select cron.unschedule('sdm-ingest-hourly');   or set system_config ingest_auto to false.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- the shared secret the scheduler sends (created once; the value is never shown)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'sdm_cron_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'sdm_cron_secret');
  end if;
end $$;

insert into public.system_config (key, value) values ('ingest_auto', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb;

select cron.unschedule('sdm-ingest-hourly') where exists (select 1 from cron.job where jobname = 'sdm-ingest-hourly');
select cron.schedule(
  'sdm-ingest-hourly',
  '5 * * * *',
  $job$
  select net.http_post(
    url := 'https://iyubegbevtjcvtuubpaq.supabase.co/functions/v1/api/cron/ingest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sdm_cron_secret' limit 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
