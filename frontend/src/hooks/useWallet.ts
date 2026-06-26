'use client';

import { useState, useEffect, useCallback } from 'react';
import { walletApi, WalletData } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

export function useWallet() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchWallet = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await walletApi.get();
      setWallet(res.data || null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  const deposit = async (amount: number) => {
    setActionLoading(true);
    try {
      await walletApi.deposit(amount);
      await fetchWallet();
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const withdraw = async (amount: number) => {
    setActionLoading(true);
    try {
      await walletApi.withdraw(amount);
      await fetchWallet();
      return true;
    } catch (err) {
      setError(getErrorMessage(err));
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  return { wallet, loading, error, actionLoading, deposit, withdraw, refetch: fetchWallet };
}
