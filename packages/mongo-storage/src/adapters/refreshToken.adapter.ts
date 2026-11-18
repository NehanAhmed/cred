import {
    DuplicateKeyError,
    type RefreshToken,
    type RefreshTokenDatabaseAdapter,
} from '@cred/core';
import type { Model } from 'mongoose';

/**
 * The concrete document type depends on the schema supplied by the host
 * application, while `RefreshToken` is the storage-neutral contract owned by
 * core.
 */
type MongooseModel = Model<any>;

interface MongoErrorLike {
    code?: number;
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
}

const toPlainObject = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== 'object') {
        throw new TypeError('Expected a Mongoose document or a plain object');
    }

    const document = value as { toObject?: () => Record<string, unknown> };
    return typeof document.toObject === 'function'
        ? document.toObject()
        : (value as Record<string, unknown>);
};

const toRefreshToken = (value: unknown): RefreshToken => {
    const { __v: _version, user, ...rest } = toPlainObject(value);

    return {
        ...rest,
        // `user` is stored as an ObjectId; the core contract exposes it as a
        // string, matching `User.id` and `AuditLogInterface.user`.
        user: user === null || user === undefined ? (user as unknown as string) : String(user),
    } as RefreshToken;
};

const toRefreshTokenOrNull = (value: unknown): RefreshToken | null =>
    value === null || value === undefined ? null : toRefreshToken(value);

const omitUndefined = (input: object): Record<string, unknown> =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

/**
 * Translate a storage-neutral refresh-token filter into a Mongo query.
 *
 * An empty result is intentional: Mongo treats `{}` as "match any document",
 * which keeps `findOne` and conditional updates consistent with the driver.
 * `deleteMany` adds an explicit guard because an unbounded delete is
 * destructive.
 */
const buildTokenFilter = (filter: Partial<RefreshToken>): Record<string, unknown> =>
    omitUndefined(filter);

/**
 * `id` and the timestamp columns are managed by the database. Strip them so a
 * caller cannot reassign document identity or immutable timestamp fields.
 */
const buildTokenUpdate = (updates: Partial<RefreshToken>): Record<string, unknown> => {
    const {
        id: _id,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
    } = updates as Partial<RefreshToken> & {
        id?: string;
        createdAt?: Date;
        updatedAt?: Date;
    };

    return omitUndefined(rest);
};

const isDuplicateKeyError = (error: unknown): error is MongoErrorLike =>
    typeof error === 'object' &&
    error !== null &&
    (error as MongoErrorLike).code === 11000;

const duplicateKeyField = (error: MongoErrorLike): string | undefined => {
    const source = error.keyPattern ?? error.keyValue;

    if (!source) {
        return undefined;
    }

    return Object.keys(source)[0];
};

export const createRefreshTokenAdapter = (
    RefreshTokenModel: MongooseModel,
): RefreshTokenDatabaseAdapter => {
    return {
        findOne: async (filter) => {
            const document = await RefreshTokenModel.findOne(buildTokenFilter(filter))
                .setOptions({ strictQuery: false })
                .lean()
                .exec();

            return toRefreshTokenOrNull(document);
        },

        create: async (token) => {
            try {
                // Token lookup fields are part of the core contract. Writing
                // with `strict: false` keeps older host schemas that predate
                // them working without dropping the values.
                const document = new RefreshTokenModel(token, undefined, { strict: false });
                const saved = await document.save();
                return toRefreshToken(saved);
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    throw new DuplicateKeyError(duplicateKeyField(error));
                }

                throw error;
            }
        },

        delete: async (token) => {
            await RefreshTokenModel.deleteOne({ token }).exec();
        },

        update: async (id, updates) => {
            try {
                const document = await RefreshTokenModel.findByIdAndUpdate(
                    id,
                    { $set: buildTokenUpdate(updates) },
                    { returnDocument: 'after', runValidators: true, strict: false },
                )
                    .lean()
                    .exec();

                // The core interface declares a non-null result; a missing token
                // here is a concurrent-deletion race, which the existing fake
                // adapters also surface as `null`.
                return toRefreshTokenOrNull(document) as RefreshToken;
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    throw new DuplicateKeyError(duplicateKeyField(error));
                }

                throw error;
            }
        },

        findOneAndUpdate: async (condition, updation) => {
            // Atomic compare-and-set: only the caller that matches the
            // condition receives the document, which is what makes refresh
            // token rotation and reuse detection race-free.
            try {
                const document = await RefreshTokenModel.findOneAndUpdate(
                    buildTokenFilter(condition),
                    { $set: buildTokenUpdate(updation) },
                    {
                        returnDocument: 'after',
                        runValidators: true,
                        strict: false,
                        strictQuery: false,
                    },
                )
                    .lean()
                    .exec();

                return toRefreshTokenOrNull(document);
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    throw new DuplicateKeyError(duplicateKeyField(error));
                }

                throw error;
            }
        },

        deleteMany: async (filter) => {
            const query = buildTokenFilter(filter);

            // Deleting without a filter would wipe every refresh token, so the
            // adapter refuses the unbounded form while reads and conditional
            // updates keep Mongo's match-any semantics.
            if (Object.keys(query).length === 0) {
                throw new Error('deleteMany requires at least one filter field');
            }

            await RefreshTokenModel.deleteMany(query).exec();
        },
    };
};
