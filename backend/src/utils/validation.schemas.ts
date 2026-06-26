import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(20, 'Username must be at most 20 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a number'),
  displayName: z.string().min(1).max(50).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const updateProfileSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  displayName: z.string().min(1).max(50).optional(),
  avatarUrl: z.string().url().optional(),
  freeFireId: z.string().min(5).max(20).optional(),
  notifyTournaments: z.boolean().optional(),
  notifyResults: z.boolean().optional(),
  notifyAlerts: z.boolean().optional(),
});

export const createTeamSchema = z.object({
  name: z.string().min(3).max(30),
  tag: z.string().min(2).max(6).regex(/^[A-Z0-9]+$/),
  logoUrl: z.string().url().optional(),
});

export const joinTeamSchema = z.object({
  teamId: z.string().cuid(),
});

export const createTournamentSchema = z.object({
  title: z.string().min(5).max(100),
  description: z.string().max(2000).optional(),
  format: z.enum(['SOLO', 'DUO', 'SQUAD']),
  platform: z.enum(['MOBILE', 'PC']).default('MOBILE'),
  gameMode: z.enum(['FULL_MAP', 'CLASH_SQUAD']).default('FULL_MAP'),
  entryFee: z.number().min(0).max(1000),
  prizePool: z.number().min(0),
  maxParticipants: z.number().int().min(2).max(100),
  mapName: z.string().max(50).optional(),
  rules: z.string().max(5000).optional(),
  prizeFirst: z.number().min(0).optional(),
  prizeSecond: z.number().min(0).optional().nullable(),
  prizeThird: z.number().min(0).optional().nullable(),
  registrationStart: z.string().datetime(),
  registrationEnd: z.string().datetime(),
  startTime: z.string().datetime(),
});

export const updateTournamentSchema = createTournamentSchema.partial().extend({
  status: z.enum(['DRAFT', 'REGISTRATION', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  roomId: z.string().optional(),
  roomPassword: z.string().optional(),
});

export const registerTournamentSchema = z.object({
  tournamentId: z.string().cuid(),
  teamId: z.string().cuid().optional(),
  squadUids: z.array(z.string().min(5)).length(4).optional(),
});

export const walletDepositSchema = z.object({
  amount: z.number().positive().max(10000),
});

export const walletWithdrawSchema = z.object({
  amount: z.number().positive(),
});

export const verificationSubmitSchema = z.object({
  freeFireId: z.string().min(5).max(20),
  screenshotUrl: z.string().url(),
});

export const verificationReviewSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().max(500).optional(),
});

export const updateEntryScoreSchema = z.object({
  placement: z.number().int().min(1).optional(),
  kills: z.number().int().min(0).optional(),
  points: z.number().int().min(0).optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  format: z.string().optional(),
  platform: z.string().optional(),
  gameMode: z.string().optional(),
});
