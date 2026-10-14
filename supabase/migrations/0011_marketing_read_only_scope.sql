-- Marketing sees ALL leads (reports, Marketing lists, filters) but does not get Sales Operation's powers.
-- "canDistributeLeads" made the Marketing roles behave like Sales Operation (change owners, admin clean-up tools).
-- Without it they keep: view every lead, Mail Ingestion + both Sync buttons, import / add leads (which go to the routing queue),
-- edit the identity of a lead, and all reports.
update public.role_permissions set perms = perms || '{"canDistributeLeads": false}'::jsonb
 where role in ('Marketing', 'Marketing Manager');

select role, perms->>'canDistributeLeads' as distribute, perms->>'canViewAllLeads' as view_all, perms->>'canViewSalesMail' as mail
  from public.role_permissions order by role;
