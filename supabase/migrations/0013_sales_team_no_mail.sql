-- The "Sales Team" role still had Mail Ingestion (and the mail log behind it). The rule is: Sales Operation and Marketing only.
update public.role_permissions set perms = perms || '{"canViewSalesMail": false}'::jsonb where role = 'Sales Team';
select role, perms->>'canViewSalesMail' as mail_ingestion from public.role_permissions order by role;
