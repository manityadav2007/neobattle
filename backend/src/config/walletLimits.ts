export interface WalletLimits {
  minDeposit: number;
  maxDeposit: number;
  minWithdrawal: number;
  maxWithdrawal: number;
  maxDailyWithdrawalPerUser: number;
}

export function getWalletLimits(): WalletLimits {
  const minDeposit = process.env.MIN_DEPOSIT ? parseFloat(process.env.MIN_DEPOSIT) : 10;
  const maxDeposit = process.env.MAX_DEPOSIT ? parseFloat(process.env.MAX_DEPOSIT) : 10000;
  const minWithdrawal = process.env.MIN_WITHDRAWAL ? parseFloat(process.env.MIN_WITHDRAWAL) : 100;
  const maxWithdrawal = process.env.MAX_WITHDRAWAL ? parseFloat(process.env.MAX_WITHDRAWAL) : 5000;
  const maxDailyWithdrawalPerUser = process.env.MAX_DAILY_WITHDRAWAL_PER_USER
    ? parseFloat(process.env.MAX_DAILY_WITHDRAWAL_PER_USER)
    : 5000;

  return {
    minDeposit: isNaN(minDeposit) ? 10 : minDeposit,
    maxDeposit: isNaN(maxDeposit) ? 10000 : maxDeposit,
    minWithdrawal: isNaN(minWithdrawal) ? 100 : minWithdrawal,
    maxWithdrawal: isNaN(maxWithdrawal) ? 5000 : maxWithdrawal,
    maxDailyWithdrawalPerUser: isNaN(maxDailyWithdrawalPerUser) ? 5000 : maxDailyWithdrawalPerUser,
  };
}

/**
 * Validates that an amount is a positive number with at most 2 decimal places.
 */
export function validateAmount(amount: any): { valid: boolean; isValid: boolean; value: number; message?: string; error?: string } {
  if (amount === undefined || amount === null || amount === '') {
    return { valid: false, isValid: false, value: 0, message: 'Amount is required', error: 'Amount is required' };
  }

  const num = typeof amount === 'number' ? amount : parseFloat(String(amount));
  if (isNaN(num) || !isFinite(num) || num <= 0) {
    return { valid: false, isValid: false, value: 0, message: 'Amount must be a positive number' };
  }

  // Validate at most 2 decimal places
  const str = String(amount).trim();
  const parts = str.split('.');
  if (parts.length > 2 || (parts.length === 2 && parts[1].length > 2)) {
    const msg = 'Amount must have at most 2 decimal places';
    return { valid: false, isValid: false, value: num, message: msg, error: msg };
  }

  return { valid: true, isValid: true, value: Number(num.toFixed(2)) };
}
