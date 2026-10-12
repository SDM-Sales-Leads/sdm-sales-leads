// deno-lint-ignore-file no-explicit-any
// Integration with the Land Bank system (see docs/INTEGRATION.md).
//  - /integration/* routes taking the Land Bank token are "public" for the router: they verify the token themselves.
//  - /plots, /crm/offer-prints, /integration/config use the normal Sales Leads login.
// No cost / GP / client data is ever stored from the Land Bank: the plot snapshot is whitelisted field by field.
import {
  admin, asUuid, bad, body, can, pageAll, Caller, callerFromEmail, clean, crmScope, forbidden, getConfig, HttpError, isAdmin, isObj,
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

function cleanPlan(p: any): any | null {
  if (!isObj(p)) return null;
  const n = (v: any, max: number) => { const x = num(v); return x === null ? null : Math.max(0, Math.min(max, x)); };
  const mode = str(p.mode, 10).toLowerCase();
  return {
    mode: ["cash", "plan", "custom"].includes(mode) ? mode : "cash",
    advancePct: n(p.advancePct, 100), years: n(p.years, 50), paymentsPerYear: n(p.paymentsPerYear, 52), interestPct: n(p.interestPct, 200),
    instalments: n(p.instalments, 1000), escalationPct: n(p.escalationPct, 200), fixedAnnual: p.fixedAnnual === true,
    totalPayable: n(p.totalPayable, 1e13), cashTotal: n(p.cashTotal, 1e13),
  };
}

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
    project: str(p.project, 120), landType: str(p.landType, 120), sector: str(p.sector, 120), listPriceSqm: num(p.listPriceSqm),
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
    summary, plan: cleanPlan(b.plan), doc_name: str(b.docName, 200) || null, printed_by: c.id, printed_by_name: c.name,
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

// ---------------------------------------------------------------------------------------------
// 7. demand analytics
// ---------------------------------------------------------------------------------------------
route("POST", "/crm/lb-click", async ({ req, c }) => {
  needCrm(c);
  await rateLimit(`lbclick:${c.id}`, 60, 60);
  const b = await body(req, 2000);
  const kind = b.kind === "hold" ? "hold" : b.kind === "open" ? "open" : "";
  const plotKey = str(b.plotKey, 160);
  if (!kind || !plotKey) throw bad("Invalid request");
  const lead = str(b.leadId, 60);
  await admin.from("crm_lb_clicks").insert({ user_id: c.id, user_name: c.name, plot_key: plotKey, kind, lead_id: lead && ID_RE.test(lead) ? lead : null });
  return { success: true };
});

/** from / to as YYYY-MM-DD (to inclusive) -> ISO bounds, or null */
function range(query: URLSearchParams): { from: string | null; to: string | null } {
  const d = (k: string, end: boolean) => {
    const v = str(query.get(k), 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) return null;
    const t = new Date(v + "T00:00:00Z"); if (end) t.setUTCDate(t.getUTCDate() + 1);
    return t.toISOString();
  };
  return { from: d("from", false), to: d("to", true) };
}

route("GET", "/crm/lb-activity", async ({ c, query }) => {
  needCrm(c);
  const scope = crmScope(c);
  if (scope === "finance") throw forbidden();
  await rateLimit(`lbact:${c.id}`, 60, 30);
  const { from, to } = range(query);
  const ids: string[] | null = scope === "own" ? [c.id] : scope === "team" ? await teamIds(c) : null;
  const prints = await pageAll((a, z) => {
    let q: any = admin.from("crm_offer_prints").select("printed_by,printed_by_name,offer_type,contact_id,plots,printed_at").order("printed_at", { ascending: false }).order("id").range(a, z);
    if (from) q = q.gte("printed_at", from); if (to) q = q.lt("printed_at", to);
    if (ids) q = q.in("printed_by", ids);
    return q;
  }, 20000);
  const clicks = await pageAll((a, z) => {
    let q: any = admin.from("crm_lb_clicks").select("user_id,user_name,plot_key,kind,clicked_at").order("clicked_at", { ascending: false }).order("id").range(a, z);
    if (from) q = q.gte("clicked_at", from); if (to) q = q.lt("clicked_at", to);
    if (ids) q = q.in("user_id", ids);
    return q;
  }, 20000);
  const people = new Map<string, any>();
  const get = (id: string | null, name: string | null) => {
    const k = id || "?";
    let r = people.get(k);
    if (!r) { r = { userId: id, name: name || "", salesOffers: 0, financialOffers: 0, proposals: 0, totalPrints: 0, uniqueContacts: 0, uniquePlots: 0, holdClicks: 0, openClicks: 0, lastPrintAt: null, lastClickAt: null, _c: new Set(), _p: new Set() }; people.set(k, r); }
    if (!r.name && name) r.name = name;
    return r;
  };
  for (const p of prints) {
    const r = get(p.printed_by, p.printed_by_name);
    if (p.offer_type === "sales_offer") r.salesOffers++; else if (p.offer_type === "financial_offer") r.financialOffers++; else r.proposals++;
    r.totalPrints++;
    if (p.contact_id) r._c.add(p.contact_id);
    for (const x of Array.isArray(p.plots) ? p.plots : []) if (x?.key) r._p.add(x.key);
    if (!r.lastPrintAt || p.printed_at > r.lastPrintAt) r.lastPrintAt = p.printed_at;
  }
  for (const k of clicks) {
    const r = get(k.user_id, k.user_name);
    if (k.kind === "hold") r.holdClicks++; else r.openClicks++;
    if (!r.lastClickAt || k.clicked_at > r.lastClickAt) r.lastClickAt = k.clicked_at;
  }
  const rows = [...people.values()].map((r) => { r.uniqueContacts = r._c.size; r.uniquePlots = r._p.size; delete r._c; delete r._p; return r; })
    .sort((a, b) => b.totalPrints - a.totalPrints || b.holdClicks + b.openClicks - (a.holdClicks + a.openClicks));
  const totals = rows.reduce((t: any, r: any) => {
    for (const k of ["salesOffers", "financialOffers", "proposals", "totalPrints", "holdClicks", "openClicks"]) t[k] += r[k];
    return t;
  }, { salesOffers: 0, financialOffers: 0, proposals: 0, totalPrints: 0, holdClicks: 0, openClicks: 0 });
  return { success: true, rows, totals };
});

const statsCache = new Map<string, { until: number; data: any }>();
const SIZE_BANDS: [string, number][] = [["< 2,000 m2", 2000], ["2,000 - 5,000 m2", 5000], ["5,000 - 10,000 m2", 10000], ["10,000 - 20,000 m2", 20000], ["20,000+ m2", Infinity]];
const STATS_ROLES = new Set(["Admin", "Sales Operation", "Sales Director", "Executive (View)"]);

lbRoute("GET", "/integration/offer-stats", async ({ c, query }) => {
  if (!STATS_ROLES.has(c.role)) throw forbidden("Offer demand statistics are for management only");
  await rateLimit(`lbstats:${c.id}`, 60, 20);
  const { from, to } = range(query);
  const ck = `${from || ""}|${to || ""}`;
  const hit = statsCache.get(ck);
  if (hit && hit.until > Date.now()) return hit.data;
  const prints = await pageAll((a, z) => {
    let q: any = admin.from("crm_offer_prints").select("contact_id,offer_type,plots,plan,printed_at").order("printed_at", { ascending: false }).order("id").range(a, z);
    if (from) q = q.gte("printed_at", from); if (to) q = q.lt("printed_at", to);
    return q;
  }, 20000);
  const field = (t: string) => (t === "sales_offer" ? "sales" : t === "financial_offer" ? "financial" : "proposal");
  const totals = { prints: prints.length, salesOffers: 0, financialOffers: 0, proposals: 0, contacts: 0, plots: 0 };
  const allContacts = new Set<string>();
  const perPlot = new Map<string, any>(), byProject = new Map<string, any>(), byLand = new Map<string, any>(), bySector = new Map<string, any>();
  const bands = new Map<string, number>(SIZE_BANDS.map(([b]) => [b, 0]));
  const plans = new Map<string, any>(), monthly = new Map<string, number>();
  const mode = { cash: 0, plan: 0, custom: 0 };
  let advSum = 0, advN = 0, yrSum = 0, yrN = 0;
  const bump = (m: Map<string, any>, k: string, init: any, f: string, plotKey: string) => {
    let r = m.get(k); if (!r) { r = { ...init, total: 0, sales: 0, financial: 0, proposal: 0, _p: new Set() }; m.set(k, r); }
    r.total++; r[f]++; r._p.add(plotKey);
  };
  for (const p of prints) {
    const f = field(p.offer_type);
    if (f === "sales") totals.salesOffers++; else if (f === "financial") totals.financialOffers++; else totals.proposals++;
    if (p.contact_id) allContacts.add(p.contact_id);
    const month = String(p.printed_at).slice(0, 7);
    monthly.set(month, (monthly.get(month) || 0) + 1);
    const pl = isObj(p.plan) ? p.plan : null;
    if (pl) {
      const m = pl.mode === "plan" ? "plan" : pl.mode === "custom" ? "custom" : "cash";
      mode[m]++;
      if (m === "plan") {
        const label = `${pl.advancePct ?? "?"}% advance, ${pl.years ?? "?"} y, ${pl.paymentsPerYear ?? "?"}/y`;
        const g = plans.get(label) || { label, mode: m, advancePct: pl.advancePct ?? null, years: pl.years ?? null, paymentsPerYear: pl.paymentsPerYear ?? null, count: 0 };
        g.count++; plans.set(label, g);
        if (typeof pl.advancePct === "number") { advSum += pl.advancePct; advN++; }
        if (typeof pl.years === "number") { yrSum += pl.years; yrN++; }
      }
    }
    // a print with several plots adds 1 to each distinct plot / group, but only 1 to the print totals
    const seen = new Set<string>(), seenP = new Set<string>(), seenL = new Set<string>(), seenS = new Set<string>(), seenB = new Set<string>();
    for (const x of Array.isArray(p.plots) ? p.plots : []) {
      const key = str(x?.key, 160) || str(x?.unit, 160);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      let r = perPlot.get(key);
      if (!r) { r = { key, project: str(x.project, 120) || str(x.park, 100), unit: str(x.unit, 160), landType: str(x.landType, 120), sector: str(x.sector, 120), areaSqm: num(x.areaSqm) ?? 0, sales: 0, financial: 0, proposal: 0, total: 0, _c: new Set(), lastAt: null }; perPlot.set(key, r); }
      r[f]++; r.total++; if (p.contact_id) r._c.add(p.contact_id);
      if (!r.lastAt || p.printed_at > r.lastAt) r.lastAt = p.printed_at;
      const proj = r.project || "-", lt = r.landType || "-", sc = r.sector || "-";
      if (!seenP.has(proj)) { seenP.add(proj); bump(byProject, proj, { project: proj }, f, key); } else byProject.get(proj)._p.add(key);
      if (!seenL.has(lt)) { seenL.add(lt); bump(byLand, lt, { name: lt }, f, key); } else byLand.get(lt)._p.add(key);
      if (!seenS.has(sc)) { seenS.add(sc); bump(bySector, sc, { name: sc }, f, key); } else bySector.get(sc)._p.add(key);
      const band = (SIZE_BANDS.find(([, max]) => r.areaSqm < max) || SIZE_BANDS[SIZE_BANDS.length - 1])[0];
      if (!seenB.has(band)) { seenB.add(band); bands.set(band, (bands.get(band) || 0) + 1); }
    }
  }
  totals.contacts = allContacts.size; totals.plots = perPlot.size;
  const fin = (m: Map<string, any>) => [...m.values()].map((r) => { const o: any = { ...r, plots: r._p.size }; delete o._p; return o; }).sort((a, b) => b.total - a.total);
  const planList = [...plans.values()].sort((a, b) => b.count - a.count);
  const data = {
    success: true, generatedAt: nowIso(), totals,
    perPlot: [...perPlot.values()].map((r) => { const o = { ...r, contacts: r._c.size }; delete (o as any)._c; return o; }).sort((a, b) => b.total - a.total).slice(0, 2000),
    byProject: fin(byProject),
    byLandType: fin(byLand).map((r) => { const o = { ...r, landType: r.name }; delete o.name; return o; }),
    bySector: fin(bySector).map((r) => { const o = { ...r, sector: r.name }; delete o.name; return o; }),
    bySizeBand: [...bands.entries()].map(([band, total]) => ({ band, total })),
    plans: planList,
    planSummary: {
      ...mode, avgAdvancePct: advN ? Math.round((advSum / advN) * 10) / 10 : null, avgYears: yrN ? Math.round((yrSum / yrN) * 10) / 10 : null,
      mostCommon: planList[0] ? { label: planList[0].label, count: planList[0].count } : null,
    },
    monthly: [...monthly.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total })),
  };
  if (statsCache.size > 20) statsCache.clear();
  statsCache.set(ck, { until: Date.now() + 60_000, data });
  return data;
});
