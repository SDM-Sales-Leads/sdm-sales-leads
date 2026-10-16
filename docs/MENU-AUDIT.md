# Sales Leads: menu and screen audit (nothing changed yet)

Written 16 Oct 2026 from the code and the live role permissions. It lists what exists, what repeats, and a suggested keep / merge / hide for each item. The owner decides.

## 1. How big is it today

- **36 menu entries**: 7 general (IT service desk and admin) + 29 under "Inquiries Sales".
- Entries a person sees, by role: Sales Rep **14**, Sales Team **20**, Team Leader **27**, Marketing **21**, Sales Operation **34**, Admin **35**.
- Three copies of the menu list exist in the code (current look, classic look, glass look), so every change has to be made three times.
- The first page for everybody is the **IT ticket dashboard**, which a sales person never needs.

## 2. Screen by screen (what it really shows)

| Menu entry | What it shows | Main overlap |
|---|---|---|
| Dashboard (tickets) | open tickets, overdue, resolved today, tickets by priority/category | IT only, not sales |
| My Tickets / New Ticket / Workflow & SLA / Knowledge Base | the IT service desk | not sales |
| System Health | database, mail, AI, lead-data health, user activity log | admin tool |
| Admin Panel | users, system, notifications, styling, roles, dropdown lists | admin tool |
| **Executive Board** | total leads, contacted, qualified, opportunities, won, lost, conversion, won revenue, open pipeline, weighted pipeline, average deal, cycle time, funnel, intake chart, "team day" | **same numbers as Sales Reports > Overview** |
| **My Day** | what to do today: call first, follow-ups, VIP breaches, neglected, tasks | the "team day" block on the Executive Board uses the same engine; the Glass home repeats part of it |
| Sales Leads | the working list (grid, kanban, calendar view), lead card, bulk actions | calendar view repeats the Calendar page |
| Contacts | customers, with a 360 view, channels, open leads | Corporate Accounts is the same idea one level up |
| Corporate Accounts | companies and their contacts and pipeline | could be a tab of Contacts |
| Mail Ingestion | mailbox inbox, parser, history log, Google Sheet sync | part of "bringing leads in" with Bulk Transfer |
| Routing Rules | how new leads are shared, fairness, workload, routing test | admin tool |
| Activities Feed | list of calls, mails, meetings, notes, plus "Record Activity" | the lead card already has Log Call / Meeting / WhatsApp; the lead timeline and Audit Trail also show history |
| **Sales Reports** | 11 tabs: Overview, Funnel & aging, Leads over time, Win/loss, Channels & sources, Projects & demand, Response & follow-up, Closing forecast, **Team performance**, **Land Bank activity**, Marketing lists | its Team performance tab is the Team Performance page; its Land Bank tab is the Land Bank Activity page |
| Plots Inventory | all plots from the Land Bank with filters | needed; the lead card also has plot recommendations |
| Land Bank Activity | who printed offers, unique customers and plots | **same page as the Sales Reports tab** |
| Team Performance | one row per salesperson, leaderboard, first-action times | **same page as the Sales Reports tab**; overlaps Targets and Hierarchy |
| BD Tracker | weekly targets for Business Development people | niche (12-person role) |
| Calendar | follow-ups and meetings by day | repeats the Leads calendar view and the Glass side calendar |
| Achievements | points, streaks, badges, team ranking | game layer; ranking repeats Team Performance |
| Hierarchy | who reports to whom, lead counts, won value | overlaps Team Performance and Targets |
| How to use | short guide per team | keep as help |
| Contract Control Centre / Construction Blockers / Contract Excel / Contract Reports | **four menu entries, one screen with four views** | one screen listed four times |
| Offers | leads with an open offer and follow-up due | partly overlaps Land Bank Activity (printed offers) |
| Won Deals & Cash | every won deal, cash pending / confirmed | the won/cash numbers also sit in Sales Reports |
| Contracts | every won deal through the contract route | next step after Won Deals; the Contract Control Centre watches the same list |
| Targets & My Report | target vs achieved, team structure, milestones | overlaps Team Performance and Hierarchy |
| External Sales | sales made outside the system, confirmed by management | niche, keep |
| Lead Audit Trail | who changed what, plus distribution fairness | partly repeats the Routing Rules fairness block |
| Duplicates | phone / e-mail duplicates and merge | also a Merge button on Leads and a duplicate check inside imports |
| Bulk Transfer | Excel/CSV import and export | the second way of bringing leads in |

## 3. Repeats found

