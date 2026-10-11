import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { Logo } from '../constants';
import { AnimatedBackground } from './AnimatedBackground';

/** Shown instead of the app when an administrator gave you a temporary password. */
export const ChangePassword: React.FC = () => {
  const { changePassword, logout, user } = useAuth();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (a.length < 10 || !/[A-Za-z]/.test(a) || !/\d/.test(a)) return setError('Use at least 10 characters, with letters and digits.');
    if (a !== b) return setError('The two passwords do not match.');
    setBusy(true);
    try { await changePassword(a); } catch (err: any) { setError(err.message || 'Could not change the password.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <AnimatedBackground />
      <form onSubmit={submit} className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-white/20 z-10 space-y-5">
        <div className="flex flex-col items-center"><Logo height="h-16" /></div>
        <h1 className="text-lg font-bold text-brand-black text-center">Choose your own password</h1>
        <p className="text-sm text-brand-gray text-center">{user?.email}<br />Your administrator set a temporary password. Pick a new one to continue.</p>
        <input type="password" autoComplete="new-password" className="input-field" placeholder="New password" value={a} onChange={(e) => setA(e.target.value)} required />
        <input type="password" autoComplete="new-password" className="input-field" placeholder="Repeat new password" value={b} onChange={(e) => setB(e.target.value)} required />
        {error && <p className="text-brand-red text-sm text-center">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3">{busy ? 'Saving...' : 'Save and continue'}</button>
        <button type="button" onClick={() => logout()} className="w-full text-sm text-brand-gray underline">Sign out</button>
      </form>
    </div>
  );
};
