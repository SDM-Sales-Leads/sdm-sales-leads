// deno-lint-ignore-file no-explicit-any
// Integration with the Land Bank system (see docs/INTEGRATION.md).
//  - /integration/* routes taking the Land Bank token are "public" for the router: they verify the token themselves.
//  - /plots, /crm/offer-prints, /integration/config use the normal Sales Leads login.
// No cost / GP / client data is ever stored from the Land Bank: the plot snapshot is whitelisted field by field.
import {
  admin, asUuid, bad, body, can, Caller, callerFromEmail, clean, crmScope, forbidden, getConfig, HttpError, isAdmin, isObj,
  logActivity, needAdmin, needCrm, normEmail, normName, normPhone, nowIso, rateLimit, rid, setConfig, str,
} from "./lib.ts";
import { route } from "./router.ts";
import { SPECS, teamIds } from "./routes_crm.ts";

const LB_AUTH_URL = "https://ihjlvxmttvjcciafruya.supabase.co/auth/v1/user";
const LB_PUBLISHABLE_KEY = "sb_publishable_8Q-O8l1q58PmM8kQkEETDQ_g1wwmRbS";
const DEFAULT_LB_URL = "https://sdm-land-bank.github.io/";
const STATUSES = new Set(["available", "reserved", "sold", "eoi", "hold", "nfs", "unknown"]);
const OFFER_TYPES: Record<string, string> = { sales_offer: "Sales offer", financial_offer: "Financial offer", proposal: "Proposal" };
const ID_RE = /^[A-Za-z0-9_.:-]{1,60}$/;
const CLOSED = new Set(["Won", "Lost", "Duplicate", "Invalid", "Closed", "Not Interested", "Wrong Number"]);