1. **Reporting is in 7 places.** Executive Board, Sales Reports (Overview and 10 tabs), Team Performance, Targets, Hierarchy, Achievements, Land Bank Activity. Two of them (Team Performance and Land Bank Activity) are ALSO tabs inside Sales Reports, so they exist twice. Executive Board and the Reports Overview show the same KPIs (conversion, win rate, average deal, open and weighted pipeline, won value).
2. **Contracts: five entries** for one subject (Contracts, Control Centre, Construction Blockers, Contract Excel, Contract Reports).
3. **Bringing leads in: three entries** (Mail Ingestion, Bulk Transfer import, Google Sheet sync that lives inside Mail Ingestion).
4. **History in four places**: lead timeline, Activities Feed, Audit Trail, System Health activity log.
5. **Calendar in four places**: Calendar page, calendar view in Leads, follow-ups in My Day, Glass side calendar.
6. **Customers in three layers**: Contacts, Corporate Accounts, Customer 360 (inside Contacts).
7. **Duplicates in four places**: Duplicates page, Merge button in Leads, check inside Bulk Transfer, skip inside Mail Ingestion (these last two are automatic and fine).
8. **Wrong audience**: a Sales Rep sees Executive Board, Team Performance and Hierarchy (the server only sends them their own data, so the pages are nearly empty); an IT ticket dashboard is the first page for everyone.

## 4. Dead or unused

- **Sales Operations Approval Authority** (CrmSalesApprovals): loaded by the module but never opened from any menu. Dead code.
- The three menu lists in code (see section 1) are a maintenance risk, not a screen.

## 5. Permission points to confirm

- **Sales Team** role can see Mail Ingestion, Bulk Transfer, Duplicates and Workflow & SLA. You said Mail Ingestion is only for Sales Operation and Marketing. (Sales Team Leader and Sales Rep do not have it.)
- **Sales Rep** has Executive Board, Team Performance, Hierarchy switched on (section 3, point 8).
- **Marketing** sees Won Deals & Cash and Targets.
- **Executive (View)** sees the contract Excel import page (view only role).

## 6. Suggested new menu (about 11 entries instead of 36)

| New entry | Contains | Replaces |
|---|---|---|
| **Home** (first page for all looks) | the Glass home: my numbers, call center first, follow-ups, today's schedule | IT ticket dashboard as first page, My Day, "team day" block |
| **Leads** | list, kanban, calendar view, call center section, bulk messages | Sales Leads, Calendar, Activities Feed (kept as a tab: "Activity log") |
| **Customers** | tabs: Contacts, Corporate Accounts | Contacts, Corporate Accounts |
| **Land & Offers** | tabs: Plots inventory, Offers to follow, Printed offers | Plots Inventory, Offers, Land Bank Activity |
| **Deals** | tabs: Won deals & cash, Contracts, Control centre, Blockers, Contract reports (Excel import stays inside Control centre) | Won Deals & Cash, Contracts, 4 contract entries |
| **Reports** (one) | Overview (= Executive Board), Funnel, Trend, Win/loss, Channels, Demand, Response, Forecast, **Team** (performance + leaderboard + hierarchy + targets), Land Bank, Marketing, **My progress** (achievements, my targets) | Executive Board, Sales Reports, Team Performance, Targets, Hierarchy, Achievements |
| **Intake** (Sales Operation, Marketing) | tabs: Mail, Google Sheet, Excel import/export, Duplicates | Mail Ingestion, Bulk Transfer, Duplicates |
| **Setup** (admin / Sales Operation) | Routing rules, dropdown lists, Audit trail, user and role settings | Routing Rules, Audit Trail, Admin Panel, System Health |
| **BD & External** (small roles) | BD Tracker, External Sales | BD Tracker, External Sales |
| **Help** | How to use | How to use |
| **Service desk** (separate group, only for people who use it) | Tickets, New ticket, Workflow & SLA, Knowledge base | the 4 IT entries in the sales menu |

Per role this gives: Sales Rep about 6, Team Leader about 8, Sales Operation about 10, Admin about 11.

## 7. How a change would be made safely

1. **Hide, don't delete.** Merged screens keep their code until you confirm everything works. Nothing in the data changes.
2. One menu list used by all three looks.
3. Old addresses and the bell / e-mail links keep opening the right lead.
4. Do it in two rounds: (a) new menu + first page + role clean-up, (b) merge the reports into one dashboard.

## 8. Decisions needed from the owner

For each item below: keep / merge into the suggested place / hide.
- Executive Board vs Sales Reports Overview: merge into one (suggested).
- Team Performance, Targets, Hierarchy, Achievements: fold into Reports as the "Team" and "My progress" tabs (suggested).
- Land Bank Activity: keep only as a Reports tab and in Land & Offers (suggested).
- Four contract entries: one "Deals" group with tabs (suggested).
- Activities Feed and its "Record Activity" form: keep the feed as a tab, remove the form (suggested).
- Dead code CrmSalesApprovals: remove (suggested).
- Sales Team and Sales Rep permissions in section 5: confirm.
- First page for everyone: Home (the Glass home) in all three looks (suggested).
