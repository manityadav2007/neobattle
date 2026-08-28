'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import axios from 'axios';
import { authApi, User } from '@/lib/services';
import {
  clearAuthTokens,
  isAuthenticated,
  SESSION_EXPIRED_EVENT,
} from '@/lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: User | null) => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isHost: boolean;
  canAccessWallet: boolean;
  isOwner: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function isAuthError(err: unknown): boolean {
  return axios.isAxiosError(err) && err.response?.status === 401;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async (isSilent = false) => {
    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      setError(null);
      return;
    }
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const res = await authApi.me();
      setUser(res.data || null);
      setError(null);
    } catch (err) {
      if (isAuthError(err)) {
        setUser(null);
        clearAuthTokens();
        setError('Session expired. Please log in again.');
      } else if (axios.isAxiosError(err) && err.response?.status === 429) {
        // Rate limited — keep session intact, do not drop user
        setError('The server is temporarily busy (rate limit). Your session is saved — please wait a moment and retry.');
      } else {
        let recovered = false;
        for (let attempt = 0; attempt < MAX_RETRIES && !recovered; attempt++) {
          await wait(RETRY_DELAY_MS * (attempt + 1));
          try {
            const res = await authApi.me();
            setUser(res.data || null);
            setError(null);
            recovered = true;
          } catch {
            /* keep retrying with backoff */
          }
        }
        if (!recovered) {
          setError('Cannot reach the server. Your session is saved — press Retry once the connection returns.');
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      document.cookie = `userRole=${user.role}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `userEmail=${user.email}; path=/; max-age=2592000; SameSite=Lax`;
    } else {
      document.cookie = 'userRole=; path=/; max-age=0';
      document.cookie = 'userEmail=; path=/; max-age=0';
    }
  }, [user]);

  const refreshUser = useCallback(async () => {
    if (!isAuthenticated()) return;
    try {
      const res = await authApi.me();
      setUser(res.data || null);
    } catch (err) {
      if (isAuthError(err)) {
        setUser(null);
        clearAuthTokens();
      }
    }
  }, []);

  useEffect(() => {
    fetchUser();

    const handleTokensChanged = () => {
      if (isAuthenticated()) {
        fetchUser();
      }
    };
    const handleSessionExpired = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('auth:tokens-changed', handleTokensChanged);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => {
      window.removeEventListener('auth:tokens-changed', handleTokensChanged);
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    };
  }, [fetchUser]);

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* local logout must always succeed */
    } finally {
      setUser(null);
      window.location.href = '/login';
    }
  };

  const ownerEmail = 'ymanit330@gmail.com';
  const isOwner = user?.email === ownerEmail;
  const isSuperAdmin = user?.role === 'SUPER_ADMIN' || isOwner;
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MODERATOR' || isSuperAdmin;
  const isHost = user?.role === 'HOST';
  const canAccessWallet = !!user && !isHost;

  return (
    <AuthContext.Provider value={{ user, loading, error, refetch: fetchUser, refreshUser, logout, setUser, isAdmin, isSuperAdmin, isHost, canAccessWallet, isOwner }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
