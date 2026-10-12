/**
 * Departments offered on the workflow pages. Same list as the server's VALID_DEPTS (routes_tickets.ts), which is
 * what decides whether a completed step hands the ticket to the next department.
 * Workflows belong to a department; steps can also be given to the generic "Manager" / "Director" roles.
 */
export const STEP_ROLES = [
  'Development', 'Finance', 'Infrastructure', 'Sales', 'CRM', 'PMO', 'Procurement', 'Community', 'Business development',
  'GM', 'CEO', 'CFO', 'Manager', 'Director', 'Finance OP', 'Finance Dev', 'Sales Operation', 'Projects', 'Legal',
  'Document Control', 'Office Manager',
] as const;
export const WORKFLOW_DEPARTMENTS = STEP_ROLES.filter(r => r !== 'Manager' && r !== 'Director');
