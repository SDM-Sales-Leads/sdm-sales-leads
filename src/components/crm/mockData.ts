import { Lead, Contact, Company, EmailImportLog, QueueSettings, SalespersonTask, SalespersonActivity } from './types';

export const INITIAL_SALES_PEOPLE = [];

export const INITIAL_CONTACTS: Contact[] = [];

export const INITIAL_COMPANIES: Company[] = [];

export const INITIAL_LEADS: Lead[] = [];

export const INITIAL_EMAIL_LOGS: EmailImportLog[] = [];

export const INITIAL_QUEUE_SETTINGS: QueueSettings = {
  canonicalProjects: ["Industria East", "Industria West", "Industria Sadat", "Industria 10th of Ramadan", "Sokhna", "Industria New Alamein"],
  canonicalLeadSources: ["Facebook", "Website", "Referral", "Cold Call", "Exhibition"],
  assignmentMethod: 'Round Robin',
  queueOrder: 'FIFO',
  enableRoundRobin: true,
  enableProjectRouting: true,
  enableSizeRouting: false,
  enablePriorityRouting: true,
  maxLeadsPerSalesperson: 20,
  maxDailyAssignment: 5,
  skipUsersOnLeave: true,
  skipDisabledUsers: true,
  skipInactiveUsers: true,
  autoReassignAfterDays: 3,
  autoEscalation: true,
  businessHoursStart: '08:00',
  businessHoursEnd: '17:00',
  enableOverflowQueue: true
};

export const INITIAL_TASKS: SalespersonTask[] = [];

export const INITIAL_ACTIVITIES: SalespersonActivity[] = [];
