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
    .replace(
      /\s+(?:deposited|credited|tap\s+to\s+view|via\s+upi|on\s+paytm|via\s+paytm|using\s+upi|on\s+super\.?money|\(?upi\s+ref|\(?ref|\(?utr|\(?rrn).*$/i,
      ''
    )
    .replace(/[.,;]+$/, '')
    .trim();

  if (
    candidate.length === 0 ||
    /^(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*[0-9]/i.test(candidate) ||
    /\b(?:your\s+account|your\s+bank|paytm\s+account|super\.?money)\b/i.test(candidate)
  ) {
    return null;
  }
  return candidate;
}

/**
 * Parses bank and UPI notification texts to extract credit amount, sender name, and UPI reference/UTR number.
 * Supports SuperMoney ("₹X received from NAME Deposited...", order-independent title & text),
 * Paytm ("Received ₹X from [Sender]", "Money received", etc.),
 * PhonePe ("[Name] has sent ₹X to your bank account"),
 * and standard Indian UPI bank SMS formats (PNB, SBI, HDFC, ICICI, Axis, Kotak).
 */
export function parseBankSms(message: string, sender?: string): ParsedSmsPayment {
  if (!message || typeof message !== 'string') {
    return { amount: null, utrNumber: null, rawMessage: message || '', sender: sender || null, isCredit: false };
  }

  // Bounded slice for ReDoS safety as established in CodeQL fixes
  const cleanMsg = (message.length > 500 ? message.slice(0, 500) : message).trim();
  const lower = cleanMsg.toLowerCase();

  // Credit / debit detection (supports SuperMoney, Paytm, PhonePe, and standard bank notifications)
  const isPhonePeCredit = /(?:has\s+sent|sent)\s+(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*[0-9]+(?:\.[0-9]{1,2})?\s+to\s+your\s+(?:bank\s+)?account/i.test(cleanMsg);
  const hasCreditWord = isPhonePeCredit || /\b(credited|received|deposited|credit|inward)\b/i.test(lower);
  const isDebit = !isPhonePeCredit && /\b(debited|sent|withdrawn|deducted|spent|paid)\b/i.test(lower) && !hasCreditWord;
  const isCredit = hasCreditWord && !isDebit;

  let amount: number | null = null;
  let resolvedSender: string | null = null;

  // 1. SuperMoney format: "₹X received from NAME" (order-independent, e.g. title first or text first, sender optional)
  // Example: "₹1.00 received from MANIT Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details"
  // Example: "Deposited in your PNB bank on 19 October at 05:18 AM. Tap to view details ₹1.00 received from MANIT"
  const superMoneyPattern =
    /(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)\s+received(?:\s+from\s+([^\r\n,;()]{1,60}?))?(?:\s+(?:deposited|credited|tap\s+to\s+view|via\s+upi|on\s+paytm|using\s+upi)\b|[,\r\n;()|]|\.?\s*$)/i;

  // 2. Paytm notification patterns (supports exact paise e.g. 1.02, 10.05, 500, etc.)
  const paytmReceivedPattern =
    /(?:(?:you\s+have|you've)\s+)?received\s+(?:(?:a\s+)?payment\s+of\s+)?(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)(?:\s+(?:on\s+paytm|in\s+your\s+(?:bank\s+|paytm\s+)?account))?(?:\s+(?:from|by)\s+([^\r\n,;()]{1,60}?))?(?:\s+(?:via\s+upi|on\s+paytm|using\s+upi)|\(|$|[\r\n,.])/i;

  const paytmMoneyReceivedPattern =
    /(?:money\s+received|payment\s+received)\s*[:\-]?\s*(?:of\s+)?(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)(?:\s+(?:on\s+paytm|in\s+your\s+(?:bank\s+|paytm\s+)?account))?(?:\s+(?:from|by)\s+([^\r\n,;()]{1,60}?))?(?:\s+(?:via\s+upi|on\s+paytm|using\s+upi)|\(|$|[\r\n,.])/i;

  // 3. PhonePe notification pattern: "[Name] has sent ₹[amount] to your bank account"
  const phonePePattern =
    /(?:^|[\r\n])\s*(?:(?!(?:has\s+sent|sent)\b)([^\r\n,;()]{1,60}?)\s+)?(?:has\s+sent|sent)\s+(?:INR|Rs\.?|Re\.?|[₹\u20B9])\s*([0-9]+(?:,[0-9]+)*(?:\.[0-9]{1,2})?)\s+to\s+your\s+(?:bank\s+)?account/i;

  const superMoneyMatch = cleanMsg.match(superMoneyPattern);
  const paytmMatch = !superMoneyMatch && (cleanMsg.match(paytmReceivedPattern) || cleanMsg.match(paytmMoneyReceivedPattern));
  const phonePeMatch = !superMoneyMatch && !paytmMatch && cleanMsg.match(phonePePattern);

  if (superMoneyMatch && superMoneyMatch[1]) {
    const rawAmt = superMoneyMatch[1].replace(/,/g, '');
    const parsed = parseFloat(rawAmt);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100) / 100;
    }
    if (superMoneyMatch[2]) {
      const candidate = cleanSenderName(superMoneyMatch[2]);
      if (candidate) {
        resolvedSender = candidate;
      }
    }
  } else if (paytmMatch && paytmMatch[1]) {
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
  } else if (phonePeMatch && phonePeMatch[2]) {
    const rawAmt = phonePeMatch[2].replace(/,/g, '');
    const parsed = parseFloat(rawAmt);
    if (!isNaN(parsed) && parsed > 0) {
      amount = Math.round(parsed * 100) / 100;
    }
    if (phonePeMatch[1]) {
      const candidate = cleanSenderName(phonePeMatch[1]);
      if (candidate) {
        resolvedSender = candidate;
      }
    }
  }

  // 4. Fallback / standard bank SMS patterns for Amount Extraction
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

  // 5. Fallback sender extraction from message text (e.g. "... from [Sender Name] ...")
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

  // 6. If no sender found in text, use provided sender parameter
  if (!resolvedSender && sender && typeof sender === 'string') {
    const trimmed = sender.trim();
    if (trimmed.length > 0) {
      resolvedSender = trimmed;
    }
  }

  // 7. Patterns for UTR / UPI Reference Extraction (usually 12 digits)
  // SuperMoney and simple notifications typically do not include a UTR
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
