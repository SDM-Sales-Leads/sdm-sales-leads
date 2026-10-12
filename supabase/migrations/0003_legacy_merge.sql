-- Merge of the sales team's previous CRM: audit trail, external sales, targets, owner linking, new permissions.

-- performance: delta sync and status filters
create index if not exists crm_leads_updated_ix on public.crm_leads (updated_at);
create index if not exists crm_leads_status_ix on public.crm_leads (status) where deleted_at is null;
create index if not exists crm_leads_phone_ix2 on public.crm_leads (phone_norm) where deleted_at is null;

alter table public.app_users add column if not exists annual_target numeric;

-- tamper-proof trail of who changed what on a lead (written only by the API; nobody can edit it from the browser)
create table if not exists public.crm_lead_audit (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  lead_id     text not null,
  actor_id    uuid,
  actor_name  text,
  action      text not null,          -- status | owner | source | value | stage | cash | delete | merge | create | import | edit
  from_value  text,
  to_value    text,
  note        text
);
create index if not exists crm_lead_audit_lead_ix on public.crm_lead_audit (lead_id, at desc);
create index if not exists crm_lead_audit_at_ix on public.crm_lead_audit (at desc);
alter table public.crm_lead_audit enable row level security;
revoke all on public.crm_lead_audit from anon, authenticated;
grant all on public.crm_lead_audit to service_role;

