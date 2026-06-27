import { Request, Response } from 'express';
import auditLogModel from '../models/auditLog.models';
import { sendError, sendSuccess } from '../helpers/api.helpers';

export const getAuditLogs = async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      auditLogModel
        .find({ user: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      auditLogModel.countDocuments({ user: req.user.id }),
    ]);

    return sendSuccess(
      res,
      {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      'Audit logs fetched successfully',
      200
    );
  } catch {
    return sendError(res, 'Internal server error', 500);
  }
};
