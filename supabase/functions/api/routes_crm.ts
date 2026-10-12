// deno-lint-ignore-file no-explicit-any
// Sales CRM: leads, contacts, companies, tasks, activities, mail logs, queue settings, mailbox.
//
// Saving model: the browser sends { upserts: [rows], deletes: [ids] } — only what changed. Every row carries
// `_rev` (the row's updated_at when it was loaded). A save is refused for a row that someone else changed since
// (409-style "conflicts"), so two people can no longer overwrite each other. Deleting a lead is a soft delete.
import {
  admin, asUuid, bad, body, can, Caller, clean, crmScope, CrmScope, forbidden, getConfig, HttpError, isAdmin, isObj, logActivity, need,
  needAdmin, needCrm, normEmail, normName, normPhone, nowIso, rateLimit, rid, setConfig, str,
} from "./lib.ts";
import { route } from "./router.ts";
import { sanitizeLead } from "./leadrules.ts";
import { getBody, htmlToText, listFolder, loadEws } from "./ews.ts";
import {
  chooseAgent, DEFAULT_QUEUE, ensureContactAndCompany, ingestInbox, leadColumns, loadQueue, nextId, parseMail,
} from "./ingest.ts";

const ID_RE = /^[A-Za-z0-9_.:-]{1,60}$/;
const METHODS = ["Round Robin", "Least Active Leads", "Least Total Leads", "Random", "Project Based", "Required Size", "Lead Source", "Priority Based", "Working Hours", "VIP Customer Routing", "Company Industry Routing", "Manual Assignment Only"];

async function teamIds(c: Caller): Promise<string[]> {
  const { data } = await admin.from("app_users").select("id").eq("team_leader_id", c.id);
  return [c.id, ...((data || []).map((r: any) => r.id))];
}

interface Spec {
  table: string;
  soft: boolean;
  /** columns lifted out of the JSON for this table */
  cols: (d: any, c: Caller) => Record<string, any>;
  /** may this caller see/write the row? */
  owns: (c: Caller, scope: CrmScope, team: string[], row: any) => boolean;
  canWrite?: (c: Caller, scope: CrmScope) => boolean;
  canDelete: (c: Caller, scope: CrmScope) => boolean;
}

const SPECS: Record<string, Spec> = {
  leads: {
    table: "crm_leads", soft: true,
    cols: (d) => leadColumns(d),
    owns: (c, scope, team, r) => scope === "all" || (scope === "finance" ? r.status === "Won" : r.assigned_to === c.id || r.created_by === c.id || (scope === "team" && !!r.assigned_to && team.includes(r.assigned_to))),
    canDelete: (_c, scope) => scope === "all" || scope === "team",
  },
  contacts: {
    table: "crm_contacts", soft: true,
    cols: (d) => ({ phone_norm: normPhone(d.phoneNumber) || null, email_norm: normEmail(d.email) || null, name_norm: normName(d.name) || null }),
    owns: (_c, scope) => scope !== "finance",
    canDelete: (_c, scope) => scope === "all" || scope === "team",
  },
  companies: {
    table: "crm_companies", soft: true,
    cols: (d) => ({ name_norm: normName(d.name) || null }),
    owns: (_c, scope) => scope !== "finance",
    canDelete: (_c, scope) => scope === "all" || scope === "team",
  },
  tasks: {
    table: "crm_tasks", soft: false,
    cols: (d) => ({ owner_id: asUuid(d.salespersonId) }),
    owns: (c, scope, team, r) => scope === "all" || (scope !== "finance" && (r.owner_id === c.id || (scope === "team" && !!r.owner_id && team.includes(r.owner_id)))),
    canDelete: (_c, scope) => scope !== "finance",
  },
  activities: {
    table: "crm_activities", soft: false,
    cols: (d) => ({ owner_id: asUuid(d.salespersonId) }),
    owns: (c, scope, team, r) => scope === "all" || (scope !== "finance" && (r.owner_id === c.id || (scope === "team" && !!r.owner_id && team.includes(r.owner_id)))),
    canDelete: (_c, scope) => scope === "all" || scope === "team",
  },
  "external-sales": {
    table: "crm_external_sales", soft: false,
    cols: (d) => ({ owner_id: asUuid(d.salespersonId) }),
    owns: (c, scope, team, r) => scope === "all" || (scope !== "finance" && (r.owner_id === c.id || (scope === "team" && !!r.owner_id && team.includes(r.owner_id)))),
    canDelete: (_c, scope) => scope === "all",
  },
  "email-logs": {
    table: "crm_email_logs", soft: false,
    cols: (d) => ({ received_at: d.receivedTime && !isNaN(Date.parse(d.receivedTime)) ? new Date(d.receivedTime).toISOString() : null }),
    owns: (_c, scope) => scope === "all",
    canDelete: (_c, scope) => scope === "all",
  },
};

