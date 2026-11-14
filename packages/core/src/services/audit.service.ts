import { AuditDatabaseAdapter } from "../types/deps.types.js";

export async function getAuditLogs(
    input: { userId: string, page?: number, limit?: number },
    deps: { auditDatabase: AuditDatabaseAdapter }
) {
    const page = Math.max(1, input.page || 1);
    const limit = Math.min(100, Math.max(1, input.limit || 20));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        deps.auditDatabase.find({ user: input.userId }, { skip, limit }),
        deps.auditDatabase.count({ user: input.userId }),
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    };
}
