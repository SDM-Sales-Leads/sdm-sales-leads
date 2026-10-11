-- SDM Sales Leads — schema (Supabase / Postgres)
--
-- Security model: EVERY table has row level security switched on and NO policy and NO grant for the
-- browser roles (anon / authenticated). The browser never talks to these tables. It calls the `api`
-- edge function, which checks the caller's login and role and then reads/writes with the service role.
-- So a stolen publishable key alone gives nothing.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- people & permissions
-- ---------------------------------------------------------------------------------------------
create table if not exists public.app_users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  name                 text not null,
  role                 text not null default 'Requester',
  department           text,
  team_leader_id       uuid references public.app_users(id) on delete set null,
  active               boolean not null default true,
  on_leave             boolean not null default false,
  must_change_password boolean not null default false,
  legacy_id            text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index if not exists app_users_email_uq on public.app_users (lower(email));
create index if not exists app_users_role_ix on public.app_users (role);
create or replace trigger app_users_touch before update on public.app_users
  for each row execute function public.touch_updated_at();

create table if not exists public.role_permissions (
  role        text primary key,
  perms       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- service desk
-- ---------------------------------------------------------------------------------------------
create table if not exists public.categories (
  id          bigint generated always as identity primary key,
  type        text not null,
  subtype     text not null,
  department  text,
  unique (type, subtype)
);

create table if not exists public.sla (
  priority  text primary key,
  hours     integer not null check (hours > 0 and hours <= 8760)
);

create table if not exists public.articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  content     text not null,
  category    text,
  author      text,
  views       integer not null default 0,
  created_at  timestamptz not null default now()
);

