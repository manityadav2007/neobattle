export interface CommissionBreakdown {
  totalCollection: number;
  platformCommission: number;
  hostCommission: number;
  remainingPool: number;
  maxPrizePool: number;
}

const PLATFORM_RATE = 0.20; // 20% Platform share
const HOST_RATE = 0.08;     // 8% Host commission (28% total deduction)
const REMAINING_RATE = 1 - PLATFORM_RATE - HOST_RATE; // 0.72 (72% Max prize pool)

export function calculateCommission(entryFee: number, maxPlayers: number): CommissionBreakdown {
  const totalCollection = Math.round(entryFee * maxPlayers);
  const hostCommission = Math.round(totalCollection * HOST_RATE);
  const maxPrizePool = Math.round(totalCollection * REMAINING_RATE);
  const platformCommission = Math.max(0, totalCollection - hostCommission - maxPrizePool);
  const remainingPool = maxPrizePool;
  return { totalCollection, platformCommission, hostCommission, remainingPool, maxPrizePool };
}
