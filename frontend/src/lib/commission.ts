export interface CommissionBreakdown {
  totalCollection: number;
  platformCommission: number;
  hostCommission: number;
  remainingPool: number;
  maxPrizePool: number;
}

const PLATFORM_RATE = 0.28;
const HOST_RATE = 0.20;
const REMAINING_RATE = 1 - PLATFORM_RATE - HOST_RATE;

export function calculateCommission(entryFee: number, maxPlayers: number): CommissionBreakdown {
  const totalCollection = Math.round(entryFee * maxPlayers);
  const hostCommission = Math.round(totalCollection * HOST_RATE);
  const maxPrizePool = Math.round(totalCollection * REMAINING_RATE);
  const platformCommission = Math.max(0, totalCollection - hostCommission - maxPrizePool);
  const remainingPool = maxPrizePool;
  return { totalCollection, platformCommission, hostCommission, remainingPool, maxPrizePool };
}
