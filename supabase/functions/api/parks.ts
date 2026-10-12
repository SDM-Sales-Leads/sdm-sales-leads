// One alias table for the Land Bank parks: Arabic and English spellings -> the canonical park name used by the Land Bank.
// Used by mail ingestion (server). PARK_ALIASES is plain data so the client can copy it.
// Matching is by whole phrase inside the text, longest alias first, after normalising (case, accents, alef/yaa/taa-marbuta,
// punctuation). An unmatched text returns "" so callers keep what the customer wrote.

export const PARKS = [
  "Industria Borg El Arab", "Industria East", "Industria New Sadat", "Industria October", "Industria Sadat",
  "Industria Sokhna", "Industria West", "Industria Asher - Plot 10", "Industria Asher - Plot 11", "Al Oula", "Sokhna 360",
] as const;

export const PARK_ALIASES: Record<string, string[]> = {
  "Industria Borg El Arab": ["borg el arab", "borg alarab", "borg al arab", "burg el arab", "burj el arab", "burj al arab", "burj arab", "borg elarab", "new borg el arab", "برج العرب", "برج عرب", "بورج العرب", "بورج العرب", "برج العربي"],
  "Industria East": ["industria east", "east industria", "10th of ramadan east", "tenth of ramadan east", "10th ramadan east", "العاشر من رمضان شرق", "العاشر شرق", "اندستريا ايست", "اندستريا الشرق", "انداستريا ايست", "الشرق"],
  "Industria New Sadat": ["new sadat", "new el sadat", "new sadat city", "السادات الجديده", "السادات الجديد", "نيو السادات", "نيو سادات"],
  "Industria Sadat": ["industria sadat", "sadat city", "el sadat", "al sadat", "sadat", "مدينه السادات", "السادات", "سادات"],
  "Industria October": ["industria october", "6th of october", "6 october", "6th october", "sixth of october", "october", "اكتوبر", "السادس من اكتوبر", "6 اكتوبر", "٦ اكتوبر"],
  "Industria Sokhna": ["industria sokhna", "ain sokhna", "ain el sokhna", "el sokhna", "sokhna", "السخنه", "العين السخنه", "عين السخنه", "سخنه"],
  "Industria West": ["industria west", "west industria", "اندستريا ويست", "انداستريا ويست", "اندستريا الغرب", "ويست", "الغرب"],
  "Industria Asher - Plot 10": ["asher plot 10", "asher p10", "asher 10", "plot 10", "p10", "عاشر قطعه 10", "العاشر قطعه 10", "قطعه 10", "10th of ramadan plot 10"],
  "Industria Asher - Plot 11": ["asher plot 11", "asher p11", "asher 11", "plot 11", "p11", "عاشر قطعه 11", "العاشر قطعه 11", "قطعه 11", "10th of ramadan plot 11"],
  "Al Oula": ["al oula", "aloula", "el oula", "al ola", "el ola", "oula", "الاولي", "الاوله", "الأولى", "الاولى"],
  "Sokhna 360": ["sokhna 360", "sokhna360", "sid 360", "sid360", "sokhna three sixty", "سخنه 360", "السخنه 360", "سخنة 360", "360"],
};

/** lower case, no accents, alef/yaa/taa-marbuta folded, digits Arabic-Indic -> Latin, punctuation -> space */
export function normPark(text: string): string {
  return String(text || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[ً-ٰٟـ̀-ͯ]/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^a-z0-9؀-ۿ]+/g, " ").trim().replace(/\s+/g, " ");
}

const TABLE: { alias: string; park: string }[] = [];
for (const [park, list] of Object.entries(PARK_ALIASES)) {
  for (const a of list) { const n = normPark(a); if (n) TABLE.push({ alias: n, park }); }
  const n = normPark(park); if (n) TABLE.push({ alias: n, park });
}
TABLE.sort((a, b) => b.alias.length - a.alias.length);

/** Canonical Land Bank park name for a free text ("اندستريا برج العرب" -> "Industria Borg El Arab"), or "" when nothing matches. */
export function canonicalPark(text: string): string {
  const t = " " + normPark(text) + " ";
  if (t.trim() === "") return "";
  for (const { alias, park } of TABLE) if (t.includes(" " + alias + " ")) return park;
  return "";
}
