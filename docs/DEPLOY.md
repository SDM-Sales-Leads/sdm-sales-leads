# Deploy / set-up checklist

1. **Supabase project** (done once): create it in your organisation, region near you. Keep "Automatically expose new tables" **off**.
2. **SQL**: run `supabase/migrations/0001_schema.sql`, then `0002_touch_triggers.sql` in the SQL editor
   (0002 is only needed on databases created before it was merged into 0001).
3. **Seed data** (roles, categories, SLA, workflow templates): private file, not in this repo.
4. **Function**: bundle (see README) and deploy as an edge function named `api` with **Verify JWT off**
   (the function checks the login itself).
5. **Auth**: Authentication → Sign In / Providers → turn **off** "Allow new users to sign up".
6. **First administrator**: Authentication → Users → Add user (e-mail + password you choose, "Auto Confirm User"),
   then run `supabase/bootstrap_admin.sql` (edit the e-mail first).
7. **Site**: push this repo to GitHub, Settings → Pages → Source: **GitHub Actions**. The workflow builds and publishes.
8. **Allowed origin**: the function accepts browser calls only from `https://sdm-sales-leads.github.io` and local dev.
   Another host? Set the function secret `ALLOWED_ORIGINS` (comma-separated).
9. **In the app (Admin → System)**: mailbox host / user / password (Exchange), optional Gemini key. Then add users.

## Optional: automatic mail ingestion every 10 minutes
Store a random secret under the name `cron_secret` (Vault), set `system_config.ingest_auto = true`, and schedule
`pg_cron` + `pg_net` to POST `/functions/v1/api/cron/ingest` with header `x-cron-secret`. Leave it off if the
Gemini key is on a small free quota.
