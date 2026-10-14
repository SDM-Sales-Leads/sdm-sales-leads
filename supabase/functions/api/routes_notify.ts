// deno-lint-ignore-file no-explicit-any
// The bell (per-user notifications), "forgot password" with an e-mailed code, and the reminder schedule.
import { admin, body, bad, escHtml, getSecret, HttpError, isObj, logActivity, normEmail, nowIso, rateLimit, safeEqual, str } from "./lib.ts";
import { route } from "./router.ts";
import { loadEws, sendMail } from "./ews.ts";
import { appBase, runReminders } from "./notify.ts";

// ---------------------------------------------------------------------------------------------
// the bell
// ---------------------------------------------------------------------------------------------
route("GET", "/crm/my-notifications", async ({ c, query }) => {
  const limit = Math.max(1, Math.min(Number(query.get("limit")) || 40, 100));
  const [list, unread] = await Promise.all([
    admin.from("crm_notifications").select("id,type,lead_id,title,body,created_at,read_at").eq("user_id", c.id).order("created_at", { ascending: false }).limit(limit),
    admin.from("crm_notifications").select("id", { count: "exact", head: true }).eq("user_id", c.id).is("read_at", null),
  ]);
  return { unread: unread.count || 0, items: (list.data || []).map((n: any) => ({ id: n.id, type: n.type, leadId: n.lead_id, title: n.title, body: n.body, at: n.created_at, read: !!n.read_at })) };
});

route("POST", "/crm/notifications/read", async ({ req, c }) => {
  const b = await body(req, 20_000);
  let q = admin.from("crm_notifications").update({ read_at: nowIso() }).eq("user_id", c.id).is("read_at", null);
  if (!b.all) {
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x: any) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200);
    if (!ids.length) return { success: true };
    q = q.in("id", ids);
  }
  await q;
  return { success: true };
});

// ---------------------------------------------------------------------------------------------
// forgot password: a 6-digit code to the work e-mail (from the no-reply mailbox), then a new password
// ---------------------------------------------------------------------------------------------
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map((x) => x.toString(16).padStart(2, "0")).join("");
const pepper = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const CODE_MINUTES = 15;

route("POST", "/auth/forgot", async ({ req }) => {
  const b = await body(req, 2000);
  const email = normEmail(str(b.email, 254));
  const generic = { success: true, message: "If this e-mail belongs to an active account, a code was sent to it." };   // never says whether the account exists
  if (!email || !email.includes("@")) return generic;
  await rateLimit(`forgot:${email}`, 3600, 4);
  await rateLimit("forgot:all", 3600, 120);
  const { data: u } = await admin.from("app_users").select("id,name,email,active").ilike("email", email.replace(/[%_\\]/g, (m) => "\\" + m)).limit(1).maybeSingle();
  if (!u || u.active === false || normEmail(u.email) !== email) return generic;
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  await admin.from("pw_resets").upsert({ email, code_hash: await sha(`${code}:${email}:${pepper()}`), expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(), tries: 0, created_at: nowIso() });
  try {
    const base = await appBase();
    await sendMail(await loadEws(), {
      to: [u.email], subject: "Your SDM Sales Leads password reset code",
      html: `<div style="font-family:Segoe UI,Tahoma,Arial,sans-serif;max-width:520px;margin:20px auto;border:1px solid #e1e1e1;border-radius:8px;overflow:hidden">
<div style="background:#A6192E;padding:16px 22px;color:#fff;font-size:18px;font-weight:600">SDM Sales Leads</div>
<div style="padding:24px;color:#333;line-height:1.6;font-size:15px"><p>Hello ${escHtml(u.name || "")},</p>
<p>Use this code to set a new password. It is valid for ${CODE_MINUTES} minutes and works once.</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#A6192E;margin:18px 0">${code}</p>
<p><a href="${escHtml(base)}#reset=${encodeURIComponent(email)}" style="color:#A6192E;font-weight:700">Open the reset page</a> and enter the code there.</p>
<p style="color:#888;font-size:13px">If you did not ask for this, ignore this e-mail: your password stays as it is.</p></div></div>`,
    });
  } catch { /* the user simply gets no mail; the answer stays the same */ }
  return generic;
}, { public: true });

route("POST", "/auth/reset", async ({ req }) => {
  const b = await body(req, 4000);
  const email = normEmail(str(b.email, 254));
  const code = str(b.code, 12).replace(/\s/g, "");
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !/^\d{6}$/.test(code)) throw bad("Enter the 6-digit code from the e-mail");
  if (password.length < 8 || password.length > 100 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) throw bad("The new password needs at least 8 characters, with letters and numbers");
  await rateLimit(`reset:${email}`, 3600, 12);
  const { data: r } = await admin.from("pw_resets").select("*").eq("email", email).maybeSingle();
  const wrong = new HttpError(400, "The code is wrong or has expired. Ask for a new one.");
  if (!r || new Date(r.expires_at).getTime() < Date.now() || r.tries >= 5) throw wrong;
  if (!safeEqual(await sha(`${code}:${email}:${pepper()}`), r.code_hash)) {
    await admin.from("pw_resets").update({ tries: r.tries + 1 }).eq("email", email);
    throw wrong;
  }
  const { data: u } = await admin.from("app_users").select("id,name,active").ilike("email", email.replace(/[%_\\]/g, (m) => "\\" + m)).limit(1).maybeSingle();
  if (!u || u.active === false) throw wrong;
  const up = await admin.auth.admin.updateUserById(u.id, { password });
  if (up.error) throw new HttpError(400, "That password was not accepted. Try a longer one.");
  await admin.from("pw_resets").delete().eq("email", email);                    // the code works once
  await admin.from("app_users").update({ must_change_password: false }).eq("id", u.id);
  await logActivity(null, "Password reset", `${u.name || email} reset the password with an e-mailed code`, "security");
  return { success: true };
}, { public: true });

// ---------------------------------------------------------------------------------------------
// reminders: the scheduler calls this every 5 minutes
// ---------------------------------------------------------------------------------------------
route("POST", "/cron/reminders", async ({ req }) => {
  const given = req.headers.get("x-cron-secret") || "";
  const want = await getSecret("cron_secret");
  if (!want || !safeEqual(given, want)) throw new HttpError(401, "Not allowed");
  const { data } = await admin.from("system_config").select("value").eq("key", "ingest_auto").maybeSingle();
  if (data?.value !== true) return { skipped: true, reason: "automatic jobs are off" };
  return await runReminders();
}, { public: true });

void isObj;
