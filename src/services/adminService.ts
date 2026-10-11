import { Category, SLAConfig } from '../types';
import { fetchWithTimeout } from '../lib/fetchUtils';

// the server explains refusals ("This is the last administrator"...): show that, not a generic text
async function fail(res: Response, fallback: string): Promise<never> {
  let msg = fallback;
  try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* keep fallback */ }
  throw new Error(msg);
}

export const adminService = {
  getCategories: async (): Promise<Category[]> => {
    const res = await fetchWithTimeout('/api/categories', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch categories');
    return await res.json();
  },

  addCategory: async (type: string, subtype: string, department?: string) => {
    const res = await fetchWithTimeout('/api/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, subtype, department }),
    }, 10000);
    if (!res.ok) await fail(res, 'Failed to add category');
  },

  deleteCategory: async (id: number, userId?: string, userName?: string) => {
    const query = new URLSearchParams();
    if (userId) query.append('userId', userId);
    if (userName) query.append('userName', userName);
    const res = await fetchWithTimeout(`/api/categories/${id}?${query.toString()}`, { method: 'DELETE' }, 10000);
    if (!res.ok) await fail(res, 'Failed to delete category');
  },

  getSLA: async (): Promise<SLAConfig[]> => {
    const res = await fetchWithTimeout('/api/sla', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch SLA');
    return await res.json();
  },

  updateSLA: async (priority: string, hours: number) => {
    const res = await fetchWithTimeout('/api/sla', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority, hours }),
    }, 10000);
    if (!res.ok) await fail(res, 'Failed to update SLA');
  },

  getUsers: async () => {
    const res = await fetchWithTimeout('/api/users', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch users');
    return await res.json();
  },

  addUser: async (userData: any) => {
    const res = await fetchWithTimeout('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    }, 10000);
    if (!res.ok) await fail(res, 'Failed to add user');
    return await res.json();
  },

  updateUser: async (id: string | number, userData: any) => {
    const res = await fetchWithTimeout(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    }, 10000);
    if (!res.ok) await fail(res, 'Failed to update user');
    return await res.json();
  },

  deleteUser: async (id: string | number, userId?: string, userName?: string) => {
    const res = await fetchWithTimeout(`/api/users/${id}`, { method: 'DELETE' }, 10000);
    if (!res.ok) await fail(res, 'Failed to delete user');
  },

  getArticles: async () => {
    const res = await fetchWithTimeout('/api/articles', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch articles');
    return await res.json();
  },

  addArticle: async (articleData: any) => {
    const res = await fetchWithTimeout('/api/articles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(articleData),
    }, 10000);
    if (!res.ok) await fail(res, 'Failed to create article');
    return await res.json();
  },

  deleteArticle: async (id: string, userId?: string, userName?: string) => {
    const query = new URLSearchParams();
    if (userId) query.append('userId', userId);
    if (userName) query.append('userName', userName);
    const res = await fetchWithTimeout(`/api/articles/${id}?${query.toString()}`, { method: 'DELETE' }, 10000);
    if (!res.ok) await fail(res, 'Failed to delete article');
  },

  getEmailConfig: async () => {
    const res = await fetchWithTimeout('/api/admin/email-config', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch email config');
    return await res.json();
  },

  saveEmailConfig: async (config: any) => {
    const res = await fetchWithTimeout('/api/admin/email-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }, 45000);
    if (!res.ok) await fail(res, 'Failed to save email config');
    return res.json();
  },

  testEmail: async (to: string, config: any) => {
    const res = await fetchWithTimeout('/api/admin/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, config }),
    }, 60000);
    return await res.json();
  },

  getRolePermissions: async (): Promise<any[]> => {
    const res = await fetchWithTimeout('/api/admin/role-permissions', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch role permissions');
    return await res.json();
  },

  
  getNotificationLogs: async (): Promise<any[]> => {
    const res = await fetchWithTimeout('/api/admin/notifications', {}, 10000);
    if (!res.ok) await fail(res, 'Failed to fetch notification logs');
    return await res.json();
  },

  purgeNotificationLogs: async (): Promise<any> => {
    const res = await fetchWithTimeout('/api/admin/notifications/purge-all', { method: 'POST' }, 10000);
    if (!res.ok) await fail(res, 'Failed to purge notification logs');
    return await res.json();
  },

  getActivityLogs: async (): Promise<any> => {
    const res = await fetchWithTimeout('/api/admin/activity', {}, 15000);
    if (!res.ok) await fail(res, 'Failed to fetch activity logs');
    return await res.json();
  },

  saveRolePermissions: async (permissions: any[], userId?: string, userName?: string) => {
    const res = await fetchWithTimeout('/api/admin/role-permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions, userId, userName }),
    }, 10000);
    if (!res.ok) await fail(res, 'Failed to save role permissions');
  }
};
