import { z } from 'zod';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function buildPage<T>(data: T[], total: number, q: PaginationQuery): Page<T> {
  return {
    data,
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export function pageRange(q: PaginationQuery): { from: number; to: number } {
  const from = (q.page - 1) * q.pageSize;
  const to = from + q.pageSize - 1;
  return { from, to };
}