// ---------------------------------------------------------------------------------------------
// 1. who is calling (Land Bank token)
// ---------------------------------------------------------------------------------------------
const lbCache = new Map<string, { email: string; until: number }>();
async function sha(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function lbCaller(req: Request): Promise<Caller> {
  const h = req.headers.get("authorization") || "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token || token.length > 4000) throw new HttpError(401, "Sign in to the Land Bank first");
  const key = await sha(token);
  const now = Date.now();
  let email = lbCache.get(key)?.until! > now ? lbCache.get(key)!.email : "";
  if (!email) {
    await rateLimit(`lbtok:${key.slice(0, 24)}`, 60, 60);
    let res: Response;
    try {
      res = await fetch(LB_AUTH_URL, {
        headers: { apikey: LB_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
    } catch { throw new HttpError(502, "Could not verify the Land Bank sign-in"); }
    if (res.status === 401 || res.status === 403) throw new HttpError(401, "Land Bank session expired, sign in again");
    if (!res.ok) throw new HttpError(502, "Could not verify the Land Bank sign-in");
    const u: any = await res.json().catch(() => null);
    email = normEmail(u?.email);
    if (!email) throw new HttpError(401, "Land Bank session is not valid");
    if (lbCache.size > 400) lbCache.clear();
    lbCache.set(key, { email, until: now + 60_000 });
  }
  const c = await callerFromEmail(email);
  if (!can(c, "canViewSalesCrm")) throw forbidden("Your account has no access to Sales Leads");
  return c;
}

/** public (self-authenticated) route taking the Land Bank token */
function lbRoute(method: string, path: string, fn: (x: { req: Request; c: Caller; query: URLSearchParams }) => Promise<any>) {
  route(method, path, async ({ req, query }) => fn({ req, c: await lbCaller(req), query }), { public: true });
}

// ---------------------------------------------------------------------------------------------
// 2. plot snapshot
// ---------------------------------------------------------------------------------------------
const num = (v: any): number | null => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : null);
const isoOrNull = (v: any): string | null => { const s = str(v, 40); return s && !isNaN(Date.parse(s)) ? new Date(s).toISOString() : null; };

function cleanPlot(p: any): any | null {
  if (!isObj(p)) return null;
  const key = str(p.key, 160), unit = str(p.unit, 160);
  if (!key || !unit) return null;
  const status = str(p.status, 20).toLowerCase();
  return {
    key, park: str(p.park, 100), project: str(p.project, 120), unit,
    status: STATUSES.has(status) ? status : "unknown",
    sector: str(p.sector, 120), landType: str(p.landType, 120),
    areaSqm: num(p.areaSqm) ?? 0,
    listPriceSqm: num(p.listPriceSqm), listTotal: num(p.listTotal),
    merged: Array.isArray(p.merged) ? p.merged.slice(0, 60).map((x: any) => str(x, 60)).filter(Boolean) : null,
    holdUntil: isoOrNull(p.holdUntil),
  };
}

lbRoute("GET", "/integration/plots-meta", async ({ c }) => {
  await rateLimit(`lbmeta:${c.id}`, 60, 60);
  const { data } = await admin.from("plots_snapshot").select("hash,updated_at,plot_count").eq("id", 1).maybeSingle();
  return { success: true, hash: data?.hash || "", updatedAt: data?.updated_at || null, count: data?.plot_count || 0 };
});

lbRoute("POST", "/integration/plots-snapshot", async ({ req, c }) => {
  if (!(isAdmin(c) || c.role === "Sales Operation")) throw forbidden("Only Admin or Sales Operation can publish the plot list");
  await rateLimit(`lbsnap:${c.id}`, 600, 20);
  const b = await body(req, 4_000_000);
  if (!isObj(b) || !Array.isArray(b.plots)) throw bad("Send { hash, generatedAt, plots }");
  if (b.plots.length > 6000) throw bad("Too many plots (max 6,000)");
  const plots = b.plots.map(cleanPlot).filter(Boolean);
  const hash = str(b.hash, 128);
  if (!hash) throw bad("A hash is required");
  const r = await admin.from("plots_snapshot").upsert({
    id: 1, hash, generated_at: isoOrNull(b.generatedAt), updated_at: nowIso(), plot_count: plots.length, data: plots,
  });
  if (r.error) throw new HttpError(500, "Could not store the plot list");
  await logActivity(c, "Plot snapshot", `${plots.length} plots published from the Land Bank`, "system");
  return { success: true, count: plots.length };
});

// ---------------------------------------------------------------------------------------------
// 3. contacts picker
// ---------------------------------------------------------------------------------------------
/** leads a person may see that belong to these contacts (linked by phone / e-mail), live only */
async function linkedLeads(c: Caller, contacts: any[]): Promise<Map<string, any[]>> {
  const out = new Map<string, any[]>();
  const phones = new Set<string>(), emails = new Set<string>();
  for (const k of contacts) { if (k.phone_norm) phones.add(k.phone_norm); if (k.email_norm) emails.add(k.email_norm); }
  const scope = crmScope(c);
  const team = scope === "team" ? await teamIds(c) : [];
  const found = new Map<string, any>();
  const run = async (col: string, vals: string[]) => {
    for (let i = 0; i < vals.length; i += 80) {
      const { data } = await admin.from("crm_leads").select("id,status,assigned_to,created_by,phone_norm,email_norm").is("deleted_at", null).in(col, vals.slice(i, i + 80)).limit(2000);
      for (const l of data || []) if (SPECS.leads.owns(c, scope, team, l)) found.set(l.id, l);
    }
  };
  await Promise.all([run("phone_norm", [...phones]), run("email_norm", [...emails])]);
  for (const k of contacts) {
    out.set(k.id, [...found.values()].filter((l) => (k.phone_norm && l.phone_norm === k.phone_norm) || (k.email_norm && l.email_norm === k.email_norm)));
  }
  return out;
}

function contactVisible(c: Caller, scope: string, k: any, links: any[]): boolean {
  if (scope === "finance") return false;
  if (scope === "all" || scope === "viewall") return true;
  if (links.length) return true;
  const d = k.data || {};
  return (!!d.createdById && d.createdById === c.id) || (!!d.createdByUserId && d.createdByUserId === c.id) || (!!d.createdBy && normName(d.createdBy) === normName(c.name));
}

function contactOut(k: any, links: any[]) {
  const d = k.data || {};
  return {
    id: k.id, serial: str(d.serialNumber, 30), name: str(d.name, 200), phone: str(d.phoneNumber, 40), email: str(d.email, 254),
    company: str(d.company || d.companyName, 200),
    openLeads: links.filter((l) => !CLOSED.has(l.status || "")).length,
    leadIds: links.slice(0, 20).map((l) => l.id),
  };
}

lbRoute("GET", "/integration/contacts", async ({ c, query }) => {
  await rateLimit(`lbcont:${c.id}`, 60, 60);
  if (crmScope(c) === "finance") throw forbidden();
  const q = str(query.get("q"), 80);
  if (q.length < 2) throw bad("Type at least 2 characters");
  const limit = Math.max(1, Math.min(50, parseInt(query.get("limit") || "20") || 20));
  const term = q.replace(/[^\p{L}\p{N} @.+\-]/gu, "").trim();
  if (term.length < 2) return { success: true, contacts: [] };
  const filters: string[] = [`name_norm.ilike.%${normName(term)}%`, `email_norm.ilike.%${term.toLowerCase()}%`, `data->>company.ilike.%${term}%`, `data->>serialNumber.ilike.%${term}%`];
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 4) {
    filters.push(`phone_norm.ilike.%${digits}%`);
    const n = normPhone(term);
    if (n.length >= 4 && n !== digits) filters.push(`phone_norm.ilike.%${n}%`);
  }
  const { data, error } = await admin.from("crm_contacts").select("id,data,phone_norm,email_norm,name_norm").is("deleted_at", null)
    .or(filters.join(",")).order("created_at", { ascending: false }).limit(400);
  if (error) throw new HttpError(500, "Could not search contacts");
  const rows = data || [];
  const links = await linkedLeads(c, rows);
  const scope = crmScope(c);
  const contacts = rows.filter((k: any) => contactVisible(c, scope, k, links.get(k.id) || [])).slice(0, limit).map((k: any) => contactOut(k, links.get(k.id) || []));
  return { success: true, contacts };
});

async function visibleContact(c: Caller, id: string): Promise<{ k: any; links: any[] }> {
  if (!ID_RE.test(id)) throw bad("Unknown contact");
  const { data: k } = await admin.from("crm_contacts").select("id,data,phone_norm,email_norm,name_norm").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!k) throw new HttpError(404, "Contact not found");
  const links = (await linkedLeads(c, [k])).get(k.id) || [];
  if (!contactVisible(c, crmScope(c), k, links)) throw new HttpError(404, "Contact not found");
  return { k, links };
}

lbRoute("POST", "/integration/offer-printed", async ({ req, c }) => {
  await rateLimit(`lbprint:${c.id}`, 60, 30);
  if (crmScope(c) === "finance") throw forbidden();
  const b = clean(await body(req, 60_000));
  if (!isObj(b)) throw bad("Invalid request");
  const offerType = str(b.offerType, 30);
  if (!OFFER_TYPES[offerType]) throw bad("Unknown offer type");
  const plots = (Array.isArray(b.plots) ? b.plots : []).slice(0, 50).filter(isObj).map((p: any) => ({
    key: str(p.key, 160), park: str(p.park, 100), unit: str(p.unit, 160), areaSqm: num(p.areaSqm), status: str(p.status, 20).toLowerCase(),
  })).filter((p: any) => p.key || p.unit);
  const { k, links } = await visibleContact(c, str(b.contactId, 60));

  // which lead gets the timeline entry: the given one (if visible and the contact's), else the caller's own open lead of that contact
  let lead: any = null;
  const want = str(b.leadId, 60);
  const scope = crmScope(c), team = scope === "team" ? await teamIds(c) : [];
  const pick = (id: string) => links.find((l) => l.id === id);
  let leadId = want && ID_RE.test(want) && pick(want) ? want : "";
  if (!leadId) leadId = links.find((l) => l.assigned_to === c.id && !CLOSED.has(l.status || ""))?.id || "";
  if (leadId) {
    const { data: ex } = await admin.from("crm_leads").select("*").eq("id", leadId).is("deleted_at", null).maybeSingle();
    if (ex && SPECS.leads.owns(c, scope, team, ex)) lead = ex;
  }

  const total = num(b.totalValue);
  const label = OFFER_TYPES[offerType];
  const codes = plots.map((p: any) => p.unit || p.key).join(", ").slice(0, 300) || "no plots";
  const summary = str(b.summary, 500) || `${label} for ${codes}`;
  const ins = await admin.from("crm_offer_prints").insert({
    contact_id: k.id, lead_id: lead?.id || null, offer_type: offerType, plots, total_value: total && total >= 0 ? total : null,
    summary, doc_name: str(b.docName, 200) || null, printed_by: c.id, printed_by_name: c.name,
  }).select("id").single();
  if (ins.error) throw new HttpError(500, "Could not record the offer");

  if (lead) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = attempt === 0 ? lead : (await admin.from("crm_leads").select("*").eq("id", lead.id).is("deleted_at", null).maybeSingle()).data;
      if (!cur) break;
      const now = nowIso();
      const d = { ...cur.data };
      d.timeline = [...(Array.isArray(d.timeline) ? d.timeline : []).slice(-1000), {
        id: rid(), timestamp: now, type: "Offer", user: c.name, title: `Offer printed (${label}) for ${codes}`.slice(0, 200),
        description: `${label} printed in the Land Bank${total ? `, total ${Math.round(total).toLocaleString("en-US")} EGP` : ""}${summary !== `${label} for ${codes}` ? `. ${summary}` : ""}`.slice(0, 600),
      }];
      d.lastUpdated = now;
      const u = await admin.from("crm_leads").update({ data: d }).eq("id", cur.id).eq("updated_at", cur.updated_at).select("id");
      if (u.data?.length) {
        await admin.from("crm_lead_audit").insert({ lead_id: cur.id, actor_id: c.id, actor_name: c.name, action: "offer", to_value: offerType, note: codes.slice(0, 300) });
        break;
      }
    }
  }
  return { success: true, id: ins.data.id };
});

