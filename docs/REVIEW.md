# Code review of the original app (W-CRM, AI Studio / Express / Firestore) and what changed

The original app was a 4,600-line Express server plus a 24,000-line React front end. The server kept everything in a
JSON file mirrored to Firestore. This file lists what the review found and how the Supabase version handles it.

## A. Security problems in the original (all fixed by design)

| # | Problem | Now |
|---|---|---|
| 1 | **No authentication on any `/api` route.** The "authenticate" middleware was an empty stub. Anyone on the internet could read every ticket, lead and user, or call `POST /api/crm/leads/purge-all`. | Every route except `/health` requires a valid Supabase login; role permissions are checked per route. |
| 2 | **Plain-text passwords**; login was a Firestore `where password == …`; default accounts with known passwords were seeded in code. | Supabase Auth (hashed). No default accounts. Admin-created users get a temporary password and must choose their own at first sign-in. |
| 3 | **`GET /api/admin/config` returned the Gemini API key** and `GET /api/admin/email-config` returned the mailbox password to anyone. | Secrets live in Supabase Vault, write-only from the UI; endpoints only say "set / not set". |
| 4 | **Open mail relay**: `POST /api/notify` sent any text, to any address, from the company mailbox, with unescaped HTML. | The recipient must be the requester or assignee of a ticket the caller can see; all text is HTML-escaped; rate-limited. |
| 5 | **Whole shared mailbox readable** by any user (`/api/crm/webmail`). | Needs the "Sales mail" permission; bodies are sanitised on the server and again in the browser. |
| 6 | **A hard-coded mailbox user and password in the front-end source** (an "Outlook preset" button). It was shipped to every browser. | Removed. **Change that mailbox password**: it must be treated as exposed. |
| 7 | **SSRF**: the plots sheet URL was fetched server-side from user input. | Only `docs.google.com/spreadsheets/d/<id>` links are accepted, and only by administrators. |
| 8 | **Cost / profit / client columns** of the sales sheet were served to every user (`/api/plots-csv`). | Stripped on the server for roles without finance access. |
| 9 | **TLS certificate checks disabled** (`rejectUnauthorized:false`) for mail. | Always verified. |
| 10 | **XML injection** in Exchange requests (subject, addresses, item ids were pasted into XML). | Escaped; item ids validated. |
| 11 | Tickets and leads were filtered **in the browser** after sending everything. | Filtered on the server by role/team/ownership. |
| 12 | `POST /api/tickets/bulk` **replaced the whole ticket table** with the request body; the CRM list endpoints replaced whole lists and inferred deletions from absence. Two people saving at once deleted each other's data. | Row-level upserts with a revision check (`_rev`); conflicts are reported, never overwritten. Import adds/updates, never replaces. Deletes are explicit (soft delete for CRM records). |
| 13 | Request bodies up to 100 MB; no rate limits that mattered (10,000/min). | 2–8 MB caps, per-user rate limits on expensive routes, 5 MB attachment cap in the UI. |
| 14 | Customer data (all leads/contacts, with phone numbers) cached in `localStorage` forever. | Cached per tab only (`sessionStorage`) and wiped at sign-out. |
| 15 | Email HTML rendered with `dangerouslySetInnerHTML` unsanitised; attachments opened by writing a data-URL iframe into a new window (script execution in the app origin); CSV exports allowed spreadsheet formula injection. | Sanitised with DOMPurify; attachments open as typed blobs (SVG never rendered); CSV/Excel cells starting with `= + - @` are neutralised. |
| 16 | Prompt injection: e-mail text went straight into the AI prompt and the reply was trusted. | Text is fenced as data, the reply is clipped and type-checked field by field. |
| 17 | CSP allowed `unsafe-eval` and any `https:` connection. | Site CSP: own scripts only, connections only to the Supabase project. |

## B. Bugs in the original

- Two different lead-id formats (`SL-` in the browser, `LD-` on the server) and ids computed as *max + 1* (race). → ids come from database sequences.
- `routeLeadAutomatically` picked a **random** person and ignored the queue rules (method, caps, daily limit, leave). → real routing on the server: Round Robin, Least Active, Least Total, Random; caps, daily limit, leave/inactive skipping, back-up person; the other methods fall back to Least Active.
- Invented data: default size 1000 m², budget 1,150,000 / 150,000, project "Industria East", fake performance figures, a hard-coded July 2026 calendar, demo approvals, a 23-row mock plots list. → all removed; missing data shows "—".
- Mail ingestion could re-create leads that had been deleted on purpose. → soft delete keeps e-mail id / phone / e-mail, so they are skipped.
- `/api/activity-logs` was called by the UI but did not exist on the server.
- Ticket SLA clock was computed in the browser (anyone could change deadlines). → computed on the server (pause on "Waiting on …", priority change).
- Workflow canvas: stale closures (removing a node after a drag restored old data), double delete resurrecting nodes, dangling next-step references, cycles, `order` not renumbered.
- Dashboards: "today/this week" compared UTC strings with local dates; averages shown as 100 % / 18 minutes with no data; funnel stage names did not match the real statuses.
- Phone numbers compared in different formats (+20 / 0020 / leading 0).
- Private lead notes were visible to everybody.
- "Purge duplicates" deleted Won leads by phone alone.

## C. Server rules (summary)

- **Users**: only managers create/edit; only Admins touch Admin accounts; the last Admin cannot be removed/disabled; disabling a user also bans the login.
- **Tickets**: Requesters see only their own and can only reopen/close; staff see own / assigned / their department / department-less; only Admins delete; history is append-only; step completion requires being the step's team.
- **Workflows**: create needs `canCreateWorkflow` and an allowed department; approve needs `canApproveWorkflow` for that department; feedback needs `canCommentWorkflow`.
- **CRM**: see `crmScope` in `supabase/functions/api/lib.ts`: `all` (Admin, Sales Operation, routing managers), `team` (Team Leader), `own`. Reps cannot reassign or delete leads.
- **Plots sheet**: link changes and syncs by managers; sensitive columns removed unless Admin / Sales Operation / `canViewPlotFinancials`.

## D. Known limits / decisions for the owner

- Attachments are still stored inside the ticket/lead JSON (capped). Moving them to Supabase Storage is the next step if volumes grow.
- Sales Operation (which has the "admin panel" flag) can create users and reset non-admin passwords. Remove `canViewAdminPanel` from that role if that is too much.
- All signed-in staff can list colleagues (name, e-mail, role): needed for assignment pickers.
- Automatic (scheduled) mail ingestion is built but **off**; ingestion runs when a manager presses the button. See `docs/DEPLOY.md` to switch it on.
- Supabase free plan pauses a project after 7 days without activity and has no automatic backups.
