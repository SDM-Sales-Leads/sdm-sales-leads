-- Integration with the Land Bank system: plot availability snapshot (pushed by the Land Bank page)
-- and the record of commercial offers printed there. The old plots_cache (Google Sheet) table is left untouched.

create table if not exists public.plots_snapshot (
  id            integer primary key check (id = 1),
  hash          text,
  generated_at  timestamptz,
  updated_at    timestamptz not null default now(),
  plot_count    integer not null default 0,
  data          jsonb not null default '[]'::jsonb
);
alter table public.plots_snapshot enable row level security;
revoke all on public.plots_snapshot from anon, authenticated;
grant all on public.plots_snapshot to service_role;

create table if not exists public.crm_offer_prints (
  id               uuid primary key default gen_random_uuid(),
  contact_id       text,
  lead_id          text,
  offer_type       text not null check (offer_type in ('sales_offer','financial_offer','proposal')),
  plots            jsonb not null default '[]'::jsonb,
  total_value      numeric,
  summary          text,
  doc_name         text,
  printed_by       uuid references public.app_users(id) on delete set null,
  printed_by_name  text,
  printed_at       timestamptz not null default now()
);
create index if not exists crm_offer_prints_contact_ix on public.crm_offer_prints (contact_id);
create index if not exists crm_offer_prints_lead_ix on public.crm_offer_prints (lead_id);
create index if not exists crm_offer_prints_at_ix on public.crm_offer_prints (printed_at desc);
alter table public.crm_offer_prints enable row level security;
revoke all on public.crm_offer_prints from anon, authenticated;
grant all on public.crm_offer_prints to service_role;

insert into public.system_config (key, value)
values ('landbank_url', to_jsonb('https://sdm-land-bank.github.io/'::text))
on conflict (key) do nothing;
