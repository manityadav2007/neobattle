export interface ParsedSmsPayment {
  amount: number | null;
  utrNumber: string | null;
  rawMessage: string;
  sender: string | null;
  isCredit: boolean;
}

/**
 * Parses bank notification SMS text to extract credit amount and UPI reference/UTR number.
 * Supports PNB, SBI, HDFC, ICICI, Axis, Kotak, Paytm, and standard Indian UPI bank SMS formats.
 */
export function parseBankSms(message: string, sender?: string): ParsedSmsPayment {
  if (!message || typeof message !== 'string') {
    return { amount: null, utrNumber: null, rawMessage: message || '', sender: sender || null, isCredit: false };
  }

  const cleanMsg = message.trim();
  const lower = cleanMsg.toLowerCase();

  // Basic sanity check: verify it's a credit / received message, not a debit / sent message
  const isDebit = /\b(debited|sent|withdrawn|deducted|spent|paid)\b/i.test(lower) && !/\b(credited|received|deposited)\b/i.test(lower);
  const hasCreditWord = /\b(credited|received|deposited|credit|inward)\b/i.test(lower);
  const isCredit = hasCreditWord && !isDebit;

  let amount: number | null = null;

  // Patterns for Amount Extraction
  const amountPatterns: RegExp[] = [
    // Pattern 1: "credited by/with/for INR 50.05" or "received Rs 50.05"
    /(?:credited\s*(?:by|with|for|to)?|received(?:\s*a\s*payment\s*of)?|deposited)\s*(?:INR|Rs\.?|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    // Pattern 2: "INR 50.05 credited/received" or "Rs. 50.05 has been credited"
    /(?:INR|Rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:is|has\s*been)?\s*(?:credited|deposited|received)/i,
    // Pattern 3: "A/c ... credited with Rs.50.05"
    /(?:credited|received|deposited)[^0-9\n\r]*(?:INR|Rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    // Pattern 4: "(INR|Rs|₹) 50.05 ... credited"
    /(?:INR|Rs\.?|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)[^0-9\n\r]*(?:credited|received|deposited)/i,
    // Fallback: Any currency with exact decimal ".XX" in a credit message
    /(?:INR|Rs\.?|₹)\s*([0-9]+\.[0-9]{2})/i,
  ];

  for (const pattern of amountPatterns) {
    const match = cleanMsg.match(pattern);
    if (match && match[1]) {
      const parsed = parseFloat(match[1]);
      if (!isNaN(parsed) && parsed > 0) {
        amount = Math.round(parsed * 100) / 100; // normalize to 2 decimals
        break;
      }
    }
  }

  // Patterns for UTR / UPI Reference Extraction (usually 12 digits)
  let utrNumber: string | null = null;
  const utrPatterns: RegExp[] = [
    /(?:UPI(?:\s*Ref(?:\s*no)?)?|UTR(?:\s*no)?|Ref(?:\s*no)?|RRN)\s*[:/=\s-]*([0-9]{12})\b/i,
    /(?:UPI\/|Ref\/|RRN\/)([0-9]{12})\b/i,
    /\b(UPI[A-Za-z0-9]{10,20})\b/i,
    /\b([0-9]{12})\b/, // 12-digit number fallback in UPI SMS
  ];

  for (const pattern of utrPatterns) {
    const match = cleanMsg.match(pattern);
    if (match && match[1]) {
      utrNumber = match[1].trim();
      break;
    }
  }

  return {
    amount,
    utrNumber,
    rawMessage: cleanMsg,
    sender: sender ? sender.trim() : null,
    isCredit,
  };
}
