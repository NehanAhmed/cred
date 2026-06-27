import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { getAuditLogs } from '../controllers/audit.controllers';

const router = express.Router();

router.get('/me/audit-logs', authMiddleware, getAuditLogs);

export default router;
