import { WorkflowRequest, WorkflowStep, Dependency, SalesFeedback } from '../types';

export const workflowService = {
  getAll: async (): Promise<WorkflowRequest[]> => {
    try {
      const res = await fetch('/api/workflow-requests');
      if (!res.ok) throw new Error('Failed to fetch workflow requests');
      return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  },

  create: async (request: Partial<WorkflowRequest>): Promise<WorkflowRequest> => {
    const res = await fetch('/api/workflow-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!res.ok) throw new Error('Failed to create workflow request');
    return await res.json();
  },

  update: async (id: string, updates: Partial<WorkflowRequest>): Promise<WorkflowRequest> => {
    const res = await fetch(`/api/workflow-requests/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update workflow request');
    return await res.json();
  },

  delete: async (id: string, userId?: string, userName?: string): Promise<void> => {
    const query = new URLSearchParams();
    if (userId) query.append('userId', userId);
    if (userName) query.append('userName', userName);
    
    const res = await fetch(`/api/workflow-requests/${id}?${query.toString()}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('Failed to delete workflow request');
  }
};
