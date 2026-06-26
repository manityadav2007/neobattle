import { UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      username: string;
      role: UserRole;
      isActive: boolean;
      isVerified: boolean;
      freeFireId: string | null;
      ign: string | null;
      displayName: string | null;
      avatarUrl: string | null;
      googleId?: string | null;
    }
  }
}

export {};
