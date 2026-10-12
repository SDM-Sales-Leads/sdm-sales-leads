// One place for the sales team's working vocabulary. It is the vocabulary of the CRM they used for four months, so
// moving to this system changes nothing in how they speak about a lead. Keep server copy in
// supabase/functions/api/leadrules.ts in step with this file.
import type { Lead } from './types';

export const STATUS_GROUPS: { group: string; statuses: string[] }[] = [
  { group: 'Pipeline', statuses: ['New'] },
  { group: 'Contact attempt', statuses: ['Sent WhatsApp', 'No Answer – Sent WhatsApp', 'Out of Coverage – Sent WhatsApp', 'Wrong Number', 'Mail Sent', 'Call Back', 'Client Will Call Back', 'Need Time to Study Our Offer'] },
  { group: 'Sales progress', statuses: ['Offer Sent – Following Up', 'Scheduled Meeting', 'Site Visit Scheduled', 'Negotiation', 'Not Interested', 'Low Budget'] },
  { group: 'Closing', statuses: ['Won', 'Lost'] },
];
export const STATUSES: string[] = STATUS_GROUPS.flatMap((g) => g.statuses);
/** statuses that older rows (and the mail intake) may still carry; shown but not offered */
export const LEGACY_STATUSES = ['Assigned', 'Contacted', 'Follow Up', 'Meeting Scheduled', 'Quotation Sent', 'Waiting Customer', 'Duplicate', 'Invalid', 'No Answer', 'Closed'];

/** need a meeting date + time + notes */
export const REQ_DATETIME = ['Call Back', 'Scheduled Meeting', 'Site Visit Scheduled'];
/** need a next follow-up date */
export const REQ_FOLLOWUP = ['Sent WhatsApp', 'No Answer – Sent WhatsApp', 'Out of Coverage – Sent WhatsApp', 'Mail Sent', 'Client Will Call Back', 'Need Time to Study Our Offer', 'Offer Sent – Following Up'];
/** closed: not workable any more */
export const ACTIVE_EXCLUDE = ['Won', 'Lost', 'Not Interested', 'Low Budget', 'Wrong Number', 'Duplicate', 'Invalid', 'Closed'];
export const PIPELINE_STATUSES = ['Offer Sent – Following Up', 'Scheduled Meeting', 'Site Visit Scheduled', 'Negotiation', 'Meeting Scheduled', 'Quotation Sent'];
export const CLOSED_STATUSES = ACTIVE_EXCLUDE;

export type Stage = 'won' | 'lost' | 'closed' | 'pipeline' | 'active';
export function statusStage(s: string): Stage {
  if (s === 'Won') return 'won';
  if (s === 'Lost') return 'lost';
  if (ACTIVE_EXCLUDE.includes(s)) return 'closed';
  if (PIPELINE_STATUSES.includes(s)) return 'pipeline';
  return 'active';
}
export const isOpenStatus = (s: string) => !ACTIVE_EXCLUDE.includes(s);

export const PRIORITIES = ['VIP', 'High', 'Medium', 'Low'];
export const PRIORITY_ORDER: Record<string, number> = { VIP: 0, Urgent: 0, High: 1, Medium: 2, Normal: 2, Low: 3 };

