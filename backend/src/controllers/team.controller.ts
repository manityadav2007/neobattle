import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TeamMemberRole } from '@prisma/client';

export async function createTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { name, tag, logoUrl } = req.body;
  const userId = req.user!.id;

  const existingMembership = await prisma.teamMember.findFirst({ where: { userId } });
  if (existingMembership) {
    res.status(409).json({ success: false, message: 'You are already in a team' });
    return;
  }

  const team = await prisma.team.create({
    data: {
      name,
      tag: tag.toUpperCase(),
      logoUrl,
      leaderId: userId,
      members: { create: { userId, role: TeamMemberRole.LEADER } },
    },
    include: {
      members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
      leader: { select: { id: true, username: true } },
    },
  });

  res.status(201).json({ success: true, data: team });
}

export async function getTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const team = await prisma.team.findUnique({
    where: { id: req.params.id },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, freeFireId: true },
          },
        },
      },
      leader: { select: { id: true, username: true } },
    },
  });

  if (!team) {
    res.status(404).json({ success: false, message: 'Team not found' });
    return;
  }

  res.json({ success: true, data: team });
}

export async function getMyTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const membership = await prisma.teamMember.findFirst({
    where: { userId: req.user!.id },
    include: {
      team: {
        include: {
          members: {
            include: {
              user: {
                select: { id: true, username: true, displayName: true, avatarUrl: true },
              },
            },
          },
          leader: { select: { id: true, username: true } },
        },
      },
    },
  });

  if (!membership) {
    res.json({ success: true, data: null });
    return;
  }

  res.json({ success: true, data: membership.team });
}

export async function joinTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { teamId } = req.body;
  const userId = req.user!.id;

  const existing = await prisma.teamMember.findFirst({ where: { userId } });
  if (existing) {
    res.status(409).json({ success: false, message: 'Already in a team' });
    return;
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { _count: { select: { members: true } } },
  });

  if (!team || !team.isActive) {
    res.status(404).json({ success: false, message: 'Team not found' });
    return;
  }

  if (team._count.members >= team.maxMembers) {
    res.status(400).json({ success: false, message: 'Team is full' });
    return;
  }

  await prisma.teamMember.create({
    data: { teamId, userId, role: TeamMemberRole.MEMBER },
  });

  const updated = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      members: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
    },
  });

  res.json({ success: true, data: updated });
}

export async function leaveTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user!.id;

  const membership = await prisma.teamMember.findFirst({
    where: { userId },
    include: { team: true },
  });

  if (!membership) {
    res.status(404).json({ success: false, message: 'Not in a team' });
    return;
  }

  if (membership.role === TeamMemberRole.LEADER) {
    res.status(400).json({
      success: false,
      message: 'Leader cannot leave. Transfer leadership or disband the team first.',
    });
    return;
  }

  await prisma.teamMember.delete({ where: { id: membership.id } });
  res.json({ success: true, message: 'Left team successfully' });
}

export async function listTeams(req: AuthenticatedRequest, res: Response): Promise<void> {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;

  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { members: true } },
        leader: { select: { id: true, username: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.team.count({ where: { isActive: true } }),
  ]);

  res.json({
    success: true,
    data: teams,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function disbandTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const team = await prisma.team.findUnique({ where: { id: req.params.id } });

  if (!team) {
    res.status(404).json({ success: false, message: 'Team not found' });
    return;
  }

  if (team.leaderId !== req.user!.id && req.user!.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Only team leader can disband' });
    return;
  }

  await prisma.team.update({ where: { id: team.id }, data: { isActive: false } });
  res.json({ success: true, message: 'Team disbanded' });
}
