-- BD weekly tracker: one row per person, week (Sunday) and category. Written only by the API (service_role).
create table if not exists public.crm_bd_weekly (
  member_id   uuid not null references public.app_users(id) on delete cascade,
  week        date not null,
  category    text not null,
  target      int  not null default 0 check (target between 0 and 100000),
  done        int  not null default 0 check (done between 0 and 100000),
  notes       text not null default '' check (length(notes) <= 2000),
  updated_at  timestamptz not null default now(),
  primary key (member_id, week, category)
);
create index if not exists crm_bd_weekly_week_ix on public.crm_bd_weekly (week);
alter table public.crm_bd_weekly enable row level security;
revoke all on public.crm_bd_weekly from anon, authenticated;
grant all on public.crm_bd_weekly to service_role;