export const SOURCES = ['Website', 'Billboard', 'Google SEM', 'Facebook', 'Instagram', 'LinkedIn', 'YouTube', 'Radio', 'Mobile App', 'Event / Exhibition', 'Management', 'Referral', 'Personal', 'Walk-In', 'BD Research'];
export const NON_MARKETING_SOURCES = ['Personal', 'Management', 'BD Research'];
export const INDUSTRIES = ['Engineering', 'Pharmaceutical', 'Textile', 'Chemical', 'Food & Beverage (F&B)', 'Logistics', 'Heavy Industry', 'Services', 'Automotive', 'Warehouse'];
export const PROJECTS = ['Industria October', 'Industria Sokhna', 'Industria Asher', 'Industria East', 'Industria West', 'Industria Sadat', 'Industria New Sadat', 'Industria Borg El Arab', 'Industria New Damietta', 'SOKHNA360', 'Al Oula', 'Industria Ras Al Hekma', 'El Minya Green Park', 'Industria Safaga', 'Elsewedy Industrial City (Tanzania)', 'Industria Iraq', 'Other'];
export const QUALIFICATIONS = ['Qualified', 'Unqualified'];
export const TEMPERATURES = ['Hot', 'Warm', 'Cold'];
export const LOST_CATEGORIES = ['Price', 'Not Interested', 'Competitor', 'Location'];
export const LOST_REASONS_TEAM = ['Low Budget', 'Need More Time', 'Need Small Area', 'Need Large Area', 'Collecting Information', 'Industry Not Available', 'Lack of Utilities', 'Not Interested', 'Broker', 'Bought From Another Developer', 'Bought From IDA', 'Bought From SCZone'];

const SOURCE_ALIASES: Record<string, string> = {
  'business development': 'BD Research', bd: 'BD Research',
  google: 'Google SEM', 'google ads': 'Google SEM', adwords: 'Google SEM', sem: 'Google SEM', 'google search': 'Google SEM', 'google adwords': 'Google SEM',
  internet: 'Google SEM', online: 'Google SEM', 'social media': 'Google SEM', social: 'Google SEM', web: 'Google SEM', 'website ads': 'Google SEM',
  fb: 'Facebook', 'f.b': 'Facebook', 'face book': 'Facebook', 'fb leads': 'Facebook', 'facebook leads': 'Facebook', meta: 'Facebook',
  ig: 'Instagram', insta: 'Instagram', instgram: 'Instagram', 'instagram leads': 'Instagram',
  in: 'LinkedIn', 'linked in': 'LinkedIn', 'linkedin leads': 'LinkedIn',
  yt: 'YouTube', 'you tube': 'YouTube',
  'walk in': 'Walk-In', walkin: 'Walk-In', 'walk-in customer': 'Walk-In',
  exhibition: 'Event / Exhibition', event: 'Event / Exhibition', expo: 'Event / Exhibition',
  'n/a': '', na: '', 'n.a': '', none: '', unknown: '', '-': '', '--': '', 'not specified': '',
};
export function normSource(s: string | undefined | null): string {
  const k = String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[._]+$/, '');
  if (!k) return '';
  if (k in SOURCE_ALIASES) return SOURCE_ALIASES[k];
  return SOURCES.find((x) => x.toLowerCase() === k) || String(s).trim();
}
export const isMarketingSource = (s: string) => !NON_MARKETING_SOURCES.includes(normSource(s));

const PROJECT_FIX: [RegExp, string][] = [
  [/^(industria|inustria)\s+(october|oct)\b(?!.*new)/i, 'Industria October'],
  [/^(industria|inustria)\s+sokhna/i, 'Industria Sokhna'],
  [/^(industria|inustria)\s+asher/i, 'Industria Asher'],
  [/^(industria|inustria)\s+east/i, 'Industria East'],
  [/^(industria|inustria)\s+west/i, 'Industria West'],
  [/^(industria|inustria)\s+new\s+sadat/i, 'Industria New Sadat'],
  [/^(industria|inustria)\s+sadat/i, 'Industria Sadat'],
  [/^(industria|inustria)\s+borg\s*(al|el)\s*arab\s*$/i, 'Industria Borg El Arab'],
  [/^(industria|inustria)\s+(new\s+)?damietta/i, 'Industria New Damietta'],
  [/^sokhna\s*360|^sokhna360/i, 'SOKHNA360'],
  [/^al\s*oula/i, 'Al Oula'],
  [/^anadasataraya\s+alaashar/i, 'Industria Asher'],
  [/^enadasataraya\s+akatawabar/i, 'Industria October'],
  [/^(egyptian industrial city|eic)/i, 'Egyptian Industrial City (EIC)'],
];
/** website page names that were captured as a "project" by the ad forms: not a project */
const NOT_A_PROJECT = /^(plan your visit|opportunities page|contact us|textile sector case study.*|n\/a|none|-)$/i;
/** Fixes typos and double spaces in a project name; unknown names are kept as typed (never guessed). */
export function normProject(p: string | undefined | null): string {
  const t = String(p ?? '').trim().replace(/\s+/g, ' ');
  if (!t || NOT_A_PROJECT.test(t)) return '';
  for (const [re, name] of PROJECT_FIX) if (re.test(t)) return name;
  return PROJECTS.find((x) => x.toLowerCase() === t.toLowerCase()) || t;
}

