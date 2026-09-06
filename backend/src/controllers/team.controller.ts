import { Response } from 'express';
import { prisma } from '../config/db';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { TeamMemberRole, TeamRequestStatus } from '@prisma/client';

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

export async function requestJoinTeam(req: AuthenticatedRequest, res: Response): Promise<void> {
  const teamCode = String(req.body.teamCode || req.body.teamId || req.body.tag || '').trim();
  const userId = req.user!.id;

  if (!teamCode) {
    res.status(400).json({ success: false, message: 'Please enter a Team ID or Team Tag.' });
    return;
  }

  const existing = await prisma.teamMember.findFirst({ where: { userId } });
  if (existing) {
    res.status(409).json({ success: false, message: 'You are already in a team. Leave your current team first.' });
    return;
  }

  // Find team by ID or by Tag (case-insensitive)
  const team = await prisma.team.findFirst({
    where: {
      OR: [
        { id: teamCode },
        { tag: { equals: teamCode, mode: 'insensitive' } },
      ],
      isActive: true,
    },
    include: {
      members: true,
      leader: { select: { id: true, username: true } },
    },
  });

  if (!team) {
    res.status(404).json({ success: false, message: `Team "${teamCode}" not found.` });
    return;
  }

  if (team.members.length >= team.maxMembers) {
    res.status(400).json({ success: false, message: `Team "${team.name}" is already full (${team.members.length}/${team.maxMembers}).` });
    return;
  }

  // Check if a pending join request already exists
  const pendingRequest = await prisma.teamJoinRequest.findFirst({
    where: {
      teamId: team.id,
      userId,
      status: TeamRequestStatus.PENDING,
    },
  });

  if (pendingRequest) {
    res.status(400).json({ success: false, message: `You already have a pending join request for team "${team.name}".` });
    return;
  }

  const request = await prisma.teamJoinRequest.create({
    data: {
      teamId: team.id,
      userId,
      status: TeamRequestStatus.PENDING,
    },
    include: {
      team: { select: { id: true, name: true, tag: true } },
      user: { select: { id: true, username: true, freeFireId: true, gameLevel: true } },
    },
  });

  // Create notification for team leader
  try {
    await prisma.notification.create({
      data: {
        userId: team.leaderId,
        title: 'New Team Join Request',
        message: `${req.user!.username || 'A player'} requested to join your team "${team.name}".`,
        type: 'TEAM',
      },
    });
  } catch (err) {}

  res.status(201).json({
    success: true,
    data: request,
    message: `Join request sent to "${team.name}" [${team.tag}]! Waiting for the team leader to approve.`,
  });
}

export async function getTeamJoinRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
  const teamId = req.params.id;
  const userId = req.user!.id;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, leaderId: true, name: true },
  });

  if (!team) {
    res.status(404).json({ success: false, message: 'Team not found' });
    return;
  }

  if (team.leaderId !== userId && req.user!.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Only team leader can view join requests' });
    return;
  }

  const requests = await prisma.teamJoinRequest.findMany({
    where: {
      teamId,
      status: TeamRequestStatus.PENDING,
    },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
          freeFireId: true,
          ign: true,
          gameLevel: true,
          isVerified: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: requests });
}

export async function reviewJoinRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
  const requestId = req.params.requestId;
  const { action } = req.body; // 'ACCEPT' | 'REJECT'
  const userId = req.user!.id;

  if (action !== 'ACCEPT' && action !== 'REJECT') {
    res.status(400).json({ success: false, message: 'Invalid action. Must be ACCEPT or REJECT.' });
    return;
  }

  const request = await prisma.teamJoinRequest.findUnique({
    where: { id: requestId },
    include: {
      team: {
        include: {
          members: true,
        },
      },
      user: {
        select: {
          id: true,
          username: true,
          freeFireId: true,
          isVerified: true,
          gameLevel: true,
        },
      },
    },
  });

  if (!request) {
    res.status(404).json({ success: false, message: 'Join request not found' });
    return;
  }

  if (request.status !== TeamRequestStatus.PENDING) {
    res.status(400).json({ success: false, message: `This request has already been ${request.status.toLowerCase()}.` });
    return;
  }

  if (request.team.leaderId !== userId && req.user!.role !== 'ADMIN') {
    res.status(403).json({ success: false, message: 'Only team leader can review join requests' });
    return;
  }

  if (action === 'REJECT') {
    await prisma.teamJoinRequest.update({
      where: { id: requestId },
      data: { status: TeamRequestStatus.REJECTED },
    });

    try {
      await prisma.notification.create({
        data: {
          userId: request.userId,
          title: 'Team Join Request Rejected',
          message: `Your request to join team "${request.team.name}" was declined.`,
          type: 'TEAM',
        },
      });
    } catch (e) {}

    res.json({ success: true, message: `Request from ${request.user.username} rejected.` });
    return;
  }

  // ACCEPT FLOW
  if (request.team.members.length >= request.team.maxMembers) {
    res.status(400).json({
      success: false,
      message: `Team is full (${request.team.members.length}/${request.team.maxMembers}). Cannot accept more members.`,
    });
    return;
  }

  const existingMembership = await prisma.teamMember.findFirst({
    where: { userId: request.userId },
  });

  if (existingMembership) {
    await prisma.teamJoinRequest.update({
      where: { id: requestId },
      data: { status: TeamRequestStatus.REJECTED },
    });
    res.status(400).json({ success: false, message: `${request.user.username} is already in another team.` });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.teamJoinRequest.update({
      where: { id: requestId },
      data: { status: TeamRequestStatus.ACCEPTED },
    });

    await tx.teamMember.create({
      data: {
        teamId: request.teamId,
        userId: request.userId,
        role: TeamMemberRole.MEMBER,
      },
    });

    await tx.teamJoinRequest.updateMany({
      where: {
        userId: request.userId,
        status: TeamRequestStatus.PENDING,
      },
      data: { status: TeamRequestStatus.REJECTED },
    });
  });

  try {
    await prisma.notification.create({
      data: {
        userId: request.userId,
        title: 'Team Join Request Accepted!',
        message: `Congratulations! Your request to join team "${request.team.name}" was accepted.`,
        type: 'TEAM',
      },
    });
  } catch (e) {}

  const updatedTeam = await prisma.team.findUnique({
    where: { id: request.teamId },
    include: {
      members: {
        include: {
          user: {
            select: { id: true, username: true, displayName: true, avatarUrl: true, freeFireId: true, ign: true, gameLevel: true, isVerified: true },
          },
        },
      },
      leader: { select: { id: true, username: true } },
    },
  });

  res.json({
    success: true,
    message: `${request.user.username} has been added to team "${request.team.name}"!`,
    data: updatedTeam,
  });
}
