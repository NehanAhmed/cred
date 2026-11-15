import type { User } from '@cred/core';

export function toMongoFilter(filter: Partial<User>) {
  const { id, ...rest } = filter;
  const clean = Object.fromEntries(
    Object.entries(rest).filter(([, v]) => v !== undefined),
  );
  if (id !== undefined) clean._id = id;
  if (Object.keys(clean).length === 0) {
    throw new Error('findOne requires at least one filter field');
  }
  return clean;
}