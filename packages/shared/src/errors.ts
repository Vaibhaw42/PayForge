/**
 * PayForge base error class + Stripe-style error object.
 * See reference-architecture-notes.md §2.4.
 *
 * Every AppError renders to a stable JSON shape via `toResponse()`.
 * HTTP layer (apps/backend) catches AppError and shapes the response.
 */
export type ErrorType =
  | 'api_error'
  | 'invalid_request_error'
  | 'authentication_error'
  | 'authorization_error'
  | 'not_found_error'
  | 'conflict_error'
  | 'rate_limit_error'
  | 'card_error'
  | 'upi_error'

export interface ErrorResponse {
  error: {
    type: ErrorType
    code: string
    message: string
    param?: string
    request_id?: string
  }
}

export class AppError extends Error {
  readonly type: ErrorType
  readonly code: string
  readonly httpStatus: number
  readonly param?: string

  constructor(args: {
    type: ErrorType
    code: string
    message: string
    httpStatus: number
    param?: string
  }) {
    super(args.message)
    this.name = 'AppError'
    this.type = args.type
    this.code = args.code
    this.httpStatus = args.httpStatus
    if (args.param) this.param = args.param
  }

  toResponse(requestId?: string): ErrorResponse {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
        ...(this.param ? { param: this.param } : {}),
        ...(requestId ? { request_id: requestId } : {}),
      },
    }
  }
}

/** Common convenience factories used across phases. */
export const Errors = {
  notFound: (resource: string, id: string) =>
    new AppError({
      type: 'not_found_error',
      code: 'resource_not_found',
      message: `${resource} '${id}' not found`,
      httpStatus: 404,
    }),
  invalidRequest: (message: string, param?: string) =>
    new AppError({
      type: 'invalid_request_error',
      code: 'invalid_request',
      message,
      httpStatus: 400,
      param,
    }),
  unauthenticated: (message = 'Authentication required') =>
    new AppError({
      type: 'authentication_error',
      code: 'unauthenticated',
      message,
      httpStatus: 401,
    }),
  forbidden: (message = 'Forbidden') =>
    new AppError({
      type: 'authorization_error',
      code: 'forbidden',
      message,
      httpStatus: 403,
    }),
  conflict: (code: string, message: string) =>
    new AppError({
      type: 'conflict_error',
      code,
      message,
      httpStatus: 409,
    }),
  rateLimited: (message = 'Too many requests') =>
    new AppError({
      type: 'rate_limit_error',
      code: 'rate_limited',
      message,
      httpStatus: 429,
    }),
}
