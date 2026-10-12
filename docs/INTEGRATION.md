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

## 8. Addendum 2 — simpler, more useful experience (owner feedback 12 Oct)
### 8.1 Offer history inside the Land Bank "Sales offer" page
The Sales offer page gets two parts: **New offer** (the existing form) and **History** (default tab). History rows come from Sales Leads:
`GET /integration/offer-history?from=&to=&q=&type=&limit=50&offset=0` (Land Bank token) -> `{ success, total, rows:[{ id, printedAt, offerType, contactId, contactName, contactCompany, contactPhone(last 4 only), plots:[{key,park,unit,areaSqm}], totalValue, plan, summary, docName, printedBy, printedByName, hasOffer }] }`
Visibility is enforced by the SERVER from the caller's Sales Leads role (never by the page): Admin, Sales Operation, Sales Director, Executive (View), view-all and finance (canConfirmCash) = everybody's; Sales Team Leader = own + direct reports'; everybody else = own prints only. Search `q` = customer name/company, plot code, salesperson name.
Table (column view): Date, Customer, Plot(s), Type, Total, Payment plan (short text), Printed by (hidden column for a normal sales user), [Print again].
### 8.2 Print again
`POST /integration/offer-printed` additionally accepts `offer` (object, <= 8 KB, clipped): the full form state needed to rebuild the document (Land Bank SO.f fields incl. plan, notes, cash price override, payment mode, the selected plots' keys, and for financial offers the FPL config). Stored in `crm_offer_prints.offer jsonb`.
`GET /integration/offer-history/:id` -> `{ success, row, offer }` (same visibility rule; returns `offer` for rebuilding). "Print again" reopens the Sales offer form filled with that offer (plots re-resolved by key; if a plot is no longer available show a warning but still allow) and, after the user presses download, records a NEW print (same customer, `summary` "Reprint of <id>").
### 8.3 Who got the offer (demand page)
`GET /integration/offer-stats/plot?key=<plot key>&limit=50` (Land Bank token; same roles as offer-stats) -> `{ success, key, total, rows:[{ id, printedAt, offerType, contactName, contactCompany, printedByName, totalValue, plan }] }`.
The Offer demand page: clicking a row opens a side panel with these rows (customer, company, salesperson, type, date, total, plan) AND shows only that plot on the map (never the whole merged block unless the offered deal itself is that merged deal).
### 8.4 Sales Leads lead card: recommended or manual plots
In the lead detail, a toggle "Recommend plots for me" / "I will choose": recommended = the existing recommendations (from the plot list); manual = pick Park (project) -> Sector -> Plot from the snapshot (available only) and "Assign to this lead". Assigned plots are stored on the lead as `assignedPlots:[{key,park,project,unit,areaSqm,listPriceSqm,listTotal,status,assignedAt,assignedBy}]` (max 20), shown on the lead card with a "Hold in Land Bank" link per plot and removable; each add/remove appends a timeline entry. The preference toggle is stored per lead (`plotMode: 'recommend'|'manual'`). The server (leadrules) must accept `assignedPlots`/`plotMode` from the owner and the manager scopes like other editable fields (and keep them in the audit trail).

## 9. Addendum 3 — demand = offers printed + plots requested on leads (finance pricing signal)
A plot assigned manually to a lead (`lead.assignedPlots`, §8.4) is a customer REQUEST for that plot and counts as demand, next to printed offers.
### 9.1 Server (Sales Leads) — extend `GET /integration/offer-stats` (same roles)
Add to `totals`: `requests` (distinct lead x plot assignments), `requestedPlots`. Add to every `perPlot` row: `requests` (distinct leads that have this plot assigned), `requestContacts` (distinct customers), `holdClicks` (from crm_lb_clicks kind 'hold' for the plot key, in the period). Plots that have requests but no prints must also appear. Add `requests` + `holdClicks` to `byProject`, `byLandType`, `bySector`, `bySizeBand` (group by the assigned plot's own fields; project falls back to park). Add `score` = prints + requests (+ holdClicks counted as 0.5, documented) to perPlot and groups. Source: crm_leads.data->assignedPlots (not deleted, assigned within the period by `assignedAt` when present), read with pageAll (cap 20,000 leads). Also `GET /integration/offer-stats/plot?key=` additionally returns `requests:[{ leadId, customer, company, ownerName, assignedAt, mode }]` (same roles; customer name from the lead).
### 9.2 Land Bank page
- Heat layer + Offer demand page get a metric switch: **Offers printed | Requests on leads | Combined (score)**; legend and ranking follow the chosen metric; the plot side panel lists printed offers AND requests (who asked: customer, company, salesperson).
- New card "Pricing signals" for finance (clearly labelled "indication, not advice"): per project and per plot size band: demand score, available plots, sell-through (sold+reserved / total), list price per sqm (planned price of the available plots, median), recent achieved price per sqm (median of deals sold/reserved in the last 12 months from the page's own MDS rows, priceOf deal basis), and the gap in %. Flag rules (shown as text chips, thresholds visible in an info tooltip): "High demand + few plots left" (score in top quartile AND available share < 25%), "High demand + list below recent deals" (top-quartile score AND list < achieved by more than 5%), "Low demand + high availability" (bottom quartile AND available share > 60%). Never invent values: show "—" when data is missing. Table sortable, exportable to Excel (reuse the page's export helper), click a row = show on map.

## 10. Addendum 4 — polish found in the live test (12 Oct, owner's Chrome)
1. **Customer first, in the Land Bank "New offer" tab.** A "Customer" selector (same picker as the gate, search -> /integration/contacts) at the TOP of the form. Picking a customer fills "Client's name" and "Company name" (still editable) and the later download does not ask again. The reprint banner must read like "Printing again: offer of 12 Oct for <customer> (C-1-3)" — never show the raw id.
2. **Hold link carries the lead.** Sales Leads builds `<landBankUrl>#hold=<key>&lead=<leadId>` when the click comes from a lead (recommendations, assigned plots); from the inventory page without a lead there is no `lead` part. The Land Bank, after sign-in, reads `lead`, calls `GET /integration/lead-brief?leadId=` (Land Bank token) -> `{ success, leadId, customerName, companyName, ownerName, ownerEmail, phoneLast4 }` (visibility = same rule as the lead list: the caller must be allowed to see the lead) and pre-fills the hold dialog: Client name, Company name and, for operations users, "Salesperson's email" = the lead owner's email. Nothing is saved until the user presses the button.
3. **Arabic / short project names from e-mails.** Call-centre mails carry project names such as «اندستريا برج العرب». Both the mail ingestion (server) and the plot recommendation/matching (client) must map them to the Land Bank park names through one alias table (Arabic and English spellings of the 11 parks: Borg El Arab, East (10th of Ramadan), New Sadat, October, Sadat, Sokhna, West, Asher plot 10/11, Al Oula, Sokhna 360...). The lead keeps what the customer wrote in `description`; the `project` field gets the canonical English name when matched.