/** external sales: new = pending; only a leader/operations decides, never on their own entry; who/when come from the server */
function externalRule(d: any, old: any | null, c: Caller, scope: CrmScope): string | null {
  const amount = Number(d.amount);
  if (!(amount > 0) || amount > 1e12) return "the amount must be a positive number";
  if (!old) { d.status = "pending"; delete d.confirmedBy; delete d.confirmedDate; return null; }
  if (d.status !== old.status) {
    if (d.status !== "pending" && !(scope === "all" || scope === "team")) return "only a team leader or operations can confirm or reject a sale";
    if (d.status !== "pending" && String(d.salespersonId) === c.id && scope !== "all") return "you cannot decide on your own sale";
    if (d.status === "pending") { delete d.confirmedBy; delete d.confirmedDate; }
    else { d.confirmedBy = c.name; d.confirmedDate = nowIso().slice(0, 10); }
  } else { d.confirmedBy = old.confirmedBy; d.confirmedDate = old.confirmedDate; if (scope === "own") { d.amount = old.amount; d.salespersonId = old.salespersonId; } }
  return null;
}

const out = (r: any) => ({ ...r.data, id: r.id, _rev: r.updated_at || r.created_at });

for (const [name, spec] of Object.entries(SPECS)) {
  route("GET", `/crm/${name}`, async ({ c, query }) => {
    needCrm(c);
    if (name === "email-logs" && !can(c, "canViewSalesMail") && crmScope(c) !== "all") throw forbidden();
    const scope = crmScope(c);
    const since = query.get("since");
    let q: any = admin.from(spec.table).select("*");
    if (since && !isNaN(Date.parse(since))) {
      // delta: only rows changed after `since`, plus ids removed since then (cheap: one indexed query)
      const iso = new Date(since).toISOString();
      const { data: ch } = await q.gt("updated_at", iso).order("updated_at", { ascending: true }).limit(5000);
      const team0 = scope === "team" ? await teamIds(c) : [];
      const live = (ch || []).filter((r: any) => !r.deleted_at && spec.owns(c, scope, team0, r)).map(out);
      const gone = (ch || []).filter((r: any) => r.deleted_at || !spec.owns(c, scope, team0, r)).map((r: any) => r.id);
      return { delta: true, rows: live, removed: gone, now: nowIso() };
    }
    if (spec.soft) q = q.is("deleted_at", null);
    if (name === "email-logs") q = q.order("received_at", { ascending: false, nullsFirst: false }).limit(500);
    else q = q.order("created_at", { ascending: false }).limit(10000);
    const { data, error } = await q;
    if (error) throw new HttpError(500, "Could not load " + name);
    const team = scope === "team" ? await teamIds(c) : [];
    return (data || []).filter((r: any) => spec.owns(c, scope, team, r)).map(out);
  });

  route("POST", `/crm/${name}`, async ({ req, c }) => {
    needCrm(c);
    await rateLimit(`crmsave:${c.id}`, 60, 120);
    const scope = crmScope(c);
    const b = await body(req, 8_000_000);
    if (Array.isArray(b)) throw bad("Send { upserts, deletes } (whole-list saves are no longer accepted)");
    const upserts: any[] = Array.isArray(b.upserts) ? b.upserts : [];
    const deletes: string[] = Array.isArray(b.deletes) ? b.deletes.filter((x: any) => typeof x === "string") : [];
    if (upserts.length > 500 || deletes.length > 500) throw bad("Too many rows in one save (max 500)");
    if (name === "email-logs" && scope !== "all") throw forbidden();
    const team = scope === "team" ? await teamIds(c) : [];
    const saved: any[] = [], conflicts: string[] = [], rejected: { id: string; reason: string }[] = [], idMap: Record<string, string> = {};
    const auditRows: any[] = [];
    const audit = (leadId: string, a: { action: string; from?: string; to?: string; note?: string }) =>
      auditRows.push({ lead_id: leadId, actor_id: c.id, actor_name: c.name, action: a.action, from_value: a.from ?? null, to_value: a.to ?? null, note: a.note ?? null });

    for (const raw of upserts) {
      if (!isObj(raw) || typeof raw.id !== "string" || !ID_RE.test(raw.id)) { rejected.push({ id: String(raw?.id ?? ""), reason: "bad id" }); continue; }
      const d: any = clean(raw);
      const rev = d._rev; delete d._rev;
      let id = d.id;
      const { data: ex } = await admin.from(spec.table).select("*").eq("id", id).maybeSingle();
      try {
        if (ex) {
          if (ex.deleted_at) { rejected.push({ id, reason: "was deleted" }); continue; }
          if (!spec.owns(c, scope, team, ex)) { rejected.push({ id, reason: "not yours" }); continue; }
          if (!rev) { // client thinks it is new but the id is taken: give it a fresh id
            if (name === "leads" || name === "contacts" || name === "companies") {
              id = await nextId(name === "leads" ? "lead" : name === "contacts" ? "contact" : "company");
              idMap[d.id] = id; d.id = id;
              const cols = spec.cols(d, c);
              const ins = await admin.from(spec.table).insert({ id, data: d, ...cols, ...(name === "leads" ? { created_by: c.id } : {}) }).select("*").single();
              if (ins.error) throw new Error("insert");
              saved.push({ id, _rev: ins.data.updated_at });
              continue;
            }
            conflicts.push(id); continue;
          }
          if (new Date(rev).getTime() !== new Date(ex.updated_at).getTime()) { conflicts.push(id); continue; }
          if (name === "leads") {
            const newAssignee = asUuid(d.assignedSalespersonId);
            let assigneeName: string | undefined;
            if ((newAssignee || null) !== (ex.assigned_to || null)) {
              if (scope === "own" || scope === "finance") { rejected.push({ id, reason: "only a team leader or operations can reassign a lead" }); continue; }
              if (scope === "team" && newAssignee && !team.includes(newAssignee)) { rejected.push({ id, reason: "that person is not in your team" }); continue; }
              if (newAssignee) {
                const { data: au } = await admin.from("app_users").select("name,active").eq("id", newAssignee).maybeSingle();
                if (!au || au.active === false) { rejected.push({ id, reason: "that user cannot receive leads" }); continue; }
                assigneeName = au.name;
              } else assigneeName = "";
            }
            if (scope === "finance") { // accounts receivable may only confirm cash, through its own call
              rejected.push({ id, reason: "accounts receivable confirms cash from the Won Deals page" }); continue;
            }
            const san = sanitizeLead(d, ex, c, scope, assigneeName);
            if (san.error) { rejected.push({ id, reason: san.error }); continue; }
            san.audits.forEach((a) => audit(id, a));
          }
          if ((name === "tasks" || name === "activities") && scope === "own" && asUuid(d.salespersonId) !== c.id) { rejected.push({ id, reason: "not yours" }); continue; }
          if (name === "external-sales") {
            const err = externalRule(d, ex.data, c, scope);
            if (err) { rejected.push({ id, reason: err }); continue; }
          }
          const u = await admin.from(spec.table).update({ data: d, ...spec.cols(d, c) }).eq("id", id).eq("updated_at", ex.updated_at).select("*");
          if (u.error) throw new Error("update");
          if (!u.data?.length) { conflicts.push(id); continue; }
          saved.push({ id, _rev: u.data[0].updated_at });
        } else {
          // new row
          if (name === "leads") {
            const as = asUuid(d.assignedSalespersonId);
            if (scope === "own" && as && as !== c.id) { rejected.push({ id, reason: "you can only create leads for yourself" }); continue; }
            if (scope === "team" && as && !team.includes(as)) { rejected.push({ id, reason: "that person is not in your team" }); continue; }
            if (scope === "own" && !as) { d.assignedSalespersonId = c.id; d.assignedSalespersonName = c.name; }
            if (scope === "finance") { rejected.push({ id, reason: "not allowed" }); continue; }
            const san = sanitizeLead(d, null, c, scope);
            if (san.error) { rejected.push({ id, reason: san.error }); continue; }
            san.audits.forEach((a) => audit(id, a));
          }
          if ((name === "tasks" || name === "activities") && scope === "own") { d.salespersonId = c.id; }
          if (name === "external-sales") {
            if (scope === "own") { d.salespersonId = c.id; d.salespersonName = c.name; }
            const err = externalRule(d, null, c, scope);
            if (err) { rejected.push({ id, reason: err }); continue; }
          }
          const ins = await admin.from(spec.table).insert({ id, data: d, ...spec.cols(d, c), ...(name === "leads" ? { created_by: c.id } : {}) }).select("*").single();
          if (ins.error) {
            if (name === "leads" && d.emailId) { rejected.push({ id, reason: "a lead for this e-mail already exists" }); continue; }
            throw new Error("insert");
          }
          saved.push({ id, _rev: ins.data.updated_at || ins.data.created_at });
          if (name === "leads") await ensureContactAndCompany(d).catch(() => {});
        }
      } catch {
        rejected.push({ id, reason: "could not be saved" });
      }
    }

    if (deletes.length) {
      if (!spec.canDelete(c, scope)) { for (const id of deletes) rejected.push({ id, reason: "you cannot delete these" }); }
      else {
        for (const id of deletes.slice(0, 500)) {
          if (!ID_RE.test(id)) continue;
          const { data: ex } = await admin.from(spec.table).select("*").eq("id", id).maybeSingle();
          if (!ex || !spec.owns(c, scope, team, ex)) continue;
          if (name === "leads") audit(id, { action: "delete", from: ex.data?.status, note: `${ex.data?.customerName || ""} (${ex.data?.assignedSalespersonName || "unassigned"})` });
          if (spec.soft) await admin.from(spec.table).update({ deleted_at: nowIso() }).eq("id", id);
          else await admin.from(spec.table).delete().eq("id", id);
        }
        if (deletes.length) await logActivity(c, `Delete CRM ${name}`, `${deletes.length} row(s) deleted`, "ticket");
      }
    }
    if (auditRows.length) await admin.from("crm_lead_audit").insert(auditRows.slice(0, 2000));
    return { success: true, saved, conflicts, rejected, idMap };
  });
}