create sequence if not exists public.ticket_no start 100;
create table if not exists public.tickets (
  id            bigint primary key default nextval('public.ticket_no'),
  data          jsonb not null,
  requester_id  uuid references public.app_users(id) on delete set null,
  assigned_to   uuid references public.app_users(id) on delete set null,
  department    text,
  status        text not null default 'New',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tickets_requester_ix on public.tickets (requester_id);
create index if not exists tickets_assigned_ix on public.tickets (assigned_to);
create index if not exists tickets_dept_ix on public.tickets (department);
create or replace trigger tickets_touch before update on public.tickets
  for each row execute function public.touch_updated_at();

create table if not exists public.workflow_requests (
  id          text primary key default substr(md5(gen_random_uuid()::text), 1, 9),
  data        jsonb not null,
  created_by  uuid references public.app_users(id) on delete set null,
  department  text,
  status      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create or replace trigger workflow_requests_touch before update on public.workflow_requests
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- sales CRM  (rows keep the UI's JSON shape in `data`; a few columns are lifted out for rules,
--             de-duplication and speed). Deleting = soft delete (deleted_at): a deleted lead keeps its
--             e-mail id / phone / e-mail, so mail ingestion does not bring it back.
-- ---------------------------------------------------------------------------------------------
create sequence if not exists public.lead_no start 1001;
create sequence if not exists public.contact_no start 1001;
create sequence if not exists public.company_no start 1001;

create table if not exists public.crm_leads (
  id           text primary key,
  data         jsonb not null,
  assigned_to  uuid references public.app_users(id) on delete set null,
  created_by   uuid references public.app_users(id) on delete set null,
  email_id     text,
  phone_norm   text,
  email_norm   text,
  status       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index if not exists crm_leads_email_id_uq on public.crm_leads (email_id) where email_id is not null;
create index if not exists crm_leads_assigned_ix on public.crm_leads (assigned_to) where deleted_at is null;
create index if not exists crm_leads_phone_ix on public.crm_leads (phone_norm) where phone_norm is not null;
create index if not exists crm_leads_email_ix on public.crm_leads (email_norm) where email_norm is not null;
create or replace trigger crm_leads_touch before update on public.crm_leads
  for each row execute function public.touch_updated_at();

create table if not exists public.crm_contacts (
  id          text primary key,
  data        jsonb not null,
  phone_norm  text,
  email_norm  text,
  name_norm   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists crm_contacts_phone_ix on public.crm_contacts (phone_norm) where phone_norm is not null;
create index if not exists crm_contacts_email_ix on public.crm_contacts (email_norm) where email_norm is not null;
create or replace trigger crm_contacts_touch before update on public.crm_contacts
  for each row execute function public.touch_updated_at();

create table if not exists public.crm_companies (
  id          text primary key,
  data        jsonb not null,
  name_norm   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists crm_companies_name_ix on public.crm_companies (name_norm);
create or replace trigger crm_companies_touch before update on public.crm_companies
  for each row execute function public.touch_updated_at();

create table if not exists public.crm_tasks (
  id          text primary key,
  data        jsonb not null,
  owner_id    uuid references public.app_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crm_tasks_owner_ix on public.crm_tasks (owner_id);

create table if not exists public.crm_activities (
  id          text primary key,
  data        jsonb not null,
  owner_id    uuid references public.app_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crm_activities_owner_ix on public.crm_activities (owner_id);

create table if not exists public.crm_email_logs (
  id           text primary key,            -- the Exchange item id
  data         jsonb not null,
  received_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists crm_email_logs_recv_ix on public.crm_email_logs (received_at desc);

create or replace trigger crm_tasks_touch before update on public.crm_tasks
  for each row execute function public.touch_updated_at();
create or replace trigger crm_activities_touch before update on public.crm_activities
  for each row execute function public.touch_updated_at();
create or replace trigger crm_email_logs_touch before update on public.crm_email_logs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- configuration, caches, logs
-- ---------------------------------------------------------------------------------------------
create table if not exists public.system_config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

create table if not exists public.plots_cache (
  id         integer primary key check (id = 1),
  sheet_url  text,
  csv        text,
  synced_at  timestamptz
);

create table if not exists public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  user_id    uuid,
  user_name  text,
  action     text not null,
  details    text,
  type       text not null default 'system'
);
create index if not exists activity_logs_at_ix on public.activity_logs (at desc);

create table if not exists public.notification_logs (
  id         uuid primary key default gen_random_uuid(),
  at         timestamptz not null default now(),
  to_email   text,
  subject    text,
  status     text not null,
  error      text,
  ticket_id  text,
  type       text
);
create index if not exists notification_logs_at_ix on public.notification_logs (at desc);

-- fixed-window rate limiter used by the edge function
create table if not exists public.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (bucket, window_start)
);

-- short-lived locks (e.g. only one mail ingestion at a time)
create table if not exists public.app_locks (
  name   text primary key,
  until  timestamptz not null
);

-- ---------------------------------------------------------------------------------------------
-- functions (service role only)
-- ---------------------------------------------------------------------------------------------
create or replace function public.app_next_id(p_kind text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'lead' then return 'LD-' || nextval('public.lead_no');
  elsif p_kind = 'contact' then return 'CON-' || nextval('public.contact_no');
  elsif p_kind = 'company' then return 'COM-' || nextval('public.company_no');
  elsif p_kind = 'ticket' then return nextval('public.ticket_no')::text;
  else raise exception 'unknown id kind %', p_kind; end if;
end $$;

create or replace function public.app_try_lock(p_name text, p_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare got boolean;
begin
  insert into public.app_locks as l (name, until) values (p_name, now() + make_interval(secs => p_seconds))
  on conflict (name) do update set until = excluded.until where l.until < now()
  returning true into got;
  return coalesce(got, false);
end $$;

create or replace function public.app_unlock(p_name text) returns void
language sql security definer set search_path = public as $$
  delete from public.app_locks where name = p_name;
$$;

create or replace function public.app_rate_hit(p_bucket text, p_window_seconds integer, p_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare w timestamptz; n integer;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits as r (bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_limit;
end $$;

-- secrets live in Supabase Vault (encrypted at rest); only the service role can read them
create extension if not exists supabase_vault with schema vault;

create or replace function public.app_set_secret(p_name text, p_value text) returns void
language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  if p_name !~ '^[a-z0-9_]{3,40}$' then raise exception 'bad secret name'; end if;
  select id into sid from vault.secrets where name = 'sdm_' || p_name;
  if p_value is null or p_value = '' then
    if sid is not null then delete from vault.secrets where id = sid; end if;
  elsif sid is null then
    perform vault.create_secret(p_value, 'sdm_' || p_name, 'SDM Sales Leads');
  else
    perform vault.update_secret(sid, p_value, 'sdm_' || p_name);
  end if;
end $$;

create or replace function public.app_get_secret(p_name text) returns text
language sql security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'sdm_' || p_name limit 1;
$$;

create or replace function public.app_has_secret(p_name text) returns boolean
language sql security definer set search_path = public, vault as $$
  select exists (select 1 from vault.secrets where name = 'sdm_' || p_name);
$$;

-- ---------------------------------------------------------------------------------------------
-- lock everything down; give the service role (edge function) what it needs
-- ---------------------------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- log retention (daily): keep 90 days of activity, 30 days of notifications
create or replace function public.app_prune_logs() returns void
language sql security definer set search_path = public as $$
  delete from public.activity_logs where at < now() - interval '90 days';
  delete from public.notification_logs where at < now() - interval '30 days';
$$;
revoke all on function public.app_prune_logs() from public, anon, authenticated;
grant execute on function public.app_prune_logs() to service_role;
