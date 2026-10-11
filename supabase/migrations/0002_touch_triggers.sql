-- Fix for databases created from the first version of 0001: the optimistic-lock column must change on every update.
alter table public.crm_email_logs add column if not exists updated_at timestamptz not null default now();
create or replace trigger crm_tasks_touch before update on public.crm_tasks
  for each row execute function public.touch_updated_at();
create or replace trigger crm_activities_touch before update on public.crm_activities
  for each row execute function public.touch_updated_at();
create or replace trigger crm_email_logs_touch before update on public.crm_email_logs
  for each row execute function public.touch_updated_at();
