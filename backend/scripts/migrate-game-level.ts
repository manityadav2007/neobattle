import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting migration: backfill gameLevel on User, requiredLevel on Tournament...');

  const userResult = await prisma.user.updateMany({
    where: { gameLevel: { equals: undefined as any } },
    data: { gameLevel: 0 },
  });
  console.log(`Users updated: ${userResult.count} (set gameLevel=0 where missing)`);

  const tourResult = await prisma.tournament.updateMany({
    where: { requiredLevel: { equals: undefined as any } },
    data: { requiredLevel: 0 },
  });
  console.log(`Tournaments updated: ${tourResult.count} (set requiredLevel=0 where missing)`);

  const users = await prisma.user.count({ where: { gameLevel: { gt: 0 } } });
  console.log(`Users with gameLevel > 0: ${users}`);

  const tours = await prisma.tournament.count({ where: { requiredLevel: { gt: 0 } } });
  console.log(`Tournaments with requiredLevel > 0: ${tours}`);

  await prisma.$disconnect();
  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
