import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Helper: build a consistent rate-limit exceeded JSON response
// ---------------------------------------------------------------------------
function buildHandler(friendlyMessage: string) {
  return (_req: Request, res: Response): void => {
    const retryAfter = Math.ceil(
      Number(res.getHeader('Retry-After') ?? 60),
    );
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: friendlyMessage,
      retryAfter,
      hint: `Please wait ${retryAfter} second(s) before sending another request.`,
    });
  };
}

// ---------------------------------------------------------------------------
// Strict API limiter — applied to ALL /api/* routes
// 30 requests per minute per IP (protects Render free-tier from DoS / script abuse)
// ---------------------------------------------------------------------------
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1-minute sliding window
  max: 30,                        // max 30 requests per window per IP
  standardHeaders: 'draft-7',    // emit RFC-standard RateLimit-* headers
  legacyHeaders: false,
  handler: buildHandler(
    'Too many requests to the API. You are limited to 30 requests per minute per IP address.',
  ),
});

// ---------------------------------------------------------------------------
// Global catch-all limiter — applied to every route (generous baseline)
// ---------------------------------------------------------------------------
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15-minute window
  max: 2000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many requests from this IP. Please slow down and try again later.',
  ),
});

// ---------------------------------------------------------------------------
// Auth routes limiter — tighter to prevent brute-force / credential stuffing
// ---------------------------------------------------------------------------
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15-minute window
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many authentication attempts from this IP. Please wait 15 minutes before trying again.',
  ),
});

// ---------------------------------------------------------------------------
// Wallet routes limiter — prevent rapid financial operation abuse
// ---------------------------------------------------------------------------
export const walletLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,      // 1-hour window
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many wallet operations from this IP. Please wait before attempting more transactions.',
  ),
});

// ---------------------------------------------------------------------------
// Tournament routes limiter
// ---------------------------------------------------------------------------
export const tournamentLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1-minute window
  max: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many tournament requests. Please wait a moment before continuing.',
  ),
});
