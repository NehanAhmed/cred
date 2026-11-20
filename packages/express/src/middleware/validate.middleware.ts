import type { RequestHandler } from 'express';

/**
 * Structural subset of a Zod schema. The adapter does not depend on Zod
 * directly: it accepts any schema that can `safeParse` a value and report
 * issues, which is exactly the contract of the validators exported by
 * `@cred-kit/core`.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: readonly unknown[] } };

export interface ValidationSchema<T = unknown> {
  safeParse(input: unknown): ValidationResult<T>;
}

/**
 * Replaces the body with the parsed value and returns `400 { errors }` on
 * failure, matching the response shape of the shipped API. Services in
 * `@cred-kit/core` never validate input, so every route that accepts a body must
 * pass through this middleware.
 */
export const validate = <T>(schema: ValidationSchema<T>): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({ errors: result.error.issues });
      return;
    }

    req.body = result.data;
    next();
  };
};
