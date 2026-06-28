'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { authApi, User } from '@/lib/services';
import { clearAuthTokens, isAuthenticated } from '@/lib/api';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    if (!isAuthenticated()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const res = await authApi.me();
      setUser(res.data || null);
      setError(null);
    } catch {
      setUser(null);
      clearAuthTokens();
      setError('Session expired');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      document.cookie = `userRole=${user.role}; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `userEmail=${user.email}; path=/; max-age=86400; SameSite=Lax`;
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
    } catch {
      setUser(null);
      clearAuthTokens();
    }
  }, []);

  useEffect(() => {
    fetchUser();

    const handleTokensChanged = () => {
      if (isAuthenticated()) {
        fetchUser();
      }
    };
    window.addEventListener('auth:tokens-changed', handleTokensChanged);
    return () => window.removeEventListener('auth:tokens-changed', handleTokensChanged);
  }, [fetchUser]);

  const logout = async () => {
    await authApi.logout();
    setUser(null);
    window.location.href = '/login';
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
