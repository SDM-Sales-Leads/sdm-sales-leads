// deno-lint-ignore-file no-explicit-any
// SDM Sales Leads — the one API edge function. All routes live in routes_*.ts.
import { admin, Caller, corsHeaders, dropCallerCache, getCaller, getSecret, HttpError, json, safeEqual } from "./lib.ts";
import { match, pathExists } from "./router.ts";
import "./routes_core.ts";
import "./routes_tickets.ts";
import "./routes_crm.ts";
import "./routes_crm2.ts";
import "./routes_plots.ts";
import { route } from "./router.ts";
import { ingestInbox } from "./ingest.ts";

declare const Deno: any;

// Scheduled mail ingestion (pg_cron -> here). Uses a shared secret instead of a user login, and does nothing
// unless an administrator switched automatic ingestion on.
route("POST", "/cron/ingest", async ({ req }) => {
  const given = req.headers.get("x-cron-secret") || "";
  const want = await getSecret("cron_secret");
  if (!want || !safeEqual(given, want)) throw new HttpError(401, "Not allowed");
  const { data } = await admin.from("system_config").select("value").eq("key", "ingest_auto").maybeSingle();
  if (data?.value !== true) return { skipped: true, reason: "automatic ingestion is off" };
  return await ingestInbox(8, "Scheduled run");
}, { public: true });

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const wrap = (r: Response) => { for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };
  try {
    const url = new URL(req.url);
    // the function name is the first path segment: /api/users -> /users
    const path = url.pathname.replace(/^\/(functions\/v1\/)?api/, "") || "/";
    const m = match(req.method, path);
    if (!m) return wrap(json({ error: pathExists(path) ? "Method not allowed" : "Not found" }, pathExists(path) ? 405 : 404));
    let c: Caller | null = null;
    if (!m.route.isPublic) c = await getCaller(req);
    const result = await m.route.handler({ req, c: c as Caller, params: m.params, query: url.searchParams });
    // anything that can change who a person is or what they may do: forget the remembered callers at once
    if (req.method !== "GET" && /^\/(users|role-permissions|me|admin|auth)/.test(path)) dropCallerCache();
    if (result instanceof Response) return wrap(result);
    return wrap(json(result ?? { success: true }));
  } catch (e: any) {
    if (e instanceof HttpError) return wrap(json({ error: e.message, ...(e.extra || {}) }, e.status));
    console.error("api error", e?.message || e);
    return wrap(json({ error: "Something went wrong on the server" }, 500));
  }
});