// ids handed out in advance so the browser can create records without clashes
route("POST", "/crm/ids", async ({ req, c }) => {
  needCrm(c);
  await rateLimit(`crmids:${c.id}`, 60, 30);
  const b = await body(req, 1000);
  const kind = ["lead", "contact", "company"].includes(b.kind) ? b.kind : null;
  if (!kind) throw bad("Unknown kind");
  const n = Math.max(1, Math.min(20, Number(b.n) || 5));
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await nextId(kind));
  return { ids };
});

// ---------------------------------------------------------------------------------------------
// routing, purge, re-parse, ingestion
// ---------------------------------------------------------------------------------------------
route("POST", "/crm/leads/route", async ({ req, c }) => {
  needCrm(c);
  await rateLimit(`crmroute:${c.id}`, 60, 60);
  const b = await body(req, 2000);
  const id = str(b.leadId, 60);
  const scope = crmScope(c);
  const team = scope === "team" ? await teamIds(c) : [];
  const { data: ex } = await admin.from("crm_leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!ex || !SPECS.leads.owns(c, scope, team, ex)) throw new HttpError(404, "Lead not found");
  if (ex.assigned_to) return { success: true, assigned: false, lead: out(ex) }; // never re-route an assigned lead
  const q = await loadQueue();
  const agent = await chooseAgent(ex.data, q);
  if (!agent) return { success: true, assigned: false, lead: out(ex) };
  const now = nowIso();
  const d = { ...ex.data, assignedSalespersonId: agent.id, assignedSalespersonName: agent.name, assignedDate: now, lastUpdated: now };
  d.timeline = [...(d.timeline || []), { id: rid(), timestamp: now, type: "Assignment", user: "System", title: "Auto Assigned", description: `Lead assigned to ${agent.name} (${q.assignmentMethod}).` }];
  const u = await admin.from("crm_leads").update({ data: d, ...leadColumns(d) }).eq("id", id).is("assigned_to", null).select("*");
  if (!u.data?.length) return { success: true, assigned: false, lead: out(ex) };
  return { success: true, assigned: true, lead: out(u.data[0]) };
});

route("POST", "/crm/leads/purge-all", async ({ req, c }) => {
  needAdmin(c);
  const b = await body(req, 1000);
  if (b.confirm !== "DELETE ALL LEADS") throw bad('Send { "confirm": "DELETE ALL LEADS" } to confirm');
  const { count } = await admin.from("crm_leads").select("id", { count: "exact", head: true }).is("deleted_at", null);
  await admin.from("crm_leads").update({ deleted_at: nowIso() }).is("deleted_at", null);
  await logActivity(c, "Purge Leads", `${count || 0} leads removed (soft delete)`, "admin");
  return { success: true, message: "All leads removed.", count: count || 0 };
});

route("POST", "/crm/reparse-lead", async ({ req, c }) => {
  needCrm(c);
  await rateLimit(`reparse:${c.id}`, 3600, 30);
  const b = await body(req, 2000);
  const id = str(b.leadId, 60);
  const scope = crmScope(c);
  const team = scope === "team" ? await teamIds(c) : [];
  const { data: ex } = await admin.from("crm_leads").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!ex || !SPECS.leads.owns(c, scope, team, ex)) throw new HttpError(404, "Lead not found");
  const lead = ex.data;
  if (!lead.emailId) throw bad("This lead has no e-mail to re-read");
  const body_ = await getBody(await loadEws(), lead.emailId);
  if (!body_.html) throw new HttpError(502, "Could not read the original e-mail from the mail server");
  const { parsed } = await parseMail(htmlToText(body_.html), await loadQueue());
  const now = nowIso();
  const d = { ...lead };
  if (parsed.customerName) d.customerName = parsed.customerName;
  if (parsed.phoneNumber) d.phoneNumber = parsed.phoneNumber;
  if (parsed.email) d.email = parsed.email;
  if (parsed.companyName) d.companyName = parsed.companyName;
  if (parsed.project) d.project = parsed.project;
  if (parsed.requiredSize) d.requiredSize = parsed.requiredSize;
  if (parsed.priority) d.priority = parsed.priority;
  if (parsed.source) d.source = parsed.source;
  if (parsed.description && !d.description) d.description = parsed.description;
  d.lastUpdated = now;
  d.timeline = [...(d.timeline || []), { id: rid(), timestamp: now, type: "Import", user: c.name, title: "Lead Data Reparsed", description: "Re-read the original e-mail and refreshed the contact details." }];
  const u = await admin.from("crm_leads").update({ data: d, ...leadColumns(d) }).eq("id", id).select("*").single();
  if (u.error) throw new HttpError(500, "Could not save the lead");
  await ensureContactAndCompany(d);
  return { success: true, lead: out(u.data) };
});

