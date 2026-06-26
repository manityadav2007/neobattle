import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

let isDatabaseConnected = false;

export async function connectDatabase(): Promise<void> {
  if (isDatabaseConnected) {
    return;
  }

  await prisma.$connect();
  isDatabaseConnected = true;
}

export async function disconnectDatabase(): Promise<void> {
  if (!isDatabaseConnected) {
    return;
  }

  await prisma.$disconnect();
  isDatabaseConnected = false;
}
