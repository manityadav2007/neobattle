import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

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
// Rate Limit Key Generator: Key by User ID if authenticated, fallback to IP
// ---------------------------------------------------------------------------
export function getApiRateLimitKey(req: any): string {
  // 1. Attached by authMiddleware / optionalAuth
  if (req.user?.id) {
    return `user_${req.user.id}`;
  }

  // 2. Decode Bearer token safely if header present
  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7).trim();
      const decoded: any = jwt.decode(token);
      const uid = decoded?.id || decoded?.sub || decoded?.userId;
      if (uid) {
        return `user_${uid}`;
      }
    } catch {
      // Ignore token decode errors, fall back to IP
    }
  }

  // 3. Fallback to client IP address
  const rawIp = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip_${rawIp}`;
}

// ---------------------------------------------------------------------------
// API limiter — applied to /api/* routes
// Authenticated users get 240 requests/min (never exhausted by normal navigation)
// Unauthenticated requests get 60 requests/min
// ---------------------------------------------------------------------------
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1-minute sliding window
  max: (req: any) => {
    // Generous limit for authenticated users & admins navigating the platform
    if (req.user?.id) return 240;
    const authHeader = req.headers?.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return 240;
    }
    return 60;
  },
  keyGenerator: getApiRateLimitKey,
  standardHeaders: 'draft-7',    // emit RFC-standard RateLimit-* headers
  legacyHeaders: false,
  handler: buildHandler(
    'Too many requests to the API. Please wait a moment before trying again.',
  ),
});

// ---------------------------------------------------------------------------
// Global catch-all limiter — applied to every route (generous baseline)
// ---------------------------------------------------------------------------
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,      // 15-minute window
  max: 2000,
  keyGenerator: getApiRateLimitKey,
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
// Webhook routes limiter — protect SMS & payment ingest endpoints
// ---------------------------------------------------------------------------
export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1-minute window
  max: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many webhook submissions. Please wait a moment before sending another request.',
  ),
});

// ---------------------------------------------------------------------------
// Wallet routes limiter — prevent rapid financial operation abuse
// ---------------------------------------------------------------------------
export const walletLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,      // 1-hour window
  max: 100,
  keyGenerator: getApiRateLimitKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many wallet operations. Please wait before attempting more transactions.',
  ),
});

// ---------------------------------------------------------------------------
// Tournament routes limiter
// ---------------------------------------------------------------------------
export const tournamentLimiter = rateLimit({
  windowMs: 60 * 1000,           // 1-minute window
  max: 60,
  keyGenerator: getApiRateLimitKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: buildHandler(
    'Too many tournament requests. Please wait a moment before continuing.',
  ),
});
