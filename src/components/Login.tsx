import React, { useState } from 'react';
import { useAuth } from '../services/AuthContext';
import { Logo } from '../constants';
import { motion } from 'motion/react';
import { AnimatedBackground } from './AnimatedBackground';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError('Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <AnimatedBackground />
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-white/20 z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <Logo src="https://elsewedydevelopment.com/wp-content/uploads/2023/06/SDM-Logo-web.png" height="h-20" />
          <h1 className="text-sm font-bold mt-2 text-brand-black tracking-widest uppercase">SDM Sales Leads</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-brand-black mb-1">Email Address</label>
            <input
              type="email"
              required
              className="input-field"
              placeholder="name@company.com" autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-black mb-1">Password</label>
            <input
              type="password"
              required
              className="input-field"
              placeholder="••••••••" autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-brand-red text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="btn-primary w-full py-3 text-lg"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

      </motion.div>
    </div>
  );
};
