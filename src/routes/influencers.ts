import { Router } from 'express';
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

// POST /api/influencers/bulk-search  — must be before /:id routes
router.post('/bulk-search', bulkSearchInfluencers);

// POST /api/influencers/search
router.post('/search', searchInfluencer);

// GET /api/influencers
router.get('/', getInfluencers);

// GET /api/influencers/:id
router.get('/:id', getInfluencerById);

// PATCH /api/influencers/:id
router.patch('/:id', updateInfluencer);

// DELETE /api/influencers/:id
router.delete('/:id', deleteInfluencer);

// POST /api/influencers/:id/outreach
router.post('/:id/outreach', createOutreach);

export default router;
