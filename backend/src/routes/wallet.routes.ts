import { Router } from 'express';
import * as walletController from '../controllers/wallet.controller';
import { authenticate } from '../middleware/authMiddleware';
import { validate } from '../middleware/validate';
import { walletLimiter } from '../middleware/rateLimiter';
import { walletDepositSchema, walletWithdrawSchema } from '../utils/validation.schemas';

const router = Router();

router.use(authenticate);

router.get('/', walletController.getWallet);
router.get('/transactions', walletController.getTransactions);
router.post('/deposit', walletLimiter, validate(walletDepositSchema), walletController.deposit);
router.post('/withdraw', walletLimiter, validate(walletWithdrawSchema), walletController.withdraw);

export default router;
