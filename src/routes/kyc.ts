import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { sanitizeBody } from '../middleware/sanitize';
import { auditLog } from '../middleware/auditLog';
import { validateKycVerify, validateUserIdParam } from '../middleware/validate';
import { verifyKyc, getKycStatus } from '../controllers/kyc.controller';

const router = Router();

// All KYC routes require authentication
router.use(authenticate);

// Sanitize request bodies
router.use(sanitizeBody);

// Audit log for state-changing operations
router.use(auditLog);

// POST /api/kyc/verify — initiate KYC verification
router.post('/verify', validateKycVerify, verifyKyc);

// GET /api/kyc/status/:userId — get KYC status
router.get('/status/:userId', validateUserIdParam, getKycStatus);

export default router;
