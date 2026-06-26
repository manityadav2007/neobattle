import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ where: { uid: '' } });
  const tournaments = await prisma.tournament.findMany({ where: { uid: '' } });

  let userCounter = 1001;
  let tourCounter = 9001;

  const lastUser = await prisma.user.findFirst({ orderBy: { uid: 'desc' } });
  if (lastUser && lastUser.uid) {
    const num = parseInt(lastUser.uid.replace('FA-', ''));
    if (!isNaN(num)) userCounter = num + 1;
  }

  const lastTour = await prisma.tournament.findFirst({ orderBy: { uid: 'desc' } });
  if (lastTour && lastTour.uid) {
    const num = parseInt(lastTour.uid.replace('T-', ''));
    if (!isNaN(num)) tourCounter = num + 1;
  }

  for (const u of users) {
    await prisma.user.update({ where: { id: u.id }, data: { uid: `FA-${userCounter++}` } });
    console.log(`User ${u.username} -> FA-${userCounter - 1}`);
  }

  for (const t of tournaments) {
    await prisma.tournament.update({ where: { id: t.id }, data: { uid: `T-${tourCounter++}` } });
    console.log(`Tournament ${t.title} -> T-${tourCounter - 1}`);
  }

  console.log('Done! UIDs populated.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
