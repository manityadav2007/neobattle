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
  // Platform commission takes the remaining balance to guarantee exact integer sum
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

export function validatePrizePool(
  entryFee: number,
  maxPlayers: number,
  prizePool: number,
  gameMode?: string,
  options?: { isPerKill?: boolean; booyahPrize?: number; perKillRate?: number }
): {
  valid: boolean;
  breakdown: CommissionBreakdown;
  message?: string;
} {
  const breakdown = calculateCommission(entryFee, maxPlayers, gameMode);

  if (options?.isPerKill) {
    const estimatedKills = Math.max(0, maxPlayers - 1);
    const bp = Number(options.booyahPrize) || 0;
    const pkr = Number(options.perKillRate) || 0;
    const calculatedTotal = Math.round(bp + (estimatedKills * pkr));
    if (calculatedTotal !== breakdown.maxPrizePool) {
      const diff = Math.abs(breakdown.maxPrizePool - calculatedTotal);
      const diffText = calculatedTotal < breakdown.maxPrizePool ? `₹${diff.toLocaleString('en-IN')} short` : `₹${diff.toLocaleString('en-IN')} over`;
      return {
        valid: false,
        breakdown,
        message: `Prize distribution must exactly equal Max Prize Pool: ₹${breakdown.maxPrizePool.toLocaleString('en-IN')} (currently ₹${calculatedTotal.toLocaleString('en-IN')} — ${diffText})`,
      };
    }
  } else if (prizePool > breakdown.maxPrizePool) {
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
