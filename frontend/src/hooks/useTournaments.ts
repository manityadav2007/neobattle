'use client';

import { useState, useEffect, useCallback } from 'react';
import { tournamentApi, Tournament } from '@/lib/services';
import { getErrorMessage } from '@/lib/api';

interface UseTournamentsOptions {
  status?: string;
  format?: string;
  platform?: string;
  gameMode?: string;
  autoFetch?: boolean;
}

export function useTournaments(options: UseTournamentsOptions = {}) {
  const { status, format, platform, gameMode, autoFetch = true } = options;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const fetchTournaments = useCallback(async (page = 1, overrides?: { status?: string; format?: string; platform?: string; gameMode?: string }) => {
    try {
      setLoading(true);
      setError(null);
      const res = await tournamentApi.list({
        page,
        status: overrides?.status ?? status,
        format: overrides?.format ?? format,
        platform: overrides?.platform ?? platform,
        gameMode: overrides?.gameMode ?? gameMode,
      });
      setTournaments(res.data || []);
      if (res.pagination) setPagination(res.pagination);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, format, platform, gameMode]);

  useEffect(() => {
    if (autoFetch) fetchTournaments();
  }, [autoFetch, fetchTournaments]);

  return { tournaments, loading, error, pagination, refetch: fetchTournaments };
}

export function useTournament(id: string) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    tournamentApi
      .get(id)
      .then((res) => setTournament(res.data || null))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  return { tournament, loading, error };
}
