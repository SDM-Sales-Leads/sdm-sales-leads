import { WORKING_HOURS_PER_DAY } from '../../constants';

/** total of the step SLAs in working hours (days count as WORKING_HOURS_PER_DAY); steps without an SLA add nothing */
export const stepsHours = (steps?: { sla?: number; slaUnit?: string }[]) =>
  (steps || []).reduce((sum, s) => sum + (Number.isFinite(s.sla as number) ? (s.sla as number) * (s.slaUnit === 'Days' ? WORKING_HOURS_PER_DAY : 1) : 0), 0);
