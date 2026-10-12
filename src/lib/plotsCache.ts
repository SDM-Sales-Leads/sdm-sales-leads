// The plots sheet is one large CSV. It is fetched once and shared by every screen for 10 minutes
// (until an administrator syncs it), instead of once per page visit.
let cache: { at: number; text: string } | null = null;
let inflight: Promise<string> | null = null;
const TTL = 10 * 60_000;

export function dropPlotsCache() { cache = null; }

export async function getPlotsCsv(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL) return cache.text;
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch('/api/plots-csv');
    if (!res.ok) throw new Error(`HTTP ${res.status} - ${res.statusText}`);
    const text = await res.text();
    cache = { at: Date.now(), text };
    return text;
  })().finally(() => { inflight = null; });
  return inflight;
}
