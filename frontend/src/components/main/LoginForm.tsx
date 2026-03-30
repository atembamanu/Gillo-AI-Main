import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

type Mode = 'login' | 'register';

export function LoginForm() {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-brand-dark/10 bg-brand-bg p-6 shadow-lg shadow-brand-dark/5 backdrop-blur">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-dark">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-medium text-brand-dark/70">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-brand-dark/15 bg-brand-bg px-3 py-2 text-sm text-brand-dark shadow-sm outline-none ring-0 transition focus:border-brand-primary focus:bg-white focus:ring-2 focus:ring-brand-primary/30"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-medium text-brand-dark/70">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-brand-dark/15 bg-brand-bg px-3 py-2 text-sm text-brand-dark shadow-sm outline-none ring-0 transition focus:border-brand-primary focus:bg-white focus:ring-2 focus:ring-brand-primary/30"
            required
            minLength={6}
          />
          {mode === 'register' && (
            <p className="mt-1 text-[11px] text-brand-dark/60">At least 6 characters</p>
          )}
        </div>
        {error && (
          <p className="rounded-2xl bg-brand-primary/10 px-3 py-2 text-xs text-brand-dark" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-2xl bg-brand-primary px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-primary/40 transition hover:bg-brand-primary/90 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : mode === 'login' ? 'Sign in to Gillo' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-brand-dark/70">
        {mode === 'login' ? (
          <>
            New to Gillo?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('register');
                clearError();
              }}
              className="font-medium text-brand-primary hover:text-brand-primary/80"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => {
                setMode('login');
                clearError();
              }}
              className="font-medium text-brand-primary hover:text-brand-primary/80"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
