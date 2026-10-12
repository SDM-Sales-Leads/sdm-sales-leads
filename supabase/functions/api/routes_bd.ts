// deno-lint-ignore-file no-explicit-any
// Business Development weekly tracker: each BD person sets weekly targets, ticks off what was done and writes milestones.
// Everybody with access can read; only the person themself can write their own week.
import { admin, bad, body, Caller, crmScope, forbidden, isAdmin, needCrm, nowIso, rateLimit, str } from "./lib.ts";
import { route } from "./router.ts";

export const BD_CATS = ["Market Research", "Land Acquisition", "Cold Outreach", "Broker & Partner Network", "Feasibility & Site Studies"];
const isBd = (c: Caller) => c.role === "Business Development";
const mayView = (c: Caller) => isBd(c) || isAdmin(c) || crmScope(c) === "all" || ["Sales Director", "Executive (View)"].includes(c.role);

route("GET", "/crm/bd-weekly", async ({ c, query }) => {
  needCrm(c);
  if (!mayView(c)) throw forbidden();
  const from = str(query.get("from"), 10), to = str(query.get("to"), 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw bad("from and to must be dates");
  const [rows, people] = await Promise.all([
    admin.from("crm_bd_weekly").select("member_id,week,category,target,done,notes,updated_at").gte("week", from).lte("week", to).limit(5000),
    admin.from("app_users").select("id,name").eq("role", "Business Development").eq("active", true),
  ]);
  return { success: true, categories: BD_CATS, members: people.data || [], rows: rows.data || [], canEdit: isBd(c), me: c.id };
});

route("POST", "/crm/bd-weekly", async ({ req, c }) => {
  needCrm(c);
  if (!isBd(c)) throw forbidden("Only Business Development team members fill in their own tracker");
  await rateLimit(`bdweek:${c.id}`, 60, 30);
  const b = await body(req, 20_000);
  const week = str(b.week, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || new Date(week + "T00:00:00Z").getUTCDay() !== 0) throw bad("The week must start on a Sunday");
  const items = Array.isArray(b.items) ? b.items.slice(0, 10) : [];
  const now = nowIso();
  const out = items.filter((i: any) => BD_CATS.includes(i?.category)).map((i: any) => ({
    member_id: c.id, week, category: i.category,
    target: Math.max(0, Math.min(100000, Math.floor(Number(i.target) || 0))),
    done: Math.max(0, Math.min(100000, Math.floor(Number(i.done) || 0))),
    notes: str(i.notes, 2000), updated_at: now,
  }));
  if (!out.length) throw bad("Nothing to save");
  const r = await admin.from("crm_bd_weekly").upsert(out, { onConflict: "member_id,week,category" });
  if (r.error) throw bad("Could not save the week");
  return { success: true };
});
