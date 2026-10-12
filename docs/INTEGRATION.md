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
