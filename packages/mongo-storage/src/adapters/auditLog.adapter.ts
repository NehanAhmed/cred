import {
    type AuditDatabaseAdapter,
    type AuditLogFilter,
    type AuditLogInterface,
} from '@cred-kit/core';
import type { Model } from 'mongoose';

/**
 * The concrete document type depends on the schema supplied by the host
 * application, while `AuditLogInterface` is the storage-neutral contract owned
 * by core.
 */
type MongooseModel = Model<any>;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 1000;

const toPlainObject = (value: unknown): Record<string, unknown> => {
    if (value === null || typeof value !== 'object') {
        throw new TypeError('Expected a Mongoose document or a plain object');
    }

    const document = value as { toObject?: () => Record<string, unknown> };
    return typeof document.toObject === 'function'
        ? document.toObject()
        : (value as Record<string, unknown>);
};

const toAuditLog = (value: unknown): AuditLogInterface => {
    // `_id` and `__v` are storage internals; the core contract exposes plain
    // objects without them. Consumers needing a stable id can read `createdAt`
    // alongside the deterministic `_id` tie-breaker used for pagination.
    const { _id: _documentId, __v: _version, user, ...rest } = toPlainObject(value);

    return {
        ...rest,
        // `user` is stored as an ObjectId; the core contract exposes it as a
        // string or `null` for system/anonymous events.
        user: user === null || user === undefined ? null : String(user),
    } as AuditLogInterface;
};

const buildAuditFilter = (filter: AuditLogFilter): Record<string, unknown> =>
    filter.user === undefined ? {} : { user: filter.user };

const toPageOffset = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }

    return Math.max(0, Math.trunc(value));
};

const toPageSize = (value: number): number => {
    if (!Number.isFinite(value)) {
        return DEFAULT_LIMIT;
    }

    // A MongoDB limit of 0 means "unlimited", so never emit it from an
    // untrusted pagination value.
    return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(value)));
};

export const createAuditAdapter = (AuditLogModel: MongooseModel): AuditDatabaseAdapter => {
    return {
        create: async (audit) => {
            const document = new AuditLogModel(audit);
            const saved = await document.save();
            return toAuditLog(saved);
        },

        find: async (filter, options) => {
            const documents = await AuditLogModel.find(buildAuditFilter(filter))
                // `_id` is a stable tie-breaker for entries created within the
                // same millisecond, keeping pagination deterministic.
                .sort({ createdAt: -1, _id: -1 })
                .skip(toPageOffset(options.skip))
                .limit(toPageSize(options.limit))
                .lean()
                .exec();

            return documents.map(toAuditLog);
        },

        count: async (filter) => {
            return AuditLogModel.countDocuments(buildAuditFilter(filter)).exec();
        },
    };
};
