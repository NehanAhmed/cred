/**
 * Storage-independent contract for uniqueness violations.
 *
 * Storage adapters must catch their native duplicate-key errors (for example,
 * MongoDB error code 11000) and reject with this error instead. Core services
 * map it to `AuthError('DUPLICATE_KEY')` without depending on any driver.
 */
export class DuplicateKeyError extends Error {
  constructor(public readonly field?: string) {
    super(field ? `${field} is already taken` : 'A unique field is already taken');
    this.name = 'DuplicateKeyError';
  }
}