/** Phone to +<digits> (Egypt / KSA / UAE aware). "" when it cannot be repaired. */
export function phoneIntl(raw: string | undefined | null): string {
  let d = String(raw ?? '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/\D/g, '');
  if (!d) return '';
  while (d.startsWith('00')) d = d.slice(2);
  d = d.replace(/^(20)(20)(1\d{9})$/, '$1$3');
  if (/^20\d{10}$/.test(d)) return '+' + d;
  if (/^966\d{9}$/.test(d)) return '+' + d;
  if (/^971\d{9}$/.test(d)) return '+' + d;
  if (/^01\d{9}$/.test(d)) return '+20' + d.slice(1);
  if (/^1\d{9}$/.test(d)) return '+20' + d;
  if (/^05\d{8}$/.test(d)) return '+966' + d.slice(1);
  if (/^5\d{8}$/.test(d)) return '+966' + d;
  if (/^0\d{8,10}$/.test(d)) return '+20' + d.slice(1);
  if (/^2\d{9}$/.test(d)) return '';
  if (d.length >= 11 && d.length <= 15) return '+' + d;
  return '';
}

/** 0-100 ranking aid. `winRate` = historic win rate of the lead's source (0-1), when known. */
export function leadScore(l: Partial<Lead>, winRate = 0, today = new Date()): number {
  let s = 0;
  s += ({ VIP: 25, Urgent: 25, High: 18, Medium: 10, Normal: 10, Low: 3 } as Record<string, number>)[String(l.priority)] ?? 8;
  if (l.qualification === 'Qualified') s += l.temperature === 'Hot' ? 25 : l.temperature === 'Warm' ? 15 : l.temperature === 'Cold' ? 6 : 10;
  else if (l.qualification === 'Unqualified') s -= 15;
  const a = Number(l.requiredSize) || 0;
  s += a >= 50000 ? 15 : a >= 20000 ? 11 : a >= 5000 ? 7 : a > 0 ? 4 : 0;
  s += PIPELINE_STATUSES.includes(String(l.status)) ? 15 : l.status === 'New' ? 5 : 8;
  s += Math.round(winRate * 20);
  const age = l.date ? Math.max(0, (today.getTime() - new Date(l.date).getTime()) / 864e5) : 999;
  s += age <= 14 ? 10 : age <= 30 ? 6 : age <= 90 ? 3 : 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/** the day a deal counts in reports: EOI (when that is the path), else reservation, contract, won date, lead date */
export function closingDate(l: Partial<Lead>): string {
  if (l.wonDate) return l.wonDate;
  if (l.eoiApplicable === true && l.eoiDate) return l.eoiDate;
  return l.reservationDate || l.eoiDate || l.contractDate || (l.date || '').slice(0, 10);
}

export const CONTRACT_STEPS: { key: string; department: string; label: string; slaDays: number }[] = [
  { key: 'development', department: 'Development', label: 'Development', slaDays: 2 },
  { key: 'finance-revision', department: 'Finance', label: 'Finance – revision', slaDays: 2 },
  { key: 'legal', department: 'Legal', label: 'Legal', slaDays: 2 },
  { key: 'finance-signature', department: 'Finance', label: 'Finance – signature', slaDays: 2 },
  { key: 'cfo', department: 'CFO', label: 'CFO signature', slaDays: 2 },
  { key: 'ceo', department: 'CEO', label: 'CEO signature', slaDays: 2 },
];
