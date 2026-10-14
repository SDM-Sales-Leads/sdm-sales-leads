// deno-lint-ignore-file no-explicit-any
// Notifications: stored per user on the server (bell in the app) + e-mail from the system mailbox (the same no-reply account
// the mail ingestion uses). Used by: lead assignment, changes on an assigned lead, reminders (follow-up / meeting / task).
import { admin, escHtml, getConfig, nowIso, str } from "./lib.ts";
import { loadEws, sendMail } from "./ews.ts";

declare const EdgeRuntime: any;
/** keep working after the HTTP answer has been sent (Supabase edge runtime); plain fire-and-forget elsewhere */
export const later = (p: Promise<any>) => { const q = p.catch(() => {}); try { EdgeRuntime?.waitUntil?.(q); } catch { /* ignore */ } };

export async function appBase(): Promise<string> {
  const u = (await getConfig<any>("app", {})).url || Deno.env.get("APP_URL") || "https://sdm-sales-leads.github.io/";
  return String(u).replace(/\/?(index\.html)?$/, "/");
}
/** opens the lead itself after sign-in (the app reads #lead=...) */
export const leadLink = (base: string, id: string) => `${base}#lead=${encodeURIComponent(id)}`;

const shell = (head: string, inner: string) => `<div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;background:#f6f6f6;padding:0;margin:0">
<div style="max-width:600px;margin:20px auto;background:#fff;border:1px solid #e1e1e1;border-radius:8px;overflow:hidden">
<div style="background:#A6192E;padding:16px 22px"><span style="color:#fff;font-size:18px;font-weight:600">SDM Sales Leads</span></div>
<div style="padding:24px;color:#333;line-height:1.6;font-size:15px"><h2 style="color:#A6192E;margin:0 0 12px;font-size:18px">${escHtml(head)}</h2>${inner}</div>
<div style="background:#f1f1f1;padding:10px;text-align:center;font-size:12px;color:#888">Automated message from the sales system. Please do not reply.</div>
</div></div>`;
const btn = (href: string, text: string) => `<p style="margin:18px 0"><a href="${escHtml(href)}" style="color:#A6192E;font-weight:700">${escHtml(text)}</a></p>`;
const row = (k: string, v?: string | number | null) => (v === undefined || v === null || v === "" ? "" : `<tr><td style="padding:3px 14px 3px 0;color:#777;vertical-align:top">${escHtml(k)}</td><td style="padding:3px 0"><b>${escHtml(String(v))}</b></td></tr>`);

/** The hold switch (system_config "notify_hold"). ON unless the value is false: nothing is stored or e-mailed while it is on. */
let holdAt = 0, holdVal = true;
export async function notifyOnHold(): Promise<boolean> {
  if (Date.now() - holdAt > 15_000) { holdVal = (await getConfig<any>("notify_hold", true)) !== false; holdAt = Date.now(); }
  return holdVal;
}
export const resetHoldCache = () => { holdAt = 0; };

export async function addNotifications(rows: { userId: string; type: string; leadId?: string; title: string; body?: string }[]) {
  if (!rows.length || await notifyOnHold()) return;
  await admin.from("crm_notifications").insert(rows.map((r) => ({ user_id: r.userId, type: r.type, lead_id: r.leadId || null, title: str(r.title, 200), body: str(r.body || "", 1500) })));
}

/** one mail per person, from the system mailbox; never throws (a mail problem must not break saving a lead) */
export async function emailUser(userId: string, subject: string, html: string, kind: string) {
  try {
    if (await notifyOnHold()) return;
    const { data: u } = await admin.from("app_users").select("email,active").eq("id", userId).maybeSingle();
    if (!u?.email || u.active === false) return;
    let cfg; try { cfg = await loadEws(); } catch { return; }       // mailbox not set up: in-app notification only
    await sendMail(cfg, { to: [String(u.email)], subject: str(subject, 150).replace(/[\r\n]+/g, " "), html });
    await admin.from("notification_logs").insert({ to_email: u.email, subject, status: "success", type: kind });
  } catch (e: any) {
    await admin.from("notification_logs").insert({ to_email: "", subject, status: "error", error: String(e?.message || "failed").slice(0, 300), type: kind }).then(() => {}, () => {});
  }
}

