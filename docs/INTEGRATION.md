# Integration contract: SDM Sales Leads  <->  SDM Land Bank

Two SEPARATE systems, each with its own Supabase project and its own logins (same people, same e-mail addresses).
Neither stores the other's secrets and no shared secret exists. The only trust link is: the Land Bank browser sends its
own Supabase access token to Sales Leads, and Sales Leads asks the Land Bank auth service who that token belongs to.

| | Sales Leads (CRM) | Land Bank |
|---|---|---|
| Site | https://sdm-sales-leads.github.io/sdm-sales-leads/ | https://sdm-land-bank.github.io/ |
| Supabase | https://iyubegbevtjcvtuubpaq.supabase.co (edge function `api`, base `/functions/v1/api`) | https://ihjlvxmttvjcciafruya.supabase.co (publishable key `sb_publishable_8Q-O8l1q58PmM8kQkEETDQ_g1wwmRbS`) |

## 1. Who is calling (Land Bank -> Sales Leads)
Every `/integration/*` call from the Land Bank page carries `Authorization: Bearer <Land Bank access token>`.
Sales Leads verifies it with `GET https://ihjlvxmttvjcciafruya.supabase.co/auth/v1/user` (headers `apikey: <LB publishable key>`,
`Authorization: Bearer <same token>`) -> `{ email }`. Cache the verified result for 60 s per token. The e-mail is matched
(case-insensitive) to `app_users` (active). No match / inactive / no `canViewSalesCrm` => 403 with a plain message.
The caller then has that person's role, permissions and CRM scope exactly as in Sales Leads (reuse the Caller builder of getCaller).
CORS: the function must also answer the origin `https://sdm-land-bank.github.io` (default allow-list entry).

## 2. Plot snapshot (Land Bank page -> Sales Leads), so sales people can see availability in Sales Leads
Produced by the Land Bank page from its own parsed MDS (same numbers the team sees there), pushed only by Admin / Sales Operation users.
No cost, GP, collected, client or company data is ever included.

`plot` object: `{ key, park, project, unit, status, sector, landType, areaSqm, listPriceSqm, listTotal, merged, holdUntil }`
- `key`: Land Bank key (normalised `project|unit`), `park`: display park name, `project`: MDS sheet name, `unit`: plot code (merged deals: the code as written, e.g. `A-014,015,016`)
- `status`: one of `available | reserved | sold | eoi | hold | nfs | unknown` (Land Bank `ats` -> `available`; live status changes from the approval workflow already applied)
- `areaSqm` number, `listPriceSqm` and `listTotal` EGP numbers or null (list/planned price; never a deal price), `landType`/`sector` strings, `merged` array of plot codes or null, `holdUntil` ISO or null.

Endpoints (Land Bank token):
- `GET  /integration/plots-meta` -> `{ success, hash, updatedAt, count }` (hash = what Sales Leads holds now; any verified user)
- `POST /integration/plots-snapshot` body `{ hash, generatedAt, plots:[...] }` -> `{ success, count }`. Only app_users roles `Admin` or `Sales Operation`. Max 6,000 plots, 4 MB. Replaces the stored snapshot (single row).

## 3. Contacts picker + offer-print record (Land Bank page -> Sales Leads)
- `GET /integration/contacts?q=<text>&limit=20` -> `{ success, contacts:[{ id, serial, name, phone, email, company, openLeads, leadIds:[...] }] }`
  Visibility = the same contacts that person sees in Sales Leads (reps: those linked to their own leads or created by them; team leader: team; operations/admin/viewall: all). Search: name, company, phone digits (>=4), e-mail, serial. Min 2 characters.
