import { prisma } from '../config/db';
import { EscrowStatus, TransactionStatus, TransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface EscrowHoldResult {
  success: boolean;
  escrowId?: string;
  message: string;
}

export interface EscrowReleaseResult {
  success: boolean;
  message: string;
}

class EscrowService {
  async holdFunds(
    walletId: string,
    userId: string,
    tournamentId: string,
    amount: number
  ): Promise<EscrowHoldResult> {
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { id: walletId } });

      if (!wallet || Number(wallet.balance) < amount) {
        return { success: false, message: 'Insufficient wallet balance' };
      }

      const escrow = await tx.escrow.create({
        data: {
          walletId,
          tournamentId,
          amount: new Decimal(amount),
          status: EscrowStatus.HELD,
        },
      });

      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: { decrement: amount } },
      });

      await tx.transaction.create({
        data: {
          walletId,
          userId,
          type: TransactionType.ESCROW_HOLD,
          status: TransactionStatus.COMPLETED,
          amount: new Decimal(amount),
          description: `Escrow hold for tournament ${tournamentId}`,
          reference: `ESC-HOLD-${escrow.id.slice(0, 8)}`,
        },
      });

      return { success: true, escrowId: escrow.id, message: 'Funds held in escrow' };
    });
  }

  async releaseToWinner(
    escrowId: string,
    winnerWalletId: string,
    winnerUserId: string
  ): Promise<EscrowReleaseResult> {
    return prisma.$transaction(async (tx) => {
      const escrow = await tx.escrow.findUnique({
        where: { id: escrowId },
        include: { tournament: true },
      });

      if (!escrow || escrow.status !== EscrowStatus.HELD) {
        return { success: false, message: 'Escrow not found or already processed' };
      }

      const amount = Number(escrow.amount);

      await tx.wallet.update({
        where: { id: winnerWalletId },
        data: { balance: { increment: amount } },
      });

      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: EscrowStatus.RELEASED, releasedAt: new Date() },
      });

      await tx.transaction.create({
        data: {
          walletId: winnerWalletId,
          userId: winnerUserId,
          type: TransactionType.PRIZE,
          status: TransactionStatus.COMPLETED,
          amount: escrow.amount,
          description: `Prize from ${escrow.tournament.title}`,
          reference: `ESC-REL-${escrowId.slice(0, 8)}`,
        },
      });

      return { success: true, message: 'Escrow released to winner' };
    });
  }

  async refundEscrow(escrowId: string, userId: string): Promise<EscrowReleaseResult> {
    return prisma.$transaction(async (tx) => {
      const escrow = await tx.escrow.findUnique({ where: { id: escrowId } });

      if (!escrow || escrow.status !== EscrowStatus.HELD) {
        return { success: false, message: 'Escrow not found or already processed' };
      }

      await tx.wallet.update({
        where: { id: escrow.walletId },
        data: { balance: { increment: escrow.amount } },
      });

      await tx.escrow.update({
        where: { id: escrowId },
        data: { status: EscrowStatus.REFUNDED, releasedAt: new Date() },
      });

      await tx.transaction.create({
        data: {
          walletId: escrow.walletId,
          userId,
          type: TransactionType.REFUND,
          status: TransactionStatus.COMPLETED,
          amount: escrow.amount,
          description: 'Tournament escrow refund',
          reference: `ESC-REF-${escrowId.slice(0, 8)}`,
        },
      });

      return { success: true, message: 'Escrow refunded' };
    });
  }

  async getTournamentEscrows(tournamentId: string) {
    return prisma.escrow.findMany({
      where: { tournamentId },
      include: { wallet: { include: { user: { select: { id: true, username: true } } } } },
    });
  }
}

export const escrowService = new EscrowService();
