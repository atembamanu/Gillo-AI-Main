import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { clearToken, getToken } from '../api/client';
import * as authApi from '../api/auth';
import type { User } from '../api/auth';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  updateProfile: (data: { display_name?: string | null; timezone?: string }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: u } = await authApi.me();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    const onExpired = () => {
      clearToken();
      setUser(null);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const { user: u } = await authApi.login(email, password);
        setUser(u);
      } catch (e: any) {
        setError(e?.message ?? e?.body?.error ?? 'Login failed');
        throw e;
      }
    },
    []
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setError(null);
      try {
        const { user: u } = await authApi.register(email, password);
        setUser(u);
      } catch (e: any) {
        setError(e?.message ?? e?.body?.error ?? 'Registration failed');
        throw e;
      }
    },
    []
  );

  const logout = useCallback(() => {
    authApi.logout();
    setUser(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const updateProfile = useCallback(async (data: { display_name?: string | null; timezone?: string }) => {
    try {
      const { user: u } = await authApi.updateProfile(data);
      setUser(u);
    } catch (e: any) {
      setError(e?.message ?? e?.body?.error ?? 'Failed to update profile');
      throw e;
    }
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
