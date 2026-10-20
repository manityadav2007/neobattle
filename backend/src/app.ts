import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import hpp from 'hpp';
import passport from './config/passport';
import { connectDatabase, disconnectDatabase, prisma } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { globalLimiter, apiLimiter } from './middleware/rateLimiter';
import routes from './routes';
import fs from 'fs';
import { optionalAuth } from './middleware/authMiddleware';
import { startTournamentNotifier } from './jobs/tournament-notifier';
import { startTournamentCompleter } from './jobs/tournament-completer';
import { startDepositCleanupJob } from './jobs/deposit-cleanup';

import path from 'path';
import authRoutes from './routes/auth.routes';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

// Trust the first proxy hop — required for correct IP on Render
app.set('trust proxy', 1);

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// ── CORS — strict whitelist only ────────────────────────────────────────────
const configuredCors = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : [];
const defaultOrigins = [
  'https://neobattle.live',
  'https://www.neobattle.live',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...configuredCors]));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server / curl requests that send no Origin header
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Reject every other origin with a clear error
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
  })
);

// ── Body parsers — 10 kb cap to block large-payload attacks ────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── NoSQL injection sanitisation ───────────────────────────────────────────
app.use(mongoSanitize());

// ── HTTP Parameter Pollution prevention ────────────────────────────────────
app.use(hpp());

const uploadsDir = path.resolve(process.cwd(), 'uploads');
const killCounterDir = path.resolve(process.cwd(), 'uploads', 'kill-counter');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(killCounterDir)) fs.mkdirSync(killCounterDir, { recursive: true });

// ── Process-level crash prevention ───────────────────────────────────────────
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('[CRITICAL] Unhandled Promise Rejection at:', promise, 'reason:', reason?.message || reason);
  if (reason?.stack) {
    console.error(reason.stack);
  }
});

process.on('uncaughtException', (err: Error) => {
  console.error('[CRITICAL] Uncaught Exception:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
});

app.use('/uploads', express.static(uploadsDir));
app.use(globalLimiter);
app.use(passport.initialize());

// ── Health check with database readiness probe ──────────────────────────────
app.get(['/health', '/api/health'], async (_req: Request, res: Response) => {
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('DB ping timeout')), 3000)),
    ]);

    res.json({
      success: true,
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    });
  } catch (dbErr: any) {
    console.warn('[Health Check] Database probe failed:', dbErr?.message || dbErr);
    res.status(503).json({
      success: false,
      status: 'degraded',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
      message: 'Database connectivity degraded',
    });
  }
});

app.use('/api', optionalAuth, apiLimiter, routes);
app.use('/auth', authRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ── Central Error Handler: Sanitized, no SQL or internal paths leaked ───────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Central Error Handler]', {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    stack: process.env.NODE_ENV !== 'production' ? err?.stack : undefined,
  });

  // Prisma known errors (P2022 column does not exist, P2002 unique constraint, etc.)
  if (err?.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    res.status(500).json({
      success: false,
      message: 'A database error occurred. The operation could not be completed.',
    });
    return;
  }

  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  res.status(statusCode).json({
    success: false,
    message: statusCode < 500 ? (err.message || 'Request failed') : 'Internal server error',
  });
});

async function checkDatabaseSchema(): Promise<void> {
  try {
    const requiredChecks = [
      { table: 'DepositRequest', column: 'exactAmount' },
      { table: 'DepositRequest', column: 'baseAmount' },
      { table: 'DepositRequest', column: 'utrNumber' },
      { table: 'DepositRequest', column: 'depositTransactionId' },
    ];

    const results: any[] = await prisma.$queryRaw`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'DepositRequest';
    `;

    const existingColumns = new Set(results.map((r: any) => `${r.table_name}.${r.column_name}`));
    const missing: string[] = [];
    for (const req of requiredChecks) {
      if (!existingColumns.has(`${req.table}.${req.column}`)) {
        missing.push(`${req.table}.${req.column}`);
      }
    }

    if (missing.length > 0) {
      console.warn(
        `⚠️ [DATABASE WARNING] Missing expected columns in live database:\n` +
        missing.map((m) => `   - ${m}`).join('\n') +
        `\n   Please execute database migration to resolve schema drift.`
      );
    } else {
      console.log('✅ Database schema verified: core columns present.');
    }
  } catch (err: any) {
    console.warn('⚠️ [DATABASE WARNING] Could not verify database schema columns:', err?.message || err);
  }
}

async function startServer(): Promise<void> {
  await connectDatabase();
  await checkDatabaseSchema();
  await connectRedis();

  startTournamentNotifier();
  startTournamentCompleter();
  startDepositCleanupJob();

  app.listen(PORT, () => {
    console.log(`🔥 NEOBATTLE API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('\n📋 Registered routes:');
    function printRoutes(stack: any[], prefix: string): void {
      for (const layer of stack) {
        if (layer.route) {
          const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
          console.log(`   ${methods} ${prefix}${layer.route.path}`);
        } else if (layer.name === 'router' && layer.handle.stack) {
          let layerPath = layer.regexp.source
            .replace(/\\\//g, '/')
            .replace(/\^/g, '')
            .replace(/\/\?\(\?\=\/\|\$\)\/\?/g, '')
            .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param')
            .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param')
            .replace(/\\\$/g, '')
            .replace(/\/\?/g, '')
            .replace(/\?/g, '')
            .replace(/\/i$/g, '');
          if (!layerPath || layerPath === '/^\\/?$/') layerPath = '';
          if (layerPath) prefix += layerPath;
          printRoutes(layer.handle.stack, prefix);
        }
      }
    }
    if (app._router && app._router.stack) {
      printRoutes(app._router.stack, '');
    }
  });
}

process.on('SIGTERM', async () => {
  await disconnectDatabase();
  await disconnectRedis();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await disconnectDatabase();
  await disconnectRedis();
  process.exit(0);
});

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
