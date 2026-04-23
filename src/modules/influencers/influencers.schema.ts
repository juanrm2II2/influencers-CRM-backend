import { z } from 'zod';
import { PaginationQuerySchema } from '../../utils/pagination';

export const PlatformEnum = z.enum(['tiktok', 'instagram', 'youtube', 'twitter']);

export const HandleSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_.-]+$/u, 'Invalid handle');

export const InfluencerIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const ListInfluencersQuerySchema = PaginationQuerySchema.extend({
  platform: PlatformEnum.optional(),
  country: z.string().length(2).optional(),
  language: z.string().min(2).max(8).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  verified: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  minFollowers: z.coerce.number().int().min(0).optional(),
  search: z.string().trim().min(1).max(128).optional(),
});
export type ListInfluencersQuery = z.infer<typeof ListInfluencersQuerySchema>;

export const CreateInfluencerBodySchema = z.object({
  platform: PlatformEnum,
  handle: HandleSchema,
  displayName: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  country: z.string().length(2).optional(),
  language: z.string().min(2).max(8).optional(),
});
export type CreateInfluencerBody = z.infer<typeof CreateInfluencerBodySchema>;

export const RefreshInfluencerBodySchema = z.object({
  forceFresh: z.boolean().optional().default(false),
});
