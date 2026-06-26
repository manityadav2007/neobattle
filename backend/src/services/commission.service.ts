export interface CommissionBreakdown {
  totalCollection: number;
  platformCommission: number;
  hostCommission: number;
  remainingPool: number;
  maxPrizePool: number;
}

const PLATFORM_RATE = 0.28;
const HOST_RATE = 0.20;
const REMAINING_RATE = 1 - PLATFORM_RATE - HOST_RATE; // 0.52

export function calculateCommission(entryFee: number, maxPlayers: number): CommissionBreakdown {
  const totalCollection = entryFee * maxPlayers;
  const platformCommission = Math.round(totalCollection * PLATFORM_RATE * 100) / 100;
  const hostCommission = Math.round(totalCollection * HOST_RATE * 100) / 100;
  const remainingPool = Math.round(totalCollection * REMAINING_RATE * 100) / 100;
  const maxPrizePool = remainingPool;

  return {
    totalCollection,
    platformCommission,
    hostCommission,
    remainingPool,
    maxPrizePool,
  };
}

export function validatePrizePool(entryFee: number, maxPlayers: number, prizePool: number): {
  valid: boolean;
  breakdown: CommissionBreakdown;
  message?: string;
} {
  const breakdown = calculateCommission(entryFee, maxPlayers);

  if (prizePool > breakdown.maxPrizePool) {
    return {
      valid: false,
      breakdown,
      message: `Insufficient funds! Prize pool ($${prizePool.toFixed(2)}) exceeds available budget ($${breakdown.maxPrizePool.toFixed(2)}). Max allowed: $${breakdown.maxPrizePool.toFixed(2)}`,
    };
  }

  return { valid: true, breakdown };
}
