-- Demand analytics: richer offer-print record and "Open / Hold in Land Bank" link clicks.
alter table public.crm_offer_prints add column if not exists plan jsonb;

create table if not exists public.crm_lb_clicks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.app_users(id) on delete set null,
  user_name   text,
  plot_key    text,
  kind        text not null check (kind in ('hold','open')),
  lead_id     text,
  clicked_at  timestamptz not null default now()
);
create index if not exists crm_lb_clicks_at_ix on public.crm_lb_clicks (clicked_at desc);
create index if not exists crm_lb_clicks_user_ix on public.crm_lb_clicks (user_id, clicked_at desc);
alter table public.crm_lb_clicks enable row level security;
revoke all on public.crm_lb_clicks from anon, authenticated;
grant all on public.crm_lb_clicks to service_role;