// ---------------------------------------------------------------------------------------------
// 4. Sales Leads client routes (normal login)
// ---------------------------------------------------------------------------------------------
route("GET", "/plots", async ({ c, query }) => {
  needCrm(c);
  if (!can(c, "canViewSalesPlotsInventory") && !can(c, "canViewSalesLeads")) throw forbidden();
  await rateLimit(`plots:${c.id}`, 60, 40);
  const held = str(query.get("hash"), 128);
  const { data } = await admin.from("plots_snapshot").select("hash,updated_at,plot_count" + (held ? "" : ",data")).eq("id", 1).maybeSingle();
  const landBankUrl = await getConfig<string>("landbank_url", DEFAULT_LB_URL);
  if (!data) return { success: true, updatedAt: null, hash: "", count: 0, plots: [], landBankUrl };
  if (held && held === data.hash) return { success: true, unchanged: true };
  if (held) {
    const full = await admin.from("plots_snapshot").select("data").eq("id", 1).maybeSingle();
    return { success: true, updatedAt: data.updated_at, hash: data.hash, count: data.plot_count, plots: full.data?.data || [], landBankUrl };
  }
  return { success: true, updatedAt: data.updated_at, hash: data.hash, count: data.plot_count, plots: data.data || [], landBankUrl };
});

