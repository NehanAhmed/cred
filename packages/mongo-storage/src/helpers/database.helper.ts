import type { User } from '@cred/core';

/**
 * Translate a storage-neutral user filter into a Mongo query.
 *
 * An empty result is intentional: Mongo treats `{}` as "match any document",
 * which keeps `findOne` and conditional updates consistent with the driver
 * instead of throwing for filters that have no usable fields. Callers that
 * perform destructive operations (such as the refresh-token `deleteMany`)
 * guard against an empty filter themselves.
 */
export function toMongoFilter(filter: Partial<User>) {
  const { id, ...rest } = filter;
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (id !== undefined) clean._id = id;
  return clean;
}
