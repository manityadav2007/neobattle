import { PrismaClient, UserRole, TournamentFormat, TournamentStatus } from '@prisma/client';
import { hashPassword } from '../src/utils/auth.utils';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding NEOBATTLE database...');

  const adminPassword = await hashPassword('Admin@123456');
  const playerPassword = await hashPassword('Player@123456');

  const admin = await prisma.user.upsert({
    where: { email: 'admin@neobattle.gg' },
    update: {},
    create: {
      email: 'admin@neobattle.gg',
      username: 'neoadmin',
      passwordHash: adminPassword,
      displayName: 'NEOBATTLE Admin',
      role: UserRole.ADMIN,
      isVerified: true,
      freeFireId: '100000001',
      wallet: { create: { balance: 10000 } },
    },
  });

  const player1 = await prisma.user.upsert({
    where: { email: 'player1@neobattle.gg' },
    update: {},
    create: {
      email: 'player1@neobattle.gg',
      username: 'blazewolf',
      passwordHash: playerPassword,
      displayName: 'Blaze Wolf',
      isVerified: true,
      freeFireId: '200000001',
      wallet: { create: { balance: 500 } },
    },
  });

  const player2 = await prisma.user.upsert({
    where: { email: 'player2@neobattle.gg' },
    update: {},
    create: {
      email: 'player2@neobattle.gg',
      username: 'stormhawk',
      passwordHash: playerPassword,
      displayName: 'Storm Hawk',
      isVerified: true,
      freeFireId: '200000002',
      wallet: { create: { balance: 500 } },
    },
  });

  const team = await prisma.team.upsert({
    where: { name: 'Phoenix Squad' },
    update: {},
    create: {
      name: 'Phoenix Squad',
      tag: 'PHNX',
      leaderId: player1.id,
      members: {
        create: [
          { userId: player1.id, role: 'LEADER' },
          { userId: player2.id, role: 'MEMBER' },
        ],
      },
    },
  });

  const now = new Date();
  const regStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const regEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startTime = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

  await prisma.tournament.upsert({
    where: { id: 'seed-tournament-1' },
    update: {},
    create: {
      id: 'seed-tournament-1',
      title: 'NEOBATTLE Weekly Clash — Solo',
      description: 'Compete in the ultimate solo Free Fire battle royale. Top 3 players win prizes!',
      format: TournamentFormat.SOLO,
      status: TournamentStatus.REGISTRATION,
      entryFee: 5,
      prizePool: 200,
      maxParticipants: 48,
      mapName: 'Bermuda',
      rules: 'No hacks. No teaming in solo. Screenshot proof required for top 3.',
      creatorId: admin.id,
      registrationStart: regStart,
      registrationEnd: regEnd,
      startTime,
    },
  });

  await prisma.tournament.upsert({
    where: { id: 'seed-tournament-2' },
    update: {},
    create: {
      id: 'seed-tournament-2',
      title: 'Squad Showdown — Phoenix Cup',
      description: '4-player squads battle for glory and the Phoenix Cup trophy.',
      format: TournamentFormat.SQUAD,
      status: TournamentStatus.REGISTRATION,
      entryFee: 20,
      prizePool: 500,
      maxParticipants: 24,
      mapName: 'Kalahari',
      creatorId: admin.id,
      registrationStart: regStart,
      registrationEnd: regEnd,
      startTime: new Date(startTime.getTime() + 3 * 24 * 60 * 60 * 1000),
    },
  });

  console.log('✅ Seed complete');
  console.log(`   Admin: admin@neobattle.gg / Admin@123456`);
  console.log(`   Player: player1@neobattle.gg / Player@123456`);
  console.log(`   Team: ${team.name} [${team.tag}]`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
