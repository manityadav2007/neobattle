import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport from './config/passport';
import { connectDatabase, disconnectDatabase } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { globalLimiter } from './middleware/rateLimiter';
import routes from './routes';
import { startTournamentNotifier } from './jobs/tournament-notifier';

const app = express();
const PORT = parseInt(process.env.PORT || '4000', 10);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  })
);
import path from 'path';
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(globalLimiter);
app.use(passport.initialize());

app.use('/api', routes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error]', err.message);
  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

async function startServer(): Promise<void> {
  await connectDatabase();
  await connectRedis();

  startTournamentNotifier();

  app.listen(PORT, () => {
    console.log(`🔥 NEOBATTLE API running on http://localhost:${PORT}`);
    console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
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
