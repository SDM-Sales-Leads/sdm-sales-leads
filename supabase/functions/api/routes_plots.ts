// deno-lint-ignore-file no-explicit-any
// Land inventory (the company's Google Sheet, read as CSV). Cost / profit / client columns are removed on the
// server for everybody who is not allowed to see them — hiding them in the browser would still leak them.
import { admin, bad, body, can, Caller, forbidden, HttpError, isAdmin, isManager, logActivity, need, needCrm, nowIso, rateLimit, str } from "./lib.ts";
import { route } from "./router.ts";

const SENSITIVE = new Set([
  "cost/sqm", "gp/sqm", "total gp", "gp%", "rf price", "total plus interest", "collection amount",
  "client id", "client name", "company name", "sold by", "date of cost", "unified mds", "unified sales report",
]);

function financeAllowed(c: Caller) {
  return isAdmin(c) || c.role === "Sales Operation" || c.perms.canViewPlotFinancials === true;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
const cell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function stripCsv(csv: string): string {
  const rows = parseCsv(csv);
  if (!rows.length) return csv;
  const keep = rows[0].map((h, i) => (SENSITIVE.has(h.trim().toLowerCase()) ? -1 : i)).filter((i) => i >= 0);
  return rows.filter((r) => r.length > 1 || r[0]).map((r) => keep.map((i) => cell(r[i] ?? "")).join(",")).join("\n");
}

function exportUrl(input: string): string {
  let u: URL;
  try { u = new URL(input.trim()); } catch { throw bad("Enter the full Google Sheets link"); }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") throw bad("Only Google Sheets links (docs.google.com) are accepted");
  const m = u.pathname.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,80})/);
  if (!m) throw bad("That is not a Google Sheets link");
  const gid = u.searchParams.get("gid") || u.hash.match(/gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid && /^\d+$/.test(gid) ? `&gid=${gid}` : ""}`;
}

async function loadCache() {
  const { data } = await admin.from("plots_cache").select("*").eq("id", 1).maybeSingle();
  return data as { sheet_url: string | null; csv: string | null; synced_at: string | null } | null;
}

async function syncSheet(): Promise<string> {
  const cache = await loadCache();
  if (!cache?.sheet_url) throw new HttpError(400, "No sheet link is configured yet");
  const url = exportUrl(cache.sheet_url);
  let res: Response;
  try { res = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: "follow" }); } catch { throw new HttpError(502, "Could not reach Google Sheets"); }
  if (!res.ok) throw new HttpError(502, `Google Sheets answered ${res.status} (is the sheet shared by link?)`);
  const text = await res.text();
  if (text.length > 15_000_000) throw new HttpError(502, "The sheet is too large");
  if (!/project name/i.test(text.slice(0, 2000))) throw new HttpError(502, "The sheet does not look like the plots sheet (no 'Project Name' header)");
  const now = nowIso();
  await admin.from("plots_cache").upsert({ id: 1, sheet_url: cache.sheet_url, csv: text, synced_at: now });
  return now;
}

route("GET", "/plots-config", async ({ c }) => {
  needCrm(c);
  const cache = await loadCache();
  return {
    sheetUrl: isManager(c) ? (cache?.sheet_url || "") : "",
    lastSynced: cache?.synced_at || "Never",
    hasCached: !!cache?.csv,
  };
});

route("POST", "/plots-config", async ({ req, c }) => {
  need(c, "canViewAdminPanel");
  const b = await body(req, 5000);
  const target = exportUrl(str(b.sheetUrl, 600));
  const cache = await loadCache();
  await admin.from("plots_cache").upsert({ id: 1, sheet_url: target, csv: cache?.csv ?? null, synced_at: cache?.synced_at ?? null });
  await logActivity(c, "Update Plots Sheet", "Plots sheet link changed", "admin");
  return { success: true, sheetUrl: target };
});

route("POST", "/plots-sync", async ({ c }) => {
  if (!isManager(c)) throw forbidden();
  await rateLimit(`plotsync:${c.id}`, 3600, 20);
  return { success: true, lastSynced: await syncSheet() };
});

route("GET", "/plots-csv", async ({ c }) => {
  needCrm(c);
  if (!can(c, "canViewSalesPlotsInventory") && !can(c, "canViewSalesLeads")) throw forbidden();
  await rateLimit(`plotscsv:${c.id}`, 60, 30);
  let cache = await loadCache();
  if (!cache?.csv) { await syncSheet(); cache = await loadCache(); }
  const csv = cache?.csv || "";
  const outText = financeAllowed(c) ? csv : stripCsv(csv);
  return new Response(outText, {
    status: 200,
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
});