-- deals closed outside the system
create table if not exists public.crm_external_sales (
  id          text primary key,
  data        jsonb not null,
  owner_id    uuid references public.app_users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists crm_external_owner_ix on public.crm_external_sales (owner_id);
create or replace trigger crm_external_touch before update on public.crm_external_sales
  for each row execute function public.touch_updated_at();
alter table public.crm_external_sales enable row level security;
revoke all on public.crm_external_sales from anon, authenticated;
grant all on public.crm_external_sales to service_role;
grant usage on all sequences in schema public to service_role;

-- leads imported with an owner NAME are linked to the user as soon as a user with that name exists
create or replace function public.crm_link_owner(p_user uuid, p_name text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.crm_leads
     set assigned_to = p_user,
         data = jsonb_set(jsonb_set(data, '{assignedSalespersonId}', to_jsonb(p_user::text)), '{assignedSalespersonName}', to_jsonb(p_name))
   where assigned_to is null and deleted_at is null
     and lower(btrim(coalesce(data->>'legacyOwnerName', data->>'assignedSalespersonName', ''))) = lower(btrim(p_name))
     and btrim(p_name) <> '';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.crm_link_owner(uuid, text) from public, anon, authenticated;
grant execute on function public.crm_link_owner(uuid, text) to service_role;

-- new permissions for the merged features (roles keep what they have; these are added)
update public.role_permissions set perms = perms || '{"canViewSalesFinance":true,"canConfirmCash":true,"canViewSalesContracts":true,"canManageContracts":true,"canViewSalesTargets":true,"canViewSalesExternal":true,"canViewSalesAudit":true}'::jsonb where role = 'Admin';
update public.role_permissions set perms = perms || '{"canViewSalesFinance":true,"canViewSalesContracts":true,"canManageContracts":true,"canViewSalesTargets":true,"canViewSalesExternal":true,"canViewSalesAudit":true}'::jsonb where role = 'Sales Operation';
update public.role_permissions set perms = perms || '{"canViewSalesContracts":true,"canViewSalesExternal":true,"canViewSalesTargets":true}'::jsonb where role = 'Sales Team Leader';
update public.role_permissions set perms = perms || '{"canViewSalesExternal":true}'::jsonb where role in ('Sales Rep', 'Sales Team');
update public.role_permissions set perms = perms || '{"canViewSalesCrm":true,"canViewSalesFinance":true,"canConfirmCash":true,"canViewSalesContracts":true,"canViewSalesReports":true}'::jsonb where role = 'Finance';

-- roles of the sales organisation (from the previous CRM): same names for people, same reporting lines
insert into public.role_permissions(role,perms) values ($t$Sales Director$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": true, "canViewAdminPanel": false, "canCreateWorkflow": true, "canApproveWorkflow": true, "canEditWorkflow": false, "canCommentWorkflow": false, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": true, "canViewSalesReports": true, "canViewSalesContacts": true, "canViewSalesCompanies": true, "canViewSalesActivities": true, "canViewSalesPlotsInventory": true, "canDistributeLeads": true, "canViewSalesTransfer": true, "canViewSalesFinance": true, "canViewSalesContracts": true, "canViewSalesTargets": true, "canViewSalesExternal": true, "canViewSalesAudit": true, "canViewSalesMail": true, "allowedDepartmentsToCreate": ["Sales", "CRM"], "allowedDepartmentsToApprove": ["Sales", "CRM"]}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
insert into public.role_permissions(role,perms) values ($t$Marketing$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": false, "canViewAdminPanel": false, "canCreateWorkflow": false, "canApproveWorkflow": false, "canEditWorkflow": false, "canCommentWorkflow": false, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": true, "canViewSalesReports": true, "canViewSalesContacts": true, "canViewSalesCompanies": true, "canViewSalesActivities": true, "canViewSalesPlotsInventory": true, "canViewAllLeads": true, "canEditLeadIdentity": true, "canViewSalesTransfer": true, "canViewSalesMail": true, "canViewSalesCampaigns": true}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
insert into public.role_permissions(role,perms) values ($t$Marketing Manager$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": false, "canViewAdminPanel": false, "canCreateWorkflow": false, "canApproveWorkflow": false, "canEditWorkflow": false, "canCommentWorkflow": false, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": true, "canViewSalesReports": true, "canViewSalesContacts": true, "canViewSalesCompanies": true, "canViewSalesActivities": true, "canViewSalesPlotsInventory": true, "canViewAllLeads": true, "canEditLeadIdentity": true, "canViewSalesTransfer": true, "canViewSalesMail": true, "canViewSalesCampaigns": true, "canViewSalesTargets": true, "canViewSalesAudit": true, "canViewSalesFinance": true}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
insert into public.role_permissions(role,perms) values ($t$Executive (View)$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": false, "canViewAdminPanel": false, "canCreateWorkflow": false, "canApproveWorkflow": false, "canEditWorkflow": false, "canCommentWorkflow": false, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": true, "canViewSalesReports": true, "canViewSalesContacts": true, "canViewSalesCompanies": true, "canViewSalesActivities": true, "canViewSalesPlotsInventory": true, "canViewAllLeads": true, "canViewSalesFinance": true, "canViewSalesContracts": true, "canViewSalesTargets": true, "canViewSalesExternal": true, "canViewSalesAudit": true}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
insert into public.role_permissions(role,perms) values ($t$HR Admin$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": false, "canViewAdminPanel": true, "canCreateWorkflow": false, "canApproveWorkflow": false, "canEditWorkflow": false, "canCommentWorkflow": false, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": true, "canViewSalesReports": true, "canViewSalesContacts": true, "canViewSalesCompanies": true, "canViewSalesActivities": true, "canViewSalesPlotsInventory": true, "canViewAllLeads": true, "canViewSalesAudit": true, "canViewSalesTargets": true}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
insert into public.role_permissions(role,perms) values ($t$Finance Manager$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": true, "canViewAdminPanel": false, "canCreateWorkflow": true, "canApproveWorkflow": true, "canEditWorkflow": true, "canCommentWorkflow": true, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": false, "canViewSalesReports": true, "canViewSalesContacts": false, "canViewSalesCompanies": false, "canViewSalesActivities": false, "canViewSalesPlotsInventory": false, "canConfirmCash": true, "canViewSalesFinance": true, "canViewSalesContracts": true, "canViewSalesTargets": true}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
insert into public.role_permissions(role,perms) values ($t$Business Development$t$,$j${"canViewDashboard": false, "canViewTickets": false, "canViewKnowledgeBase": false, "canViewWorkflowBuilder": false, "canViewAdminPanel": false, "canCreateWorkflow": false, "canApproveWorkflow": false, "canEditWorkflow": false, "canCommentWorkflow": false, "canViewSalesCrm": true, "canViewSalesDashboard": true, "canViewSalesLeads": true, "canViewSalesReports": false, "canViewSalesContacts": false, "canViewSalesCompanies": false, "canViewSalesActivities": false, "canViewSalesPlotsInventory": true, "canViewSalesExternal": true}$j$::jsonb) on conflict (role) do update set perms = public.role_permissions.perms || excluded.perms;
-- Finance (accounts receivable) already exists: it only confirms cash on won deals
update public.role_permissions set perms = perms || '{"canViewSalesCrm":true,"canViewSalesFinance":true,"canConfirmCash":true,"canViewSalesContracts":true,"canViewSalesReports":true,"canViewSalesDashboard":true}'::jsonb where role = 'Finance';
