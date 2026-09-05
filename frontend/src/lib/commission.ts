export interface CommissionBreakdown {
  totalCollection: number;
  platformCommission: number;
  hostCommission: number;
  remainingPool: number;
  maxPrizePool: number;
  platformRate: number;
  hostRate: number;
  prizePoolRate: number;
  totalDeductionRate: number;
}

export function getCommissionRates(gameMode?: string) {
  if (gameMode === 'CLASH_SQUAD') {
    // Clash Squad mode: 12% total deduction (8% platform, 4% host), 88% allocated to prize pool
    return {
      platformRate: 0.08,
      hostRate: 0.04,
      prizePoolRate: 0.88,
      totalDeductionRate: 0.12,
    };
  }

  // Battle Royale / Full Map: 28% total deduction (20% platform, 8% host), 72% allocated to prize pool
  return {
    platformRate: 0.20,
    hostRate: 0.08,
    prizePoolRate: 0.72,
    totalDeductionRate: 0.28,
  };
}

export function calculateCommission(
  entryFee: number,
  maxPlayers: number,
  gameMode?: string
): CommissionBreakdown {
  const rates = getCommissionRates(gameMode);
  const totalCollection = Math.round(entryFee * maxPlayers);
  const hostCommission = Math.round(totalCollection * rates.hostRate);
  const maxPrizePool = Math.round(totalCollection * rates.prizePoolRate);
  const platformCommission = Math.max(0, totalCollection - hostCommission - maxPrizePool);
  const remainingPool = maxPrizePool;
  return {
    totalCollection,
    platformCommission,
    hostCommission,
    remainingPool,
    maxPrizePool,
    platformRate: rates.platformRate,
    hostRate: rates.hostRate,
    prizePoolRate: rates.prizePoolRate,
    totalDeductionRate: rates.totalDeductionRate,
  };
}
