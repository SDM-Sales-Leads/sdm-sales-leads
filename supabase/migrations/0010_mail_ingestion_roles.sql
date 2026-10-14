-- Mail Ingestion (the page, and the Sync Inbox / Sync Google Sheet buttons): Sales Operation and Marketing only.
-- Admin always has it. The same switch is in Admin Panel -> role permissions -> "Mail Ingestion".
update public.role_permissions set perms = perms || '{"canViewSalesMail": true}'::jsonb
 where role in ('Sales Operation', 'Marketing', 'Marketing Manager');

update public.role_permissions set perms = perms || '{"canViewSalesMail": false}'::jsonb
 where role in ('Sales Team Leader', 'Sales Rep', 'Sales Director');

select role, perms->>'canViewSalesMail' as mail_ingestion from public.role_permissions order by role;
