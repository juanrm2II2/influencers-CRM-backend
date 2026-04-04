import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { sanitizeBody } from '../middleware/sanitize';
import { auditLog } from '../middleware/auditLog';
import {
  validateSearch,
  validateBulkSearch,
  validateUpdate,
  validateOutreach,
  validateIdParam,
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

// Sanitize request bodies to prevent XSS (after auth, before handlers)
router.use(sanitizeBody);

// Audit log for state-changing operations (after auth so req.user is available)
router.use(auditLog);

// POST /api/influencers/bulk-search  — must be before /:id routes
router.post('/bulk-search', validateBulkSearch, bulkSearchInfluencers);

// POST /api/influencers/search
router.post('/search', validateSearch, searchInfluencer);

// GET /api/influencers
router.get('/', getInfluencers);

// GET /api/influencers/:id
router.get('/:id', validateIdParam, getInfluencerById);

// PATCH /api/influencers/:id
router.patch('/:id', validateIdParam, validateUpdate, updateInfluencer);

// DELETE /api/influencers/:id — restricted to admin role
router.delete('/:id', validateIdParam, authorize('admin'), deleteInfluencer);

// POST /api/influencers/:id/outreach
router.post('/:id/outreach', validateIdParam, validateOutreach, createOutreach);

export default router;
