import type { EmailAdapter } from '@cred/core';
import { mongooseStorage, type MongooseStorage } from '@cred/mongo-storage';
import { emailService, type EmailService } from '@cred/smtp';
import type { CredDatabaseConfig, ResolvedCredExpressConfig } from './config.js';
import type { CredCoreDeps } from './types.js';

const PREFIX = '@cred/express';

/** Resources the adapter created itself and is therefore responsible for closing. */
interface ClosableResource {
  close(): void | Promise<void>;
}

/**
 * Releases every resource even when one of them fails, then reports the
 * failures together. Shutdown must not stop at the first broken transport.
 */
const closeResources = async (resources: readonly ClosableResource[]): Promise<void> => {
  const errors: unknown[] = [];

  for (const resource of resources) {
    try {
      await resource.close();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length === 1) throw errors[0];

  if (errors.length > 1) {
    throw new AggregateError(errors, `${PREFIX}: failed to release adapter resources`);
  }
};

export interface CredCoreRuntime {
  /** Adapters and config ready to be passed to core services. */
  deps: CredCoreDeps;
  /**
   * Closes the MongoDB connection and mail transport created for this router.
   * Prebuilt adapters supplied by the host are never closed. Idempotent.
   */
  close(): Promise<void>;
}

/**
 * Builds the concrete adapters requested by the resolved configuration and
 * shapes them into the dependency bundle core expects.
 *
 * `@cred/core` only knows the adapter interfaces; this package owns the
 * concrete `@cred/mongo-storage` / `@cred/smtp` construction. When a host
 * supplies prebuilt adapters they are passed through untouched.
 *
 * If construction fails part-way through, resources already created are
 * released before the error is rethrown so a retry does not leak connections.
 */
export const createCoreRuntime = async (
  config: ResolvedCredExpressConfig,
): Promise<CredCoreRuntime> => {
  let storage: MongooseStorage | undefined;
  let mail: EmailService | undefined;

  try {
    let database: CredDatabaseConfig;
    if (config.database.kind === 'mongoose') {
      storage = mongooseStorage(config.database.options);
      await storage.ready();

      database = {
        user: storage.user,
        refreshToken: storage.refreshToken,
        audit: storage.auditLogs,
      };
    } else {
      database = config.database.adapters;
    }

    let email: EmailAdapter;
    if (config.email.kind === 'email-service') {
      mail = await emailService(config.email.options);
      email = mail.EMAIL;
    } else {
      email = config.email.adapter;
    }

    const deps: CredCoreDeps = {
      userDatabase: database.user,
      refreshTokenDatabase: database.refreshToken,
      auditDatabase: database.audit,
      email,
    };

    let closed = false;

    return {
      deps,
      close: async () => {
        if (closed) return;
        closed = true;

        const resources: ClosableResource[] = [];
        if (mail) resources.push(mail);
        if (storage) resources.push(storage);

        await closeResources(resources);
      },
    };
  } catch (error) {
    const resources: ClosableResource[] = [];
    if (mail) resources.push(mail);
    if (storage) resources.push(storage);

    try {
      await closeResources(resources);
    } catch (closeError) {
      config.logger.error(`${PREFIX}: failed to release adapters after setup failure`, closeError);
    }

    throw error;
  }
};