async function runIngest(c: Caller) {
  if (!(can(c, "canViewSalesMail") || crmScope(c) === "all")) throw forbidden();
  await rateLimit(`ingest:${c.id}`, 3600, 30);
  const r = await ingestInbox(8, c.name);
  await logActivity(c, "Mail Ingestion", `${r.newLeadsCount} new lead(s) from ${r.processed} mail(s)`, "system");
  return { success: true, messages: [], ...r };
}
route("POST", "/crm/trigger-auto-sync", async ({ c }) => { needCrm(c); return await runIngest(c); });
route("POST", "/crm/sync-inbox", async ({ c }) => { needCrm(c); return await runIngest(c); });

// shared mailbox view (inbox + sent) — only for people who may use CRM mail
const mailCache: { at: number; emails: any[] } = { at: 0, emails: [] };
route("GET", "/crm/webmail", async ({ c, query }) => {
  needCrm(c);
  if (!can(c, "canViewSalesMail")) throw forbidden();
  const force = query.get("force") === "true" || query.get("refresh") === "true";
  if (!force && Date.now() - mailCache.at < 180_000 && mailCache.emails.length) return { success: true, emails: mailCache.emails, cached: true };
  await rateLimit(`webmail:${c.id}`, 600, 30);
  const cfg = await loadEws();
  const [a, s] = await Promise.all([listFolder(cfg, "inbox", 10), listFolder(cfg, "sentitems", 10)]);
  const emails = [...a, ...s].sort((x, y) => new Date(y.receivedTime).getTime() - new Date(x.receivedTime).getTime());
  mailCache.at = Date.now(); mailCache.emails = emails;
  return { success: true, emails, cached: false };
});

