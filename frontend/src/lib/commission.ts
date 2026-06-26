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
  const totalCollection = entryFee * maxPlayers;
  const platformCommission = Math.round(totalCollection * PLATFORM_RATE * 100) / 100;
  const hostCommission = Math.round(totalCollection * HOST_RATE * 100) / 100;
  const remainingPool = Math.round(totalCollection * REMAINING_RATE * 100) / 100;
  return { totalCollection, platformCommission, hostCommission, remainingPool, maxPrizePool: remainingPool };
}