// ---------------------------------------------------------------------------------------------
// assignment: "you got a new lead"
// ---------------------------------------------------------------------------------------------
export interface Assigned { userId: string; leadId: string; leadName: string; company?: string; project?: string; source?: string; byName?: string }
export async function notifyAssigned(items: Assigned[]) {
  if (!items.length) return;
  const base = await appBase();
  const by = new Map<string, Assigned[]>();
  for (const i of items) by.set(i.userId, [...(by.get(i.userId) || []), i]);
  await addNotifications(items.map((i) => ({ userId: i.userId, type: "assigned", leadId: i.leadId, title: `New lead assigned: ${i.leadName || "(no name)"}`, body: [i.company, i.project, i.byName ? `Assigned by ${i.byName}` : ""].filter(Boolean).join(" · ") })));
  for (const [uid, list] of by) {
    if (list.length <= 3) {
      for (const i of list) {
        await emailUser(uid, `New lead assigned to you: ${i.leadName || ""}`, shell("A new sales lead was assigned to you",
          `<p>You have a new lead: <b>${escHtml(i.leadName || "—")}</b>${i.company ? ` (${escHtml(i.company)})` : ""}.</p>
           <table>${row("Project", i.project)}${row("Source", i.source)}${row("Assigned by", i.byName)}</table>
           ${btn(leadLink(base, i.leadId), `Open the lead: ${i.leadId}`)}`), "Lead Assigned");
      }
    } else {   // a bulk assignment: one mail, not twenty
      await emailUser(uid, `${list.length} new leads assigned to you`, shell(`${list.length} new sales leads were assigned to you`,
        `<ul style="padding-left:18px">${list.slice(0, 25).map((i) => `<li>${escHtml(i.leadName || "—")} — <a href="${escHtml(leadLink(base, i.leadId))}" style="color:#A6192E;font-weight:700">${escHtml(i.leadId)}</a></li>`).join("")}</ul>${list.length > 25 ? `<p>…and ${list.length - 25} more.</p>` : ""}`), "Lead Assigned");
    }
  }
}

// ---------------------------------------------------------------------------------------------
// a change made by somebody else on a lead you own
// ---------------------------------------------------------------------------------------------
export interface Changed { userId: string; leadId: string; leadName: string; summary: string; byName: string }
export async function notifyChanged(items: Changed[]) {
  if (!items.length) return;
  await addNotifications(items.map((i) => ({ userId: i.userId, type: "changed", leadId: i.leadId, title: `${i.leadName || i.leadId} was changed by ${i.byName}`, body: i.summary })));
}

// ---------------------------------------------------------------------------------------------
// reminders (called every 5 minutes by the scheduler; acts between 07:00 and 23:00 Cairo time)
// ---------------------------------------------------------------------------------------------
const CAIRO_PARTS = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
/** an instant from a Cairo wall-clock date + time (the offset changes with summer time, so it is found from the clock itself) */
export function cairoInstant(date: string, time = "09:00"): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || ""); if (!m) return null;
  const t = /^(\d{1,2}):(\d{2})/.exec(time || "") || ["", "9", "00"];
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +t[1], +t[2]);
  for (const off of [3, 2]) {            // Egypt is UTC+3 in summer time, UTC+2 otherwise
    const d = new Date(guess - off * 3600_000), p: any = CAIRO_PARTS(d);
    if (+p.hour === +t[1] && +p.minute === +t[2] && +p.day === +m[3]) return d;
  }
  return new Date(guess - 2 * 3600_000);
}
const whenText = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d) + " (Cairo time)";

interface Due { key: string; userId: string; kind: string; title: string; when: Date; leadId?: string; details: [string, string | undefined][] }

