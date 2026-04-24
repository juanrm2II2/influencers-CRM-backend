import { Router, Request } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { requireConsent } from '../middleware/requireConsent';
import { sanitizeBody } from '../middleware/sanitize';
import { auditLog } from '../middleware/auditLog';
import {
  validateSearch,
  validateBulkSearch,
  validateUpdate,
  validateOutreach,
  validateIdParam,
  validateListQuery,
} from '../middleware/validate';
import {
  searchInfluencer,
  bulkSearchInfluencers,
  getInfluencers,
  getInfluencerById,
  updateInfluencer,
  deleteInfluencer,
  createOutreach,
} from '../controllers/influencers.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Verify data-processing consent before any data processing
router.use(requireConsent);

// Sanitize request bodies to prevent XSS (after auth, before handlers)
router.use(sanitizeBody);

// Audit log for state-changing operations (after auth so req.user is available)
router.use(auditLog);

/**
 * Per-user rate limiter for `/bulk-search` (audit M1).
 *
 * One authenticated abuser could otherwise issue 100 requests / 15 min × 50
 * handles per request = 5 000 outbound paid-API calls / 15 min — exhausting
 * quota and amplifying upstream cost.  Keying the limit on the JWT `sub`
 * caps every individual user at 5 bulk batches / 15 min regardless of
 * source IP, while still allowing healthy interactive use.
 */
const bulkSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.BULK_SEARCH_RATE_LIMIT ?? '5', 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string =>
    (req.user?.sub as string | undefined) ?? req.ip ?? 'anonymous',
  message: {
    error: 'Bulk search rate limit exceeded — try again later',
  },
});

// POST /api/influencers/bulk-search  — must be before /:id routes
router.post('/bulk-search', bulkSearchLimiter, validateBulkSearch, bulkSearchInfluencers);

// POST /api/influencers/search
router.post('/search', validateSearch, searchInfluencer);

// GET /api/influencers
router.get('/', validateListQuery, getInfluencers);

// GET /api/influencers/:id
router.get('/:id', validateIdParam, getInfluencerById);

// PATCH /api/influencers/:id
router.patch('/:id', validateIdParam, validateUpdate, updateInfluencer);

// DELETE /api/influencers/:id — restricted to admin role
router.delete('/:id', validateIdParam, authorize('admin'), deleteInfluencer);

// POST /api/influencers/:id/outreach
router.post('/:id/outreach', validateIdParam, validateOutreach, createOutreach);

export default router;