- `POST /integration/offer-printed` body
  `{ contactId, leadId?, offerType: 'sales_offer'|'financial_offer'|'proposal', plots:[{key,park,unit,areaSqm,status}], totalValue?, summary?, docName? }`
  -> `{ success, id }`. Writes a row in `crm_offer_prints` (who = the caller, when = server time) and, when the contact has a lead the caller may see
  (the given leadId, else the caller's own open lead of that contact), appends a timeline entry "Offer printed (Sales offer / Financial offer / Proposal) for <plots>" to that lead (audit trail rules of the API apply).
  The caller must be allowed to see the contact (same rule as the picker); the plots list max 50.

## 4. Sales Leads client routes (normal Sales Leads login)
- `GET /plots` -> `{ success, updatedAt, hash, count, plots:[...], landBankUrl }` (needs `canViewSalesPlotsInventory` or `canViewSalesLeads`; 304-style: query `?hash=<held>` returns `{ success, unchanged:true }`)
- `GET /crm/offer-prints?contactId=|leadId=|plotKey=&limit=` -> `{ success, rows:[{ id, contactId, leadId, offerType, plots, totalValue, summary, docName, printedBy, printedByName, printedAt }] }` (scope-checked)
- `GET/POST /integration/config` (admin) `{ landBankUrl }` default `https://sdm-land-bank.github.io/`
- REMOVED: `/plots-config`, `/plots-sync`, `/plots-csv` and the old Google Sheet link (the old online sheet integration is cancelled).

## 5. Hold link (Sales Leads -> Land Bank)
Sales Leads shows "Hold in Land Bank" on an available plot: opens `<landBankUrl>#hold=<encodeURIComponent(plot.key)>` in a new tab.
The Land Bank page, once the person is signed in and the data is loaded, selects that plot, flies to it and opens the "Change status" dialog with Hold pre-selected
(the normal approval workflow of the Land Bank then applies: hold = 4 days from going live after approval, as today). `#plot=<key>` only opens the plot card.
If the plot is no longer available the page says so instead of opening the dialog.

## 6. Offer gate (Land Bank)
Printing a commercial offer needs a Sales Leads contact: Sales offer (cash or instalments), Initial financial offer, and the Investor Match proposal with prices.
The Technical annex stays free. The Land Bank page opens a "Customer" picker (search -> `/integration/contacts`) before building the PDF and records the print
(`/integration/offer-printed`) after the PDF is produced. If Sales Leads cannot be reached, or the person has no Sales Leads account, printing is refused with a clear message (fail closed).

## 7. Addendum — demand analytics (both directions)
### 7.1 Richer print record (Land Bank -> Sales Leads)
`POST /integration/offer-printed` additionally accepts `plan` (object, optional, all fields optional/clipped):
`{ mode: 'cash'|'plan'|'custom', advancePct, years, paymentsPerYear, interestPct, instalments, escalationPct, fixedAnnual: bool, totalPayable, cashTotal }` and each entry of `plots[]` additionally `{ landType, sector, listPriceSqm, project }`.
Stored in new column `crm_offer_prints.plan jsonb` (plots jsonb already holds the entries). The Land Bank gate fills them from the offer it just built.

### 7.2 Link clicks (Sales Leads client)
Every "Hold in Land Bank" / "Open in Land Bank" click in Sales Leads fires `POST /crm/lb-click` `{ plotKey, kind: 'hold'|'open', leadId? }` (fire-and-forget, `keepalive`) -> table `crm_lb_clicks(id uuid, user_id uuid, user_name text, plot_key text, kind text, lead_id text, clicked_at timestamptz)`.

### 7.3 Per-salesperson Land Bank activity (Sales Leads)
`GET /crm/lb-activity?from=&to=` (normal login; scope: manager/ops/admin/viewall see people in scope, a rep sees only self; finance 403) ->
`{ success, rows:[{ userId, name, salesOffers, financialOffers, proposals, totalPrints, uniqueContacts, uniquePlots, holdClicks, openClicks, lastPrintAt, lastClickAt }], totals:{...} }`
(printed_by = user; one print = one row of crm_offer_prints; a PDF with several plots counts once.)

### 7.4 Demand statistics for the Land Bank (Land Bank token)
`GET /integration/offer-stats?from=&to=` — only app_users roles Admin / Sales Operation / Sales Director / Executive (View) / Business Development? NO: only Admin, Sales Operation, Sales Director, Executive (View) -> otherwise 403. Returns
`{ success, generatedAt, totals:{prints, salesOffers, financialOffers, proposals, contacts, plots},
   perPlot:[{ key, project, unit, landType, sector, areaSqm, sales, financial, proposal, total, contacts, lastAt }],
   byProject:[{ project, total, sales, financial, proposal, plots }], byLandType:[...], bySector:[...], bySizeBand:[{band,total}],
   plans:[{ label, mode, advancePct, years, paymentsPerYear, count }],            // grouped by identical (mode, advancePct, years, paymentsPerYear)
   planSummary:{ cash, plan, custom, avgAdvancePct, avgYears, mostCommon:{label,count} },
   monthly:[{ month:'YYYY-MM', total }] }`
Aggregate in SQL/JS over crm_offer_prints (plots jsonb expanded; a print with several plots adds 1 to each plot's counters but 1 to the print totals). Max 20,000 prints scanned; cache the response 60 s in memory.

### 7.5 Land Bank UI
A new page/tab "Offer demand" (admins / ops / managers who may call 7.4): KPI cards (prints, sales offers, initial offers, proposals), a MAP HEAT layer (toggle on the map page: plots coloured by print count, legend), ranked tables (top plots, projects, industries/land types, size bands), a "Preferred payment plans" card (cash vs instalments share, most common plan, average advance %, average years, ranked plans), monthly trend. Click a row -> show on map. Data loaded only when the page opens (+ a Refresh button); no polling.
