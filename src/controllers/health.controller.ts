import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { sendSuccess, sendError } from '../helpers/api.helpers';

const PING_TIMEOUT_MS = 3000;
const startTime = Date.now();

const DB_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export const healthCheck = async (_req: Request, res: Response) => {
  try {
    const dbState = mongoose.connection.readyState;
    const isConnected = dbState === 1;

    let dbStatus = DB_STATES[dbState] ?? 'unknown';
    let dbLatency: number | null = null;

    if (isConnected && mongoose.connection.db) {
      const pingStart = Date.now();
      try {
        await Promise.race([
          mongoose.connection.db.admin().command({ ping: 1 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS)
          ),
        ]);
        dbLatency = Date.now() - pingStart;
      } catch {
        dbStatus = 'slow';
        dbLatency = null;
      }
    }

    const healthData = {
      name: 'cred',
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      database: {
        status: dbStatus,
        latency: dbLatency,
        state: dbStatus,
      },
      timestamp: new Date().toISOString(),
    };

    if (!isConnected) {
      return res.status(503).json({
        success: false,
        message: 'Service is degraded — database not connected',
        error: 'Service is degraded — database not connected',
        data: healthData,
      });
    }

    return sendSuccess(res, healthData, 'Service is healthy', 200);
  } catch (error) {
    return sendError(res, 'Health check failed', 500);
  }
};
