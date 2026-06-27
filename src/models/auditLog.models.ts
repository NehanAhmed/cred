import mongoose from 'mongoose';
import { AUDIT_ACTIONS } from '../types/audit.types';

const auditLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    action: {
      type: String,
      required: true,
      enum: AUDIT_ACTIONS,
    },
    status: {
      type: String,
      required: true,
      enum: ['success', 'failure'],
    },
    ip: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    provider: {
      type: String,
      enum: ['local', 'google', 'github', null],
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const auditLogModel = mongoose.model('AuditLog', auditLogSchema);

export default auditLogModel;
