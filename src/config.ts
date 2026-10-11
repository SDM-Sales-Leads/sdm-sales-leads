// Public connection settings. The publishable key is meant to be public: on its own it can read nothing,
// every table is locked and all data goes through the signed-in API function.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://iyubegbevtjcvtuubpaq.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_v6VIPbDGboHozFG1SJQeug_rxBFs3df';
export const API_BASE = `${SUPABASE_URL}/functions/v1/api`;
