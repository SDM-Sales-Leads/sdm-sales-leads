// deno-lint-ignore-file no-explicit-any
// Shared helpers for the `api` edge function: client, auth, permissions, validation, logging.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: any;

export const SUPABASE_URL: string = Deno.env.get("SUPABASE_URL")!;
export const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------------------------
// responses & errors
// ---------------------------------------------------------------------------------------------
export class HttpError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}
export const bad = (m: string, extra?: Record<string, unknown>) => new HttpError(400, m, extra);
export const forbidden = (m = "You do not have permission for this action") => new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);

const DEFAULT_ORIGINS = [
  "https://sdm-sales-leads.github.io",
  "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173",
];
export function allowedOrigins(): string[] {
  const env = Deno.env.get("ALLOWED_ORIGINS");
  return env ? env.split(",").map((s: string) => s.trim()).filter(Boolean) : DEFAULT_ORIGINS;
}
export function corsHeaders(origin: string | null): Record<string, string> {
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins().includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
export function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// auth & permissions
// ---------------------------------------------------------------------------------------------
export interface Caller {
  id: string;
  email: string;
  name: string;
  role: string;
  department: string | null;
  teamLeaderId: string | null;
  mustChangePassword: boolean;
  perms: Record<string, any>;
}

const FALLBACK_PERMS: Record<string, any> = {
  canViewDashboard: true,
  canViewTickets: true,
  canViewKnowledgeBase: true,
};

export async function getCaller(req: Request): Promise<Caller> {
  const h = req.headers.get("authorization") || "";
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Sign in required");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "Session expired, sign in again");
  const { data: u } = await admin.from("app_users").select("*").eq("id", data.user.id).maybeSingle();
  if (!u || !u.active) throw new HttpError(403, "This account is not active");
  const { data: rp } = await admin.from("role_permissions").select("perms").eq("role", u.role).maybeSingle();
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    department: u.department,
    teamLeaderId: u.team_leader_id,
    mustChangePassword: !!u.must_change_password,
    perms: { ...FALLBACK_PERMS, ...(rp?.perms || {}) },
  };
}

export const isAdmin = (c: Caller) => c.role === "Admin";
export const can = (c: Caller, perm: string) => isAdmin(c) || c.perms[perm] === true;
export function need(c: Caller, perm: string) {
  if (!can(c, perm)) throw forbidden();
}
export function needAdmin(c: Caller) {
  if (!isAdmin(c)) throw forbidden("Administrators only");
}
// "management" = can open the admin panel (Admin, Sales Operation...)
export const isManager = (c: Caller) => can(c, "canViewAdminPanel");

export type CrmScope = "all" | "team" | "own";
export function crmScope(c: Caller): CrmScope {
  if (isAdmin(c) || c.role === "Sales Operation" || c.perms.canViewSalesRules === true) return "all";
  if (c.role === "Sales Team Leader") return "team";
  return "own";
}
export function needCrm(c: Caller) {
  if (!can(c, "canViewSalesCrm")) throw forbidden();
}

// ---------------------------------------------------------------------------------------------
// rate limit, locks, secrets, logs
// ---------------------------------------------------------------------------------------------
export async function rateLimit(bucket: string, windowSec: number, limit: number) {
  const { data, error } = await admin.rpc("app_rate_hit", { p_bucket: bucket, p_window_seconds: windowSec, p_limit: limit });
  if (error) return; // never block on limiter failure
  if (data === false) throw new HttpError(429, "Too many requests, try again later");
}
export async function tryLock(name: string, seconds: number): Promise<boolean> {
  const { data } = await admin.rpc("app_try_lock", { p_name: name, p_seconds: seconds });
  return data === true;
}
export async function unlock(name: string) {
  await admin.rpc("app_unlock", { p_name: name });
}
export async function getSecret(name: string): Promise<string | null> {
  const { data } = await admin.rpc("app_get_secret", { p_name: name });
  return typeof data === "string" && data ? data : null;
}
export async function hasSecret(name: string): Promise<boolean> {
  const { data } = await admin.rpc("app_has_secret", { p_name: name });
  return data === true;
}
export async function setSecret(name: string, value: string) {
  const { error } = await admin.rpc("app_set_secret", { p_name: name, p_value: value });
  if (error) throw new HttpError(500, "Could not store the secret");
}

export async function logActivity(c: Caller | null, action: string, details: string, type = "system") {
  await admin.from("activity_logs").insert({
    user_id: c?.id ?? null,
    user_name: c?.name ?? "System",
    action: action.slice(0, 120),
    details: details.slice(0, 600),
    type,
  });
}

export async function getConfig<T = any>(key: string, fallback: T): Promise<T> {
  const { data } = await admin.from("system_config").select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? fallback;
}
export async function setConfig(key: string, value: unknown) {
  await admin.from("system_config").upsert({ key, value, updated_at: new Date().toISOString() });
}

// ---------------------------------------------------------------------------------------------
// request body & validation
// ---------------------------------------------------------------------------------------------
export async function body(req: Request, maxBytes = 2_000_000): Promise<any> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) throw new HttpError(413, "Request too large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "Request too large");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw bad("Invalid JSON");
  }
}
export const isObj = (v: any) => v && typeof v === "object" && !Array.isArray(v);
export function str(v: any, max = 500): string {
  if (v === undefined || v === null) return "";
  return String(v).trim().slice(0, max);
}
export const isEmail = (s: string) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) && s.length <= 254;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asUuid = (v: any): string | null => (typeof v === "string" && UUID_RE.test(v) ? v.toLowerCase() : null);

// keys that must never be copied from client objects
const BAD_KEYS = new Set(["__proto__", "constructor", "prototype"]);
export function clean<T = any>(v: T, depth = 0): T {
  if (depth > 12) return undefined as any;
  if (Array.isArray(v)) return v.map((x) => clean(x, depth + 1)) as any;
  if (v && typeof v === "object") {
    const o: any = {};
    for (const k of Object.keys(v as any)) if (!BAD_KEYS.has(k)) o[k] = clean((v as any)[k], depth + 1);
    return o;
  }
  return v;
}

export function normPhone(p: any): string {
  if (!p) return "";
  let n = String(p).trim().replace(/[^\d+]/g, "").replace(/^\+/, "");
  if (n.startsWith("0020") && n.length === 14) n = "0" + n.slice(4);
  else if (n.startsWith("20") && n.length === 12) n = "0" + n.slice(2);
  else if (n.length === 10 && n.startsWith("1")) n = "0" + n;
  return n;
}
export const normEmail = (e: any) => (e ? String(e).trim().toLowerCase() : "");
export const normName = (n: any) => (n ? String(n).trim().toLowerCase().replace(/\s+/g, " ") : "");

export const escHtml = (s: any) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
export const escXml = escHtml;

export const nowIso = () => new Date().toISOString();
export const rid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 9);

// constant-time string compare
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
