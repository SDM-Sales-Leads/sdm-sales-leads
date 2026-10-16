# sdm-sales-leads — project notes (loaded only when working in this folder)

Sales CRM, IT service desk and workflow/SLA builder. React 19 + Vite + Tailwind 4 on GitHub Pages; Supabase (Auth, Postgres,
edge function `api`). The browser never reads a table directly: every call goes to `/api/*` with the user's token; the function
checks role and row access, then uses the service role.

## Where things are
- `src/` React app. `src/components/crm/types.ts` + `leadConfig.ts` = shared foundation (statuses, sources, priorities, stages).
  Use them; never hard-code status/source lists.
- `supabase/functions/api/` API: `routes_*.ts`, `leadrules.ts` (server-side rules), `ingest.ts` (mail → leads), `ews.ts` (Exchange).
- `supabase/migrations/` schema, run in order. `docs/DEPLOY.md` set-up steps, `docs/REVIEW.md` security rules enforced.
- Old CRM reference (specs, data): `../migration/oldcrm/`. Read only the spec section the task needs.

## Commands
- `npm run dev` (127.0.0.1:5173) · `npx tsc --noEmit -p .` · `npx vite build` (must pass).
- Edge function bundle: `npx esbuild supabase/functions/api/index.ts --bundle --format=esm --platform=neutral --target=es2022 --external:'npm:*' --outfile=dist-fn/api.js`
- Check Node with `which node` first; do not rely on an old temp path.

## Menu and looks
- ONE menu list: `src/components/navGroups.ts` (12 groups, tabs, role rules). All three looks (Current `Sidebar.tsx`, Classic `OldViewShell.tsx`, Glass `GlassShell.tsx` + `MobileTabBar.tsx`) read it. Never add a menu entry in a look itself.
- Server bundle deploy: build with esbuild, open the Supabase function code page in the built-in browser, inject a file input, Walid picks `dist-fn/api.js` and presses Deploy. Notifications stay on hold until Walid says "unhold".

## Rules
- Our system is the main project: keep its look and conventions (brand-red, brand-gray, rounded-2xl, lucide icons, sonner toasts, motion).
  Extend an existing feature; never build a second copy.
- Keep the sales team's vocabulary (statuses, fields, wording). English UI text.
- The SERVER enforces fairness: only Sales Operation / team leaders distribute leads; reps cannot change owner, source, phone, email,
  lead date or priority; only accounts receivable confirms cash. Read `leadrules.ts` so the UI does not fight it; show the server's
  reason in a toast.
- No invented numbers ("—" / "n/a"). No secrets or keys in the browser. No personal data in URLs. Sanitise HTML (DOMPurify).
- Performance: 4,000+ leads must not freeze the page. Paginate/virtualise, memoise, debounce search, avoid O(n²) per render.
- Don't git commit, run SQL, or deploy unless asked. Final report: files changed, what was deliberately not ported, and any
  server change needed.
