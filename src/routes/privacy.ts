import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { sanitizeBody } from '../middleware/sanitize';
import { auditLog } from '../middleware/auditLog';
import {
  validateConsent,
  validateDsarRequest,
  validateDsarUpdate,
  validateIdParam,
} from '../middleware/validate';
import {
  listConsents,
  updateConsent,
  listDsarRequests,
  createDsar,
  updateDsar,
  exportData,
  eraseData,
  purgeData,
} from '../controllers/privacy.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Sanitize request bodies
router.use(sanitizeBody);

// Audit log for state-changing operations
router.use(auditLog);

// ---------------------------------------------------------------------------
// Consent management
// ---------------------------------------------------------------------------

// GET /api/privacy/consent — list consent records
router.get('/consent', listConsents);

// POST /api/privacy/consent — grant or revoke consent
router.post('/consent', validateConsent, updateConsent);

// ---------------------------------------------------------------------------
// DSAR (Data Subject Access Requests)
// ---------------------------------------------------------------------------

// GET /api/privacy/requests — list DSAR requests
router.get('/requests', listDsarRequests);

// POST /api/privacy/requests — create a new DSAR request
router.post('/requests', validateDsarRequest, createDsar);

// PATCH /api/privacy/requests/:id — update DSAR status (admin only)
router.patch(
  '/requests/:id',
  validateIdParam,
  validateDsarUpdate,
  authorize('admin'),
  updateDsar
);

// ---------------------------------------------------------------------------
// Data export (portability)
// ---------------------------------------------------------------------------

// GET /api/privacy/export — export all user data
router.get('/export', exportData);

// ---------------------------------------------------------------------------
// Right to erasure
// ---------------------------------------------------------------------------

// DELETE /api/privacy/data — erase all personal data
router.delete('/data', eraseData);

// ---------------------------------------------------------------------------
// Data retention (admin only)
// ---------------------------------------------------------------------------

// POST /api/privacy/purge — trigger data retention purge
router.post('/purge', authorize('admin'), purgeData);

export default router;
