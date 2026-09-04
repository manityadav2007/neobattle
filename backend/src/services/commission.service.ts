export interface CommissionBreakdown {
  totalCollection: number;
  platformCommission: number;
  hostCommission: number;
  remainingPool: number;
  maxPrizePool: number;
}

const PLATFORM_RATE = 0.16; // 16% Platform share
const HOST_RATE = 0.04;     // 4% Host commission (20% total deduction)
const REMAINING_RATE = 1 - PLATFORM_RATE - HOST_RATE; // 0.80 (80% Max prize pool)

export function calculateCommission(entryFee: number, maxPlayers: number): CommissionBreakdown {
  const totalCollection = Math.round(entryFee * maxPlayers);
  const hostCommission = Math.round(totalCollection * HOST_RATE);
  const maxPrizePool = Math.round(totalCollection * REMAINING_RATE);
  // Platform commission takes the remaining balance to guarantee exact integer sum
  const platformCommission = Math.max(0, totalCollection - hostCommission - maxPrizePool);
  const remainingPool = maxPrizePool;

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
    const fmtINR = (n: number) =>
      `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return {
      valid: false,
      breakdown,
      message: `Insufficient funds! Prize pool (${fmtINR(prizePool)}) exceeds available budget (${fmtINR(breakdown.maxPrizePool)}) collected from entry fees. Max allowed: ${fmtINR(breakdown.maxPrizePool)}`,
    };
  }

  return { valid: true, breakdown };
}
