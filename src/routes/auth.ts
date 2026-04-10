import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { logout } from '../controllers/auth.controller';

const router = Router();

// POST /api/auth/logout — revoke the current JWT
router.post('/logout', authenticate, logout);

export default router;
