import mongoose, { type Connection } from 'mongoose';
import type { UserDatabaseAdapter, RefreshTokenDatabaseAdapter, AuditDatabaseAdapter } from '@cred-kit/core';
import { getUserModel } from './models/user.model.js';
import { getRefreshModel } from './models/refresh-token.model.js';
import { getAuditModel } from './models/audit-log.model.js';
import { createUserAdapter } from './adapters/user.adapter.js';
import { createRefreshTokenAdapter } from './adapters/refreshToken.adapter.js';
import { createAuditAdapter } from './adapters/auditLog.adapter.js'


export type MongooseStorageOptions =
    | { uri: string; connection?: never }
    | { connection: Connection; uri?: never };

export interface MongooseStorage {
    user: UserDatabaseAdapter;
    refreshToken: RefreshTokenDatabaseAdapter;
    auditLogs: AuditDatabaseAdapter;
    ready: () => Promise<void>;
    close: () => Promise<void>;
}

export function mongooseStorage(options: MongooseStorageOptions): MongooseStorage {
    let connection: Connection;
    let owned = false;

    if (options.connection) {
        connection = options.connection;
    } else {
        if (!options.uri || typeof options.uri !== 'string') {
            throw new Error('mongooseStorage: "uri" or "connection" is required');
        }
        connection = mongoose.createConnection(options.uri);
        owned = true;
    }

    return {
        user: createUserAdapter(getUserModel(connection)),
        refreshToken: createRefreshTokenAdapter(getRefreshModel(connection)),
        auditLogs: createAuditAdapter(getAuditModel(connection)),
        ready: async () => {
            await connection.asPromise();
        },
        close: async () => {
            if (owned) await connection.close();
        },
    };
}