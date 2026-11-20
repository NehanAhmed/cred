import { AuthError } from '@cred/core';
import type { ErrorRequestHandler } from 'express';
import type { ResolvedCredExpressConfig } from '../config.js';
import { sendError } from '../helpers/api.helper.js';

interface BodyParserError extends Error {
  type?: string;
  status?: number;
  statusCode?: number;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  error instanceof Error &&
  (typeof (error as BodyParserError).type === 'string' ||
    typeof (error as BodyParserError).status === 'number');

/**
 * Final error boundary for the mounted router.
 *
 * `AuthError` carries the HTTP status chosen by core, so it is returned as-is.
 * Malformed or oversized JSON is reported as JSON instead of Express's default
 * HTML error page. Anything else is logged and reduced to a generic 500 so
 * internal details never leak to clients.
 */
export const createErrorHandler = (config: ResolvedCredExpressConfig): ErrorRequestHandler => {
  return (error, _req, res, next) => {
    // Once headers are sent the response is owned by the host's error handler.
    if (res.headersSent) {
      next(error);
      return;
    }

    if (error instanceof AuthError) {
      sendError(res, error.message, error.statusCode);
      return;
    }

    if (isBodyParserError(error)) {
      if (error.type === 'entity.parse.failed') {
        sendError(res, 'Invalid JSON body', 400);
        return;
      }

      if (error.type === 'entity.too.large') {
        sendError(res, 'Request body too large', 413);
        return;
      }
    }

    config.logger.error('@cred/express: unhandled request error', error);
    sendError(res, 'Internal server error', 500);
  };
};
