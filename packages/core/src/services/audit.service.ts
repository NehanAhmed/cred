import { AuditDatabaseAdapter } from "../types/deps.types.js";
import { resolveConfig, type CredConfig } from "../config.js";

const toFiniteInteger = (value: number | undefined, fallback: number): number => {
    return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
};

export async function getAuditLogs(
    input: { userId: string, page?: number, limit?: number },
    deps: { auditDatabase: AuditDatabaseAdapter },
    config: Partial<CredConfig> = {}
) {
    const cfg = resolveConfig(config);
    const page = Math.max(1, toFiniteInteger(input.page, 1));
    const limit = Math.min(cfg.auditMaxLimit, Math.max(1, toFiniteInteger(input.limit, cfg.auditDefaultLimit)));
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
