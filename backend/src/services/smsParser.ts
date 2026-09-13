export interface ParsedSmsPayment {
  amount: number | null;
  utrNumber: string | null;
  rawMessage: string;
  sender: string | null;
  isCredit: boolean;
}

/**
 * Parses bank and UPI notification texts to extract credit amount and UPI reference/UTR number.
 * Supports PhonePe notifications, PNB, SBI, HDFC, ICICI, Axis, Kotak, Paytm, and standard Indian UPI bank SMS formats.
 */
export function parseBankSms(message: string, sender?: string): ParsedSmsPayment {
  if (!message || typeof message !== 'string') {
    return { amount: null, utrNumber: null, rawMessage: message || '', sender: sender || null, isCredit: false };
  }

  const cleanMsg = message.trim();
  const lower = cleanMsg.toLowerCase();

  // 1. Check for PhonePe notification format: "[Name] has sent ₹[amount] to your [bank] account..."
  const phonePePattern = /(?:^|[\n\r])\s*(?:(.+?)\s+)?(?:has\s+sent|sent)\s+(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)\s+to\s+your\s+(?:bank\s+)?account/i;
  const phonePeMatch = cleanMsg.match(phonePePattern);
  const isPhonePeCredit = Boolean(phonePeMatch);

  // Bank SMS style credit / debit detection
  const hasCreditWord = /\b(credited|received|deposited|credit|inward)\b/i.test(lower);
  const isDebit = !isPhonePeCredit && /\b(debited|sent|withdrawn|deducted|spent|paid)\b/i.test(lower) && !hasCreditWord;
  const isCredit = isPhonePeCredit || (hasCreditWord && !isDebit);

  let amount: number | null = null;
  let resolvedSender = sender ? sender.trim() : null;

  // If matched via PhonePe pattern, extract amount and sender directly
  if (phonePeMatch && phonePeMatch[2]) {
    const parsed = parseFloat(phonePeMatch[2]);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100) / 100;
    }
    if (!resolvedSender && phonePeMatch[1]) {
      resolvedSender = phonePeMatch[1].trim();
    }
  }

  // Fallback / standard bank SMS patterns for Amount Extraction
  if (amount === null) {
    const amountPatterns: RegExp[] = [
      // PhonePe notification: "[Name] has sent ₹[amount] to your bank account"
      /(?:has\s+sent|sent)\s*(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)\s*to\s*your\s*(?:bank\s*)?account/i,
      // Generic "has sent ₹50.05"
      /(?:has\s+sent|sent)\s*(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
      // "credited by/with/for INR 50.05" or "received Rs 50.05"
      /(?:credited\s*(?:by|with|for|to)?|received(?:\s*a\s*payment\s*of)?|deposited)\s*(?:INR|Rs\.?|[₹\u20B9])?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
      // "INR 50.05 credited/received" or "Rs. 50.05 has been credited"
      /(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:is|has\s*been)?\s*(?:credited|deposited|received)/i,
      // "A/c ... credited with Rs.50.05"
      /(?:credited|received|deposited)[^0-9\n\r]*(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
      // "(INR|Rs|₹) 50.05 ... credited"
      /(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)[^0-9\n\r]*(?:credited|received|deposited)/i,
      // Fallback: Any currency with number in a confirmed credit message
      /(?:INR|Rs\.?|[₹\u20B9])\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = cleanMsg.match(pattern);
      if (match && match[1]) {
        const parsed = parseFloat(match[1]);
        if (!isNaN(parsed) && parsed > 0) {
          amount = Math.round(parsed * 100) / 100;
          break;
        }
      }
    }
  }

  // Patterns for UTR / UPI Reference Extraction (usually 12 digits)
  let utrNumber: string | null = null;
  const utrPatterns: RegExp[] = [
    /(?:UPI(?:\s*Ref(?:\s*no)?)?|UTR(?:\s*no)?|Ref(?:\s*no)?|RRN)\s*[:/=\s-]*([0-9]{12})\b/i,
    /(?:UPI\/|Ref\/|RRN\/)([0-9]{12})\b/i,
    /\b(UPI[A-Za-z0-9]{10,20})\b/i,
  ];

  // For non-PhonePe messages, allow standalone 12-digit number as fallback
  if (!isPhonePeCredit) {
    utrPatterns.push(/\b([0-9]{12})\b/);
  }

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
    sender: resolvedSender,
    isCredit,
  };
}
