export interface ParsedSmsPayment {
  amount: number | null;
  utrNumber: string | null;
  rawMessage: string;
  sender: string | null;
  isCredit: boolean;
}

/**
 * Sanitizes and validates an extracted sender name, removing trailing metadata like UPI / Ref tags.
 */
function cleanSenderName(raw: string): string | null {
  const candidate = raw
    .trim()
    .replace(/\s+(?:via\s+upi|on\s+paytm|via\s+paytm|using\s+upi|\(?upi\s+ref|\(?ref|\(?utr|\(?rrn).*$/i, '')
    .replace(/[.,;]+$/, '')
    .trim();

  if (
    candidate.length === 0 ||
    /^(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*[0-9]/i.test(candidate) ||
    /\b(?:your\s+account|your\s+bank|paytm\s+account)\b/i.test(candidate)
  ) {
    return null;
  }
  return candidate;
}

/**
 * Parses bank and UPI notification texts to extract credit amount, sender name, and UPI reference/UTR number.
 * Supports Paytm notifications ("Received ₹X from [Sender]", "Money received", etc.),
 * Paytm Payments Bank, SBI, HDFC, ICICI, Axis, Kotak, PNB, and standard Indian UPI bank SMS formats.
 */
export function parseBankSms(message: string, sender?: string): ParsedSmsPayment {
  if (!message || typeof message !== 'string') {
    return { amount: null, utrNumber: null, rawMessage: message || '', sender: sender || null, isCredit: false };
  }

  // Bounded slice for ReDoS safety as established in CodeQL fixes
  const cleanMsg = (message.length > 500 ? message.slice(0, 500) : message).trim();
  const lower = cleanMsg.toLowerCase();

  // Credit / debit detection
  const hasCreditWord = /\b(credited|received|deposited|credit|inward)\b/i.test(lower);
  const isDebit = /\b(debited|sent|withdrawn|deducted|spent|paid)\b/i.test(lower) && !hasCreditWord;
  const isCredit = hasCreditWord && !isDebit;

  let amount: number | null = null;
  let resolvedSender: string | null = null;

  // 1. Paytm notification patterns (supports exact paise e.g. 1.02, 10.05, 500, etc.)
  // Primary Paytm format: "Received ₹10.05 from Rahul Sharma", "You have received ₹1.02 from John", etc.
  const paytmReceivedPattern =
    /(?:(?:you\s+have|you've)\s+)?received\s+(?:(?:a\s+)?payment\s+of\s+)?(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)(?:\s+(?:on\s+paytm|in\s+your\s+(?:bank\s+|paytm\s+)?account))?(?:\s+(?:from|by)\s+([^\r\n,;()]{1,60}?))?(?:\s+(?:via\s+upi|on\s+paytm|using\s+upi)|\(|$|[\r\n,.])/i;

  // Format 2: "Money received: ₹10.05 from Rahul Sharma" / "Payment received: ₹1.02 from John"
  const paytmMoneyReceivedPattern =
    /(?:money\s+received|payment\s+received)\s*[:\-]?\s*(?:of\s+)?(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)(?:\s+(?:on\s+paytm|in\s+your\s+(?:bank\s+|paytm\s+)?account))?(?:\s+(?:from|by)\s+([^\r\n,;()]{1,60}?))?(?:\s+(?:via\s+upi|on\s+paytm|using\s+upi)|\(|$|[\r\n,.])/i;

  // Format 3: "₹10.05 received from Rahul Sharma" / "Payment of ₹10.05 received from Rahul Sharma"
  const paytmAmountFirstPattern =
    /(?:(?:payment\s+of\s+)?(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?))\s+received(?:\s+successfully)?(?:\s+(?:on\s+paytm|in\s+your\s+(?:bank\s+|paytm\s+)?account))?(?:\s+(?:from|by)\s+([^\r\n,;()]{1,60}?))?(?:\s+(?:via\s+upi|on\s+paytm|using\s+upi)|\(|$|[\r\n,.])/i;

  const paytmMatch =
    cleanMsg.match(paytmReceivedPattern) ||
    cleanMsg.match(paytmMoneyReceivedPattern) ||
    cleanMsg.match(paytmAmountFirstPattern);

  if (paytmMatch && paytmMatch[1]) {
    const rawAmt = paytmMatch[1].replace(/,/g, '');
    const parsed = parseFloat(rawAmt);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100) / 100;
    }
    if (paytmMatch[2]) {
      const candidate = cleanSenderName(paytmMatch[2]);
      if (candidate) {
        resolvedSender = candidate;
      }
    }
  }

  // 2. Fallback / standard bank SMS patterns for Amount Extraction
  if (amount === null && isCredit) {
    const amountPatterns: RegExp[] = [
      // "credited by/with/for INR 50.05" or "received Rs 50.05"
      /(?:credited\s+(?:by|with|for|to)?|received(?:\s+a\s+payment\s+of)?|deposited)\s*(?:INR|Rs\.?|Re\.?|[₹\u20B9])?\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
      // "INR 50.05 credited/received" or "Rs. 50.05 has been credited"
      /(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)\s+(?:is|has\s+been)?\s*(?:credited|deposited|received)/i,
      // "A/c ... credited with Rs.50.05"
      /(?:credited|received|deposited)[^0-9\r\n]{1,40}(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
      // "(INR|Rs|₹) 50.05 ... credited"
      /(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)[^0-9\r\n]{1,40}(?:credited|received|deposited)/i,
      // Fallback: Any currency with number in a confirmed credit message
      /(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = cleanMsg.match(pattern);
      if (match && match[1]) {
        const rawAmt = match[1].replace(/,/g, '');
        const parsed = parseFloat(rawAmt);
        if (!isNaN(parsed) && parsed > 0) {
          amount = Math.round(parsed * 100) / 100;
          break;
        }
      }
    }
  }

  // 3. Fallback sender extraction from message text (e.g. "... from [Sender Name] ...")
  if (!resolvedSender) {
    const senderMatch = cleanMsg.match(
      /\b(?:transfer\s+from|received\s+from|from)\s+([A-Za-z0-9@._\s]{2,50}?)(?:\s+(?:via|on\s+paytm|in\s+your|using|\(UPI|\bUPI\b)\b|[.,;()|\r\n]|$)/i
    );
    if (senderMatch && senderMatch[1]) {
      const candidate = cleanSenderName(senderMatch[1]);
      if (candidate) {
        resolvedSender = candidate;
      }
    }
  }

  // 4. If no sender found in text, use provided sender parameter
  if (!resolvedSender && sender && typeof sender === 'string') {
    const trimmed = sender.trim();
    if (trimmed.length > 0) {
      resolvedSender = trimmed;
    }
  }

  // 5. Patterns for UTR / UPI Reference Extraction (usually 12 digits)
  let utrNumber: string | null = null;
  const utrPatterns: RegExp[] = [
    /(?:UPI(?:\s+Ref(?:\s+no)?)?|UTR(?:\s+no)?|Ref(?:\s+no)?|RRN)[:/=\s-]+([0-9]{12})\b/i,
    /(?:UPI\/|Ref\/|RRN\/)([0-9]{12})\b/i,
    /\b(UPI[A-Za-z0-9]{10,20})\b/i,
    /\b([0-9]{12})\b/,
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
    sender: resolvedSender,
    isCredit,
  };
}
