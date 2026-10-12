import React, { useState } from 'react';
import { BookOpen, ChevronDown } from 'lucide-react';
import { Lead } from './types';

export interface CrmGuideProps {
  leads: Lead[];
  onLeadsUpdated: () => void;
  currentRole: string;
  setActiveSubTab?: (tab: string) => void;
}

// Old "How to use" (spec_D 16) condensed into a static page. The old walkthrough auto-played mock screens; this keeps the same
// chapters and the same business rules as plain text (no timers).
interface Step { t: string; b: string }
const GUIDES: { key: string; label: string; intro: string; steps: Step[] }[] = [
  {
    key: 'sales', label: 'Sales',
    intro: 'Your day starts on My Day. It lists the leads to work, in the order that matters.',
    steps: [
      { t: 'Start on My Day', b: 'Leads are ranked: meetings and site visits today, offers to chase, overdue follow-ups, new leads to call first, then the rest. Work from the top.' },
      { t: 'Call first, then update the status', b: 'After every contact choose the real status. Call Back, Scheduled Meeting and Site Visit Scheduled need a date and time. Statuses such as Sent WhatsApp, Mail Sent or Client Will Call Back need a next follow-up date, so the lead never disappears.' },
      { t: 'Qualify the lead', b: 'Mark it Qualified or Unqualified and set the temperature (Hot, Warm, Cold). Qualified hot leads rise in your list.' },
      { t: 'Send offers and chase them', b: 'Mark an offer as sent on the Offers page. The system sets a follow-up date 2 calendar days later and shows overdue offers in red.' },
      { t: 'Use the Calendar', b: 'All your meetings, site visits, call backs and follow-ups sit on the Calendar. Click an item to open the lead.' },
      { t: 'Close the deal', b: 'To move a lead to Won the deal value (EGP) is required. Lost needs a reason. After Won, the deal goes to Finance for cash confirmation and to the contract route.' },
      { t: 'Keep your streak', b: 'Achievements shows points, levels, badges and your activity streak. Working week is Sunday to Thursday; Friday and Saturday never break a streak.' },
    ],
  },
  {
    key: 'ops', label: 'Sales Operation',
    intro: 'You keep the lead flow fair and the data clean. Only Sales Operation and team leaders distribute leads.',
    steps: [
      { t: 'Distribute new leads', b: 'Unassigned leads wait in the Lead queue. Assign them by the assignment rules (fewest open leads first). A rep cannot change the owner, source, phone, email, lead date or priority of a lead.' },
      { t: 'Watch the SLA', b: 'VIP leads must be contacted within 4 hours of assignment, every other lead within 48 hours. Neglected leads are listed so you can move them.' },
      { t: 'Duplicates are flagged, never lost', b: 'Leads with the same phone or e-mail are flagged. Review them on the Duplicates page and merge them so the history of both is kept.' },
      { t: 'Import and export', b: 'Import uses the team\'s 35-column sheet. A preview shows new, updated, unchanged and invalid rows before anything is saved.' },
      { t: 'Run the contract route', b: 'Every won deal goes through Development, Finance revision, Legal, Finance signature, CFO and CEO. Contract Control shows what is overdue or blocked.' },
      { t: 'Audit trail', b: 'Every change to a protected field is written to the audit trail by the server. Nobody can edit or delete it from the page.' },
    ],
  },
  {
    key: 'leader', label: 'Team leader and management',
    intro: 'You see your team\'s leads; management sees everything.',
    steps: [
      { t: 'Team day', b: 'The team view shows each person\'s open leads, overdue follow-ups, leads without a date and offers waiting for an answer.' },
      { t: 'Reports and targets', b: 'Reports give the funnel, win rate, speed to first contact and lost reasons by period, owner and source. Targets compare each person\'s won value with the annual target and the share of the year that has passed.' },
      { t: 'Hierarchy', b: 'Each salesperson reports to a team leader; team leaders report to management. A team leader sees the direct reports\' leads.' },
      { t: 'Reassigning leads', b: 'Team leaders can move leads inside their team; Sales Operation can move any lead. The previous owner stays in the history.' },
    ],
  },
  {
    key: 'finance', label: 'Finance (accounts receivable)',
    intro: 'You see Won deals only.',
    steps: [
      { t: 'Confirm cash', b: 'Only accounts receivable can confirm that cash was received. A confirmed deal can be reopened with a reason, and both actions are in the audit trail.' },
      { t: 'Follow the collection', b: 'The Finance page shows pending and confirmed deals and the value waiting to be collected.' },
      { t: 'Contracts', b: 'The Finance revision and signature steps of the contract route are handled by Finance; blocked or overdue contracts are listed in Contract Control.' },
    ],
  },
];

const RULES = [
  'Missing data is shown as "—". Nothing is estimated or invented.',
  'Won needs a deal value (EGP); Lost needs a reason.',
  'Leads are never deleted by duplicate checks: they are flagged and merged with their history.',
  'Finance sees Won deals only. Salespeople see their own leads; team leaders see their team.',
  'Only Sales Operation and team leaders distribute leads. Source, phone, e-mail, lead date and priority are protected for reps.',
];

export const CrmGuide: React.FC<CrmGuideProps> = () => {
  const [tab, setTab] = useState(GUIDES[0].key);
  const [open, setOpen] = useState<number | null>(0);
  const g = GUIDES.find((x) => x.key === tab) || GUIDES[0];
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl">
      <div>
        <h2 className="text-xl font-black text-brand-dark flex items-center gap-2"><BookOpen size={20} /> How to use</h2>
        <p className="text-sm text-brand-gray">A short guide for each team. Pick yours.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {GUIDES.map((x) => <button key={x.key} onClick={() => { setTab(x.key); setOpen(0); }} className={`px-3 py-2 rounded-xl text-sm font-bold border ${tab === x.key ? 'bg-brand-red text-white border-brand-red' : 'bg-white text-brand-dark border-gray-200'}`}>{x.label}</button>)}
      </div>
      <p className="text-sm text-brand-dark">{g.intro}</p>
      <div className="space-y-2">
        {g.steps.map((s, i) => (
          <div key={s.t} className="bg-white border border-gray-100 rounded-2xl shadow-sm">
            <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <span className="w-7 h-7 shrink-0 rounded-full bg-brand-red/10 text-brand-red text-sm font-black flex items-center justify-center">{i + 1}</span>
              <span className="font-bold text-brand-dark flex-1">{s.t}</span>
              <ChevronDown size={16} className={`text-brand-gray transition-transform ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <div className="px-4 pb-4 pl-14 text-sm text-brand-gray">{s.b}</div>}
          </div>))}
      </div>
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4">
        <h3 className="font-black text-brand-dark mb-2">Rules that apply to everyone</h3>
        <ul className="list-disc pl-5 text-sm text-brand-gray space-y-1">{RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>
    </div>
  );
};
