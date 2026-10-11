import { SystemSettings } from '../types';

export const settingsService = {
  async getSettings(): Promise<SystemSettings> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort('Request timed out');
      } catch (e) {
        controller.abort();
      }
    }, 15000); // Increased to 15s timeout
    try {
      const response = await fetch('/api/settings', { signal: controller.signal });
      if (!response.ok) throw new Error(`Failed to fetch settings: ${response.status} ${response.statusText}`);
      return await response.json();
    } catch (err: any) {
      console.warn('Detailed settings fetch error:', err);
      if (err.name === 'AbortError') {
        throw new Error('Theme settings request timed out after 15s');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async updateSettings(settings: SystemSettings, userId?: string, userName?: string): Promise<void> {
    const response = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings, userId, userName })
    });
    if (!response.ok) throw new Error('Failed to update settings');
  }
};
