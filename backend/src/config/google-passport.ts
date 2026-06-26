import { Strategy as GoogleStrategy, VerifyCallback } from 'passport-google-oauth20';
import { prisma } from './db';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

export const googleStrategy = new GoogleStrategy(
  {
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/api/auth/google/callback`,
    scope: ['profile', 'email'],
  },
  async (_accessToken: string, _refreshToken: string, profile: any, done: VerifyCallback) => {
    try {
      const email = profile.emails?.[0]?.value;
      const displayName = profile.displayName;
      const googleId = profile.id;
      const avatarUrl = profile.photos?.[0]?.value || null;

      if (!email) {
        return done(new Error('Google account must have an email'), undefined);
      }

      let user = await prisma.user.findFirst({
        where: { OR: [{ googleId }, { email }] },
      });

      if (user) {
        if (!user.googleId) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { googleId, displayName: user.displayName || displayName, avatarUrl: user.avatarUrl || avatarUrl },
          });
        }
      } else {
        const lastUser = await prisma.user.findFirst({ orderBy: { uid: 'desc' }, select: { uid: true } });
        const lastNum = lastUser?.uid ? parseInt(lastUser.uid.replace('FA-', '')) || 1000 : 1000;
        const uid = `FA-${lastNum + 1}`;
        const username = `google_${googleId.slice(-12)}`;
        user = await prisma.user.create({
          data: {
            uid,
            email,
            username,
            passwordHash: '',
            googleId,
            displayName,
            avatarUrl,
            wallet: { create: {} },
          },
        });
      }

      return done(null, user);
    } catch (err) {
      return done(err as Error, undefined);
    }
  }
);
