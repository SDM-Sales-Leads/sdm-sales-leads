// deno-lint-ignore-file no-explicit-any
// Server-side rules for a lead. The browser applies the same rules for convenience, but only these count:
// they are what keeps lead distribution fair (an owner cannot be changed, a source relabelled or a value
// confirmed by the person who benefits) and what writes the audit trail.
import type { Caller, CrmScope } from "./lib.ts";

export const TEAM_STATUSES = [
  "New", "Sent WhatsApp", "No Answer – Sent WhatsApp", "Out of Coverage – Sent WhatsApp", "Wrong Number", "Mail Sent", "Call Back",
  "Client Will Call Back", "Need Time to Study Our Offer", "Offer Sent – Following Up", "Scheduled Meeting", "Site Visit Scheduled",
  "Negotiation", "Not Interested", "Low Budget", "Won", "Lost",
];
export const LEGACY_STATUSES = ["Assigned", "Contacted", "Follow Up", "Meeting Scheduled", "Quotation Sent", "Waiting Customer", "Duplicate", "Invalid", "No Answer", "Closed"];
export const ALL_STATUSES = new Set([...TEAM_STATUSES, ...LEGACY_STATUSES]);

/** fields only Sales Operation / admin may change on an existing lead (identity and origin of the lead) */
export const PROTECTED_FOR_REPS = ["source", "channel", "phoneNumber", "email", "date", "priority", "legacyId", "legacyOwnerName", "srcOriginal", "contract"];
/** fields only accounts receivable (or operations) may change */
const CASH_FIELDS = ["cashStatus", "cashBy", "cashDate"];

const today = () => new Date().toISOString().slice(0, 10);

export interface Sanitized { data: any; error?: string; audits: { action: string; from?: string; to?: string; note?: string }[] }

/**
 * d = what the browser sent, ex = what is stored (null for a new lead).
 * Returns the data to store (protected fields restored) or an error to show the user.
 */
export function sanitizeLead(d: any, ex: any | null, c: Caller, scope: CrmScope, assigneeName?: string): Sanitized {
  const audits: Sanitized["audits"] = [];
  if (JSON.stringify(d).length > 400_000) return { data: d, error: "this lead is too large to save", audits };
  if (d.status && !ALL_STATUSES.has(d.status)) return { data: d, error: `unknown status "${String(d.status).slice(0, 40)}"`, audits };
  const canCash = scope === "all" || c.perms.canConfirmCash === true;

  if (ex) {
    const old = ex.data || {};
    if (scope !== "all") for (const k of PROTECTED_FOR_REPS) { if (k === "contract" && c.perms.canManageContracts === true) continue; if (old[k] === undefined) delete d[k]; else d[k] = old[k]; }
    if (!canCash) for (const k of CASH_FIELDS) { if (old[k] === undefined) delete d[k]; else d[k] = old[k]; }
    // the history of a lead is append-only: whatever the browser sends, earlier entries stay
    for (const k of ["timeline", "comments"]) {
      if (Array.isArray(old[k]) && old[k].length) {
        const have = new Set((Array.isArray(d[k]) ? d[k] : []).map((x: any) => x?.id));
        d[k] = [...old[k].filter((x: any) => !have.has(x?.id)), ...(Array.isArray(d[k]) ? d[k] : [])];
      }
    }
    if (assigneeName !== undefined && (d.assignedSalespersonId || "") !== (old.assignedSalespersonId || "")) {
      d.assignedSalespersonName = assigneeName;
      d.assignedDate = new Date().toISOString();
      d.firstContactAt = "";
      d.reassignCount = (Number(old.reassignCount) || 0) + 1;
      audits.push({ action: "owner", from: old.assignedSalespersonName || "(none)", to: assigneeName || "(none)" });
    }
    if (d.status !== old.status) {
      audits.push({ action: "status", from: old.status, to: d.status });
      if (d.status === "Won" && old.status !== "Won") {
        if (!(Number(d.dealValue) > 0)) return { data: d, error: "a Won lead needs the deal value (EGP)", audits };
        d.cashStatus = d.cashStatus || "pending";
        d.wonDate = d.wonDate || today();
      }
      if (d.status === "Lost" && !(d.lostReason && (d.lostCategory || d.lostComment !== undefined))) {
        // the browser asks for both; the server only insists on the reason
        if (!d.lostReason) return { data: d, error: "a Lost lead needs a reason", audits };
      }
    }
    if (String(d.source ?? "") !== String(old.source ?? "")) audits.push({ action: "source", from: old.source, to: d.source });
    for (const k of ["dealValue", "totalSoldValue", "soldArea", "plotNo"]) if (String(d[k] ?? "") !== String(old[k] ?? "")) audits.push({ action: "value", from: `${k}=${old[k] ?? ""}`, to: `${k}=${d[k] ?? ""}` });
    for (const k of ["eoiDate", "reservationDate", "contractDate"]) if (String(d[k] ?? "") !== String(old[k] ?? "")) audits.push({ action: "stage", from: `${k}=${old[k] ?? ""}`, to: `${k}=${d[k] ?? ""}` });
    if (String(d.cashStatus ?? "") !== String(old.cashStatus ?? "")) audits.push({ action: "cash", from: old.cashStatus, to: d.cashStatus });
  } else {
    if (scope !== "all" && d.status === "Won") d.status = "New"; // a lead cannot be created already won
    if (!canCash) for (const k of CASH_FIELDS) delete d[k];
    audits.push({ action: "create", to: d.status || "New", note: d.source || "" });
  }
  return { data: d, audits };
}
