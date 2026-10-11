# SDM Sales Leads

Sales CRM, IT service desk and workflow/SLA builder for SDM, running on **Supabase** (database, login, API function)
with a static React site on **GitHub Pages**.

```
 browser (GitHub Pages, React)  ──login──▶  Supabase Auth
            │
            └── /api/*  ──▶  Supabase Edge Function "api"  ──▶  Postgres (all tables locked by RLS)
                                   │
                                   ├──▶ Exchange Web Services (send mail / read the sales mailbox)
                                   ├──▶ Google Sheets (land inventory CSV)
                                   └──▶ Gemini (reads lead e-mails, optional)
```

The browser never reads a table directly. Every request carries the user's login token; the function checks who
the person is, what their role may do, and which rows they may see, then reads or writes with the service role.

## What is in the repo

| Path | What |
|---|---|
| `src/` | the React app (Vite, Tailwind 4) |
| `supabase/migrations/` | database schema (run in order in the SQL editor) |
| `supabase/functions/api/` | the API: `routes_*.ts` (core, tickets, crm, plots), `ingest.ts` (mail → leads), `ews.ts` (Exchange) |
| `supabase/bootstrap_admin.sql` | turns your first login into the administrator |
| `docs/` | `REVIEW.md` (what the code review found and fixed), `DEPLOY.md` (set-up steps), `reference/` |

## Run locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # type-check + production build into dist/
```

Edge function bundle (what gets pasted into the Supabase editor, or deployed with the CLI):

```bash
npx esbuild supabase/functions/api/index.ts --bundle --format=esm --platform=neutral \
  --target=es2022 --external:'npm:*' --outfile=dist-fn/api.js
```

## Roles and access

Roles and their permission flags live in the `role_permissions` table (Admin → Roles). Lead visibility follows the
role: Admin / Sales Operation see all leads, a Sales Team Leader sees their team, everyone else sees their own.
See `docs/REVIEW.md` for the full list of rules enforced on the server.

## Security in one paragraph

No plain-text passwords (Supabase Auth). No public sign-up. Every table has RLS on with no browser policy. All API
routes require a login and a role check. Secrets (mailbox password, Gemini key) are stored encrypted in Supabase
Vault and are never sent to the browser. Cost/profit/client columns of the land sheet are removed on the server for
roles that may not see them. Customer data is not stored on disk in the browser. Details: `docs/REVIEW.md`.