// defence in depth only — the browser sanitises again before showing it
function stripActive(html: string) {
  return html
    .replace(/<(script|style|iframe|object|embed|link|meta|base|form)[\s\S]*?(<\/\1>|$)/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "$1=$2#$2");
}
route("GET", "/crm/webmail/body", async ({ c, query }) => {
  needCrm(c);
  if (!can(c, "canViewSalesMail")) throw forbidden();
  await rateLimit(`mailbody:${c.id}`, 600, 120);
  const r = await getBody(await loadEws(), str(query.get("id"), 700));
  return { success: true, body: stripActive(r.html), subject: r.subject };
});

// ---------------------------------------------------------------------------------------------
// queue settings
// ---------------------------------------------------------------------------------------------
route("GET", "/crm/queue-settings", async ({ c }) => { needCrm(c); return await loadQueue(); });
route("POST", "/crm/queue-settings", async ({ req, c }) => {
  needCrm(c);
  if (crmScope(c) !== "all") throw forbidden();
  const b = clean(await body(req, 20_000));
  const s: any = {};
  for (const k of Object.keys(DEFAULT_QUEUE)) {
    if (b[k] === undefined) continue;
    const def = (DEFAULT_QUEUE as any)[k];
    if (typeof def === "boolean") s[k] = !!b[k];
    else if (typeof def === "number") { const n = Number(b[k]); s[k] = Number.isFinite(n) ? Math.max(0, Math.min(10000, n)) : def; }
    else if (Array.isArray(def)) s[k] = (Array.isArray(b[k]) ? b[k] : []).slice(0, 50).map((x: any) => str(x, 80)).filter(Boolean);
    else s[k] = str(b[k], 80);
  }
  if (s.assignmentMethod && !METHODS.includes(s.assignmentMethod)) throw bad("Unknown assignment method");
  if (b.backupSalespersonId !== undefined) s.backupSalespersonId = asUuid(b.backupSalespersonId) || "";
  for (const k of ["queueOrder"]) if (b[k] !== undefined) s[k] = ["FIFO", "LIFO", "Priority"].includes(b[k]) ? b[k] : "FIFO";
  for (const k of ["businessHoursStart", "businessHoursEnd"]) if (s[k] && !/^\d{2}:\d{2}$/.test(s[k])) throw bad("Hours must look like 08:00");
  await setConfig("queue_settings", { ...(await getConfig<any>("queue_settings", {})), ...s });
  await logActivity(c, "Update Routing Rules", "Lead routing settings changed", "admin");
  return { success: true };
});
