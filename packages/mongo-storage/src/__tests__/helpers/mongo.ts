import { isDeepStrictEqual } from 'node:util';
import mongoose, { type Connection, type Model } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * A self-contained MongoDB instance for one test suite.
 *
 * Each suite gets its own server and connection so mongoose model registries
 * (which are keyed by connection) and collections never leak between files.
 */
export interface TestDatabase {
  readonly uri: string;
  readonly connection: Connection;
  /** Removes every document without dropping indexes. */
  clear(): Promise<void>;
  /** Closes the connection and stops the underlying mongod process. */
  close(): Promise<void>;
}

/** Checks a schema index definition by key and selected options. */
export function hasSchemaIndex(
  model: Model<any>,
  fields: Record<string, 1 | -1>,
  options: Record<string, unknown> = {}
): boolean {
  return model.schema
    .indexes()
    .some(
      ([candidateFields, candidateOptions]: [Record<string, unknown>, Record<string, unknown>]) => {
        if (!isDeepStrictEqual(candidateFields, fields)) {
          return false;
        }

        return Object.entries(options).every(([key, value]) =>
          isDeepStrictEqual(candidateOptions[key], value)
        );
      }
    );
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const server = await MongoMemoryServer.create();
  const uri = server.getUri();

  let connection: Connection;
  try {
    connection = await mongoose.createConnection(uri).asPromise();
  } catch (error) {
    await server.stop();
    throw error;
  }

  return {
    uri,
    connection,
    async clear() {
      if (!connection.db) {
        throw new Error('Test database connection is not ready');
      }

      const collections = await connection.db.collections();
      await Promise.all(collections.map((collection) => collection.deleteMany({})));
    },
    async close() {
      await connection.close();
      await server.stop();
    }
  };
}
