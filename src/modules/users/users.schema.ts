import { z } from 'zod';
import { PaginationQuerySchema } from '../../utils/pagination';

export const UserIdParamSchema = z.object({ id: z.string().uuid() });

export const InviteUserBodySchema = z.object({
  email: z.string().email().max(254),
  roles: z
    .array(z.enum(['admin', 'manager', 'analyst', 'auditor']))
    .min(1)
    .max(4),
  orgId: z.string().uuid(),
});

export const AssignRolesBodySchema = z.object({
  roles: z
    .array(z.enum(['admin', 'manager', 'analyst', 'auditor']))
    .min(0)
    .max(4),
});

export const ListUsersQuerySchema = PaginationQuerySchema.extend({
  orgId: z.string().uuid().optional(),
  email: z.string().email().optional(),
});
