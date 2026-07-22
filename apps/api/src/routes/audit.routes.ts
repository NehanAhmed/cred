import express from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { getAuditLogs } from '../controllers/audit.controllers.js';

const router = express.Router();

router.get('/me/audit-logs', authMiddleware, getAuditLogs);

export default router;