export async function runReminders() {
  const now = new Date();
  const hour = +(CAIRO_PARTS(now) as any).hour;
  if (hour < 7 || hour >= 23) return { skipped: "outside 07:00-23:00 Cairo" };
  const horizon = now.getTime() + 15 * 60_000, floor = now.getTime() - 12 * 3600_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const d0 = iso(now.getTime() - 24 * 3600_000), d1 = iso(now.getTime() + 24 * 3600_000);
  const due: Due[] = [];

  // tasks: due date (with a time when the task has one; a plain date means 09:00)
  const { data: tasks } = await admin.from("crm_tasks").select("id,owner_id,data").neq("data->>status", "Completed").gte("data->>dueDate", d0).lte("data->>dueDate", d1 + "T99").limit(500);
  for (const t of tasks || []) {
    const d = t.data || {}; const s = String(d.dueDate || ""); if (!t.owner_id || !s) continue;
    const when = s.length > 10 ? new Date(s) : cairoInstant(s, "09:00");
    if (!when || isNaN(when.getTime())) continue;
    due.push({ key: `task:${t.id}:${s}`, userId: t.owner_id, kind: "Task", title: d.title || "Task", when, leadId: d.leadId, details: [["Task", d.title], ["Details", d.description], ["Priority", d.priority]] });
  }
  // leads: meeting / site visit slot and the next follow-up date
  const base = admin.from("crm_leads").select("id,assigned_to,data").is("deleted_at", null).not("assigned_to", "is", null);
  const [mt, fu] = await Promise.all([
    base.gte("data->>meetingDate", d0).lte("data->>meetingDate", d1).limit(500),
    admin.from("crm_leads").select("id,assigned_to,data").is("deleted_at", null).not("assigned_to", "is", null).gte("data->>nextFollowUpDate", d0).lte("data->>nextFollowUpDate", d1).limit(500),
  ]);
  const closed = new Set(["Won", "Lost", "Not Interested", "Low Budget", "Duplicate", "Closed", "Invalid"]);
  const leadDetails = (l: any): [string, string | undefined][] => [["Lead", l.data?.customerName], ["Company", l.data?.companyName], ["Phone", l.data?.phoneNumber], ["Project", l.data?.project], ["Status", l.data?.status]];
  for (const l of mt.data || []) {
    if (closed.has(l.data?.status)) continue;
    const when = cairoInstant(l.data.meetingDate, l.data.meetingTime || "09:00"); if (!when) continue;
    due.push({ key: `meet:${l.id}:${l.data.meetingDate}T${l.data.meetingTime || ""}`, userId: l.assigned_to, kind: "Meeting / site visit", title: `Meeting or site visit with ${l.data.customerName || l.id}`, when, leadId: l.id, details: leadDetails(l) });
  }
  for (const l of fu.data || []) {
    if (closed.has(l.data?.status)) continue;
    const when = cairoInstant(l.data.nextFollowUpDate, "09:00"); if (!when) continue;
    due.push({ key: `fu:${l.id}:${l.data.nextFollowUpDate}`, userId: l.assigned_to, kind: "Follow-up", title: `Follow up with ${l.data.customerName || l.id}`, when, leadId: l.id, details: leadDetails(l) });
  }

  const ready = due.filter((x) => x.when.getTime() <= horizon && x.when.getTime() >= floor);
  if (!ready.length) return { checked: due.length, sent: 0 };
  const sentKeys = new Set<string>();
  for (let i = 0; i < ready.length; i += 100) {
    const { data } = await admin.from("crm_reminders_sent").select("key").in("key", ready.slice(i, i + 100).map((r) => r.key));
    (data || []).forEach((r: any) => sentKeys.add(r.key));
  }
  const fresh = ready.filter((r) => !sentKeys.has(r.key)).slice(0, 60);       // a burst is spread over the next runs
  if (!fresh.length) return { checked: due.length, sent: 0 };
  const baseUrl = await appBase();
  await admin.from("crm_reminders_sent").upsert(fresh.map((r) => ({ key: r.key })));      // on hold: they are marked as done and never sent later
  if (await notifyOnHold()) return { checked: due.length, sent: 0, held: fresh.length };
  await addNotifications(fresh.map((r) => ({ userId: r.userId, type: "reminder", leadId: r.leadId, title: `${r.kind}: ${r.title}`, body: whenText(r.when) })));
  for (const r of fresh) {
    await emailUser(r.userId, `Reminder: ${r.title}`, shell(`Reminder: ${r.kind}`,
      `<p><b>${escHtml(r.title)}</b></p><table>${row("When", whenText(r.when))}${r.details.map(([k, v]) => row(k, v)).join("")}</table>${r.leadId ? btn(leadLink(baseUrl, r.leadId), `Open the lead: ${r.leadId}`) : ""}`), "Reminder");
  }
  return { checked: due.length, sent: fresh.length };
}

export { nowIso };
