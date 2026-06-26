import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createTicket = async (req: Request, res: Response) => {
  try {
    const { type, subject, description } = req.body;
    const userId = (req as any).user?.id || null;

    console.log('[Support] createTicket called:', { type, subject, userId });

    if (!type || !subject || !description) {
      console.log('[Support] Missing fields');
      return res.status(400).json({ success: false, message: 'type, subject, and description are required' });
    }

    if (!['BUG', 'FEEDBACK'].includes(type)) {
      console.log('[Support] Invalid type:', type);
      return res.status(400).json({ success: false, message: 'type must be BUG or FEEDBACK' });
    }

    const ticket = await prisma.supportTicket.create({
      data: { userId, type, subject, description },
    });

    console.log('[Support] Ticket created:', ticket.id);
    return res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    console.error('[Support] createTicket error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const listTickets = async (req: Request, res: Response) => {
  try {
    console.log('[Support] listTickets called by user:', (req as any).user?.email);

    const tickets = await prisma.supportTicket.findMany({
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, username: true, email: true, uid: true } } },
    });

    console.log('[Support] listTickets returning', tickets.length, 'tickets');
    return res.json({ success: true, data: tickets });
  } catch (error) {
    console.error('[Support] listTickets error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const resolveTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    console.log('[Support] resolveTicket called for id:', id);

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: { status: 'RESOLVED' },
    });

    console.log('[Support] Ticket', id, 'resolved');
    return res.json({ success: true, data: ticket });
  } catch (error) {
    console.error('[Support] resolveTicket error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const deleteTicket = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    console.log('[Support] deleteTicket called for id:', id);

    await prisma.supportTicket.delete({ where: { id } });

    console.log('[Support] Ticket', id, 'deleted');
    return res.json({ success: true, message: 'Ticket deleted' });
  } catch (error) {
    console.error('[Support] deleteTicket error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
