// deno-lint-ignore-file no-explicit-any
// The size-aware ("fair by sqm") part of lead routing. Pure functions, no database: easy to test.
export interface Load { open: number; sqm: number; total: number }

/** sqm of a lead: a number or text like "5,000"; anything else (empty, "n/a") is unknown = 0 */
export const sqmOf = (v: any): number => {
  const n = Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** the size a lead counts for: its own, else the "assumed size" the owner set (0 = counts only as one lead) */
export const effectiveSqm = (v: any, q: any): number => sqmOf(v) || sqmOf(q?.unknownLeadSqm);

/**
 * Least Open Sqm: the person with the fewest open sqm (ties: fewest open leads, then name).
 * Balanced: a mix of sqm share and lead-count share, set by q.sqmWeight (0-100, % for sqm). The lowest mix wins.
 * Everyone is compared before the lead is added, so a 10,000 sqm lead goes to the lightest person and the next
 * 5,000 + 5,000 go to the others until they catch up.
 */
export function pickBySize<T extends { id: string; name: string }>(elig: T[], load: Record<string, Load>, method: string, q: any): T {
  const L = (u: T) => load[u.id] || { open: 0, sqm: 0, total: 0 };
  const sumSqm = elig.reduce((a, u) => a + L(u).sqm, 0);
  const sumOpen = elig.reduce((a, u) => a + L(u).open, 0);
  const w = method === "Least Open Sqm" ? 1 : Math.min(100, Math.max(0, Number(q?.sqmWeight ?? 50))) / 100;
  const score = (u: T) => w * (sumSqm ? L(u).sqm / sumSqm : 0) + (1 - w) * (sumOpen ? L(u).open / sumOpen : 0);
  return [...elig].sort((a, b) => score(a) - score(b) || L(a).sqm - L(b).sqm || L(a).open - L(b).open || a.name.localeCompare(b.name))[0];
}