route("GET", "/crm/offer-prints", async ({ c, query }) => {
  needCrm(c);
  await rateLimit(`prints:${c.id}`, 60, 60);
  const scope = crmScope(c);
  if (scope === "finance") throw forbidden();
  const limit = Math.max(1, Math.min(100, parseInt(query.get("limit") || "50") || 50));
  const contactId = str(query.get("contactId"), 60), leadId = str(query.get("leadId"), 60), plotKey = str(query.get("plotKey"), 160);
  let q: any = admin.from("crm_offer_prints").select("*").order("printed_at", { ascending: false }).limit(limit);
  if (contactId) { await visibleContact(c, contactId); q = q.eq("contact_id", contactId); }
  else if (leadId) {
    if (!ID_RE.test(leadId)) throw bad("Unknown lead");
    const { data: ex } = await admin.from("crm_leads").select("id,status,assigned_to,created_by").eq("id", leadId).is("deleted_at", null).maybeSingle();
    const team = scope === "team" ? await teamIds(c) : [];
    if (!ex || !SPECS.leads.owns(c, scope, team, ex)) throw new HttpError(404, "Lead not found");
    q = q.eq("lead_id", leadId);
  } else {
    if (plotKey) q = q.contains("plots", [{ key: plotKey }]);
    if (scope === "own" || scope === "team") {
      const ids = scope === "team" ? await teamIds(c) : [c.id];
      q = q.in("printed_by", ids);
    }
  }
  const { data, error } = await q;
  if (error) throw new HttpError(500, "Could not load the offers");
  return {
    success: true,
    rows: (data || []).map((r: any) => ({
      id: r.id, contactId: r.contact_id, leadId: r.lead_id, offerType: r.offer_type, plots: r.plots || [], totalValue: r.total_value === null ? null : Number(r.total_value),
      summary: r.summary || "", docName: r.doc_name || "", printedBy: r.printed_by, printedByName: r.printed_by_name || "", printedAt: r.printed_at,
    })),
  };
});

route("GET", "/integration/config", async ({ c }) => {
  needAdmin(c);
  return { success: true, landBankUrl: await getConfig<string>("landbank_url", DEFAULT_LB_URL) };
});
route("POST", "/integration/config", async ({ req, c }) => {
  needAdmin(c);
  const b = await body(req, 2000);
  let u: URL;
  try { u = new URL(str(b.landBankUrl, 300)); } catch { throw bad("Enter the full Land Bank address"); }
  if (u.protocol !== "https:" || u.username || u.password) throw bad("The Land Bank address must be a plain https link");
  const url = u.origin + u.pathname + u.search;
  await setConfig("landbank_url", url);
  await logActivity(c, "Land Bank link", `Land Bank address set to ${u.origin}`, "admin");
  return { success: true, landBankUrl: url };
});
