import { useAuth } from '../../services/AuthContext';
import { WorkflowRequest } from '../../types';

/**
 * What the signed-in user may do with workflow templates. These are the SAME rules the server enforces
 * (routes_tickets.ts): an administrator may do everything; everybody else needs the role permission AND the
 * workflow's department in the matching department list of the role. The server has the last word; this only
 * decides which buttons are shown, so people are not offered actions that would be refused.
 */
export function useWorkflowAccess() {
  const { user, permissions } = useAuth();
  const isAdmin = user?.role === 'Admin';
  const inList = (list: string[] | undefined, dept?: string) =>
    Array.isArray(list) && !!dept && list.some(d => d?.toLowerCase() === dept.toLowerCase());
  const createList = permissions?.allowedDepartmentsToCreate;
  const approveList = permissions?.allowedDepartmentsToApprove;

  /** may start a new workflow (for at least one department) */
  const canCreate = isAdmin || (permissions?.canCreateWorkflow === true && Array.isArray(createList) && createList.length > 0);
  /** may edit / duplicate-into this department */
  const canCreateFor = (dept?: string) => isAdmin || (permissions?.canCreateWorkflow === true && inList(createList, dept));
  const canEditFor = (dept?: string) =>
    isAdmin || (permissions?.canEditWorkflow === true && (inList(createList, dept) || inList(approveList, dept)));
  const canApproveFor = (dept?: string) => isAdmin || (permissions?.canApproveWorkflow === true && inList(approveList, dept));
  const canComment = isAdmin || permissions?.canCommentWorkflow === true;
  const canDelete = (r: Pick<WorkflowRequest, 'createdBy'>) =>
    (isAdmin || permissions?.canEditWorkflow === true) && (isAdmin || (user?.id != null && String(user.id) === String(r.createdBy)));

  return { user, permissions, isAdmin, canCreate, canCreateFor, canEditFor, canApproveFor, canComment, canDelete };
}
