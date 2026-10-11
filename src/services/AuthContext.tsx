import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, RolePermissions } from '../types';
import { supabase } from '../lib/supabase';
import { wipeCrmCache } from '../lib/storageGuard';
import { fetchWithTimeout } from '../lib/fetchUtils';

interface AuthContextType {
  user: User | null;
  permissions: RolePermissions | null;
  mustChangePassword: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  isLoading: boolean;
  refreshPermissions: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<RolePermissions | null>(null);
  const [mustChangePassword, setMustChange] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // who am I, and what may I do? (decided by the server from my login)
  const loadMe = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetchWithTimeout('/api/me', {}, 15000);
      if (!res.ok) return false;
      const data = await res.json();
      setUser(data.user);
      setPermissions(data.permissions);
      setMustChange(!!data.user?.mustChangePassword);
      return true;
    } catch {
      return false;
    }
  }, []);

  const clear = useCallback(() => {
    setUser(null);
    setPermissions(null);
    setMustChange(false);
    wipeCrmCache();
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error('Invalid credentials');
    if (!(await loadMe())) {
      await supabase.auth.signOut();
      throw new Error('This account has no access');
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    clear();
  };

  const changePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message || 'Could not change the password');
    await fetchWithTimeout('/api/me/password-changed', { method: 'POST' }, 15000);
    setMustChange(false);
  };

  const refreshPermissions = async () => { await loadMe(); };

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const ok = await loadMe();
        if (!ok && alive) { await supabase.auth.signOut(); clear(); }
      }
      if (alive) setIsLoading(false);
    })();
    const onExpired = () => { supabase.auth.signOut().finally(clear); };
    window.addEventListener('sdm-session-expired', onExpired);
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clear();
    });
    return () => { alive = false; window.removeEventListener('sdm-session-expired', onExpired); sub.subscription.unsubscribe(); };
  }, [loadMe, clear]);

  return (
    <AuthContext.Provider value={{ user, permissions, mustChangePassword, login, logout, changePassword, isLoading, refreshPermissions }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
