import {
    DuplicateKeyError,
    type CreateUserInput,
    type User,
    type UserDatabaseAdapter,
    type UserQuery,
} from '@cred/core';
import type { Model } from 'mongoose';
import { toMongoFilter } from '../helpers/database.helper.js';

/**
 * The concrete document type depends on the schema supplied by the host
 * application, while `User` is the storage-neutral contract owned by core.
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

const toUser = (value: unknown): User => {
    const { _id, __v: _version, ...rest } = toPlainObject(value);

    if (_id === undefined || _id === null) {
        throw new Error('Cannot map a user document without an _id');
    }

    return { ...rest, id: String(_id) } as User;
};

const toUserOrNull = (value: unknown): User | null => (value === null || value === undefined ? null : toUser(value));

const omitUndefined = (input: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));

const buildUserFilter = (filter: Partial<User>): Record<string, unknown> =>
    toMongoFilter(filter);

/**
 * `UserQuery` values may be comparison operators (`$gt`, `$lte`, ...) rather
 * than plain scalars. Mongoose receives them untouched so time-based
 * conditional updates stay atomic.
 *
 * An empty condition maps to `{}`, which Mongo treats as "match any document".
 * That mirrors `findOne` instead of rejecting filters that only contain
 * undefined values.
 */
const buildUserCondition = (condition: UserQuery): Record<string, unknown> => {
    const { id, ...rest } = condition;
    const query = omitUndefined(rest);

    if (id !== undefined) {
        query._id = id;
    }

    return query;
};

/**
 * `id`, `createdAt` and `updatedAt` are managed by the adapter/database. Strip
 * them so a caller cannot reassign the document identity or immutable
 * timestamp fields.
 *
 * A `null`/empty `password` is also stripped: the "local accounts need a
 * password" rule lives in a pre-save hook, which does not run on the update
 * paths below, so clearing the password must be impossible here too.
 */
const buildUserUpdate = (updates: Partial<User>): Record<string, unknown> => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, password, ...rest } = updates;
    const clean = omitUndefined(rest as Record<string, unknown>);

    if (typeof password === 'string' && password.length > 0) {
        clean.password = password;
    }

    return clean;
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

export const createUserAdapter = (UserModel: MongooseModel): UserDatabaseAdapter => {
    return {
        findOne: async (filter) => {
            const document = await UserModel.findOne(buildUserFilter(filter))
                .setOptions({ strictQuery: false })
                .lean()
                .exec();

            return toUserOrNull(document);
        },

        create: async (user: CreateUserInput) => {
            try {
                // The core contract includes token lookup fields that are not
                // necessarily present in every schema revision. Writing with
                // `strict: false` keeps those fields persisted without the
                // adapter having to know the host application's schema.
                const document = new UserModel(user, undefined, { strict: false });
                const saved = await document.save();
                return toUser(saved);
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    throw new DuplicateKeyError(duplicateKeyField(error));
                }

                throw error;
            }
        },

        delete: async (id) => {
            await UserModel.deleteOne({ _id: id }).exec();
        },

        update: async (id, updates) => {
            try {
                const document = await UserModel.findByIdAndUpdate(
                    id,
                    { $set: buildUserUpdate(updates) },
                    { returnDocument: 'after', runValidators: true, strict: false },
                )
                    .lean()
                    .exec();

                // The core interface declares a non-null result; a missing user
                // here is a concurrent-deletion race, which the existing fake
                // adapters also surface as `null`.
                return toUserOrNull(document) as User;
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    throw new DuplicateKeyError(duplicateKeyField(error));
                }

                throw error;
            }
        },

        findOneByTwoConditions: async (filter1, filter2) => {
            const filters = [filter1, filter2]
                .map((filter) => omitUndefined(filter as Record<string, unknown>))
                .filter((filter) => Object.keys(filter).length > 0)
                .map((filter) => buildUserFilter(filter as Partial<User>));

            if (filters.length === 0) {
                return null;
            }

            const query = filters.length === 1 ? filters[0] : { $or: filters };
            const document = await UserModel.findOne(query)
                .setOptions({ strictQuery: false })
                .lean()
                .exec();

            return toUserOrNull(document);
        },

        incrementLoginAttempts: async (id) => {
            const document = await UserModel.findByIdAndUpdate(
                id,
                { $inc: { loginAttempts: 1 } },
                { returnDocument: 'after' },
            )
                .lean()
                .exec();

            if (!document) {
                return 0;
            }

            const attempts = (document as Record<string, unknown>).loginAttempts;
            return typeof attempts === 'number' ? attempts : 0;
        },

        findOneAndUpdate: async (condition, updates) => {
            try {
                const document = await UserModel.findOneAndUpdate(
                    buildUserCondition(condition),
                    { $set: buildUserUpdate(updates) },
                    {
                        returnDocument: 'after',
                        runValidators: true,
                        strict: false,
                        strictQuery: false,
                    },
                )
                    .lean()
                    .exec();

                return toUserOrNull(document);
            } catch (error) {
                if (isDuplicateKeyError(error)) {
                    throw new DuplicateKeyError(duplicateKeyField(error));
                }

                throw error;
            }
        },
    };
};
