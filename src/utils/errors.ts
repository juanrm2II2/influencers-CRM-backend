/**
 * Domain error hierarchy. All errors thrown from services/controllers should
 * extend `AppError` so the central error-handler middleware can translate
 * them into a consistent JSON response without leaking internals.
 */
export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly expose: boolean;

  constructor(
    message: string,
    opts: { status?: number; code?: string; details?: unknown; expose?: boolean } = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.status = opts.status ?? 500;
    this.code = opts.code ?? 'INTERNAL_ERROR';
    this.details = opts.details;
    this.expose = opts.expose ?? this.status < 500;
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, { status: 400, code: 'BAD_REQUEST', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { status: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { status: 403, code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', details?: unknown) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, { status: 429, code: 'RATE_LIMITED' });
  }
}

export class NotImplementedError extends AppError {
  constructor(message = 'Not implemented') {
    super(message, { status: 501, code: 'NOT_IMPLEMENTED' });
  }
}

export class UpstreamError extends AppError {
  constructor(message = 'Upstream error', details?: unknown) {
    super(message, { status: 502, code: 'UPSTREAM_ERROR', details });
  }
}
