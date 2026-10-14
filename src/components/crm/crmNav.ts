// One way to jump to a record or to a filtered list from any number on any screen (the module listens in SalesCrmModule).
export interface LeadsPreset { ids?: string[]; title?: string; status?: string; project?: string; source?: string; salesperson?: string; search?: string }

const fire = (detail: any) => window.dispatchEvent(new CustomEvent('crm-nav', { detail }));

export const crmNav = {
  /** open a lead card */
  lead: (id: string) => { if (id) fire({ kind: 'lead', id: String(id) }); },
  /** open the customer's 360 view (the contact id, e.g. C-3826) */
  customer: (id: string) => { if (id) fire({ kind: 'customer', id: String(id) }); },
  /** open the leads list showing exactly these leads (or a simple filter) */
  leads: (preset: LeadsPreset) => fire({ kind: 'leads', preset }),
};
