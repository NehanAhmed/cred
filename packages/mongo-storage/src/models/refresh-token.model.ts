import mongoose, { Model } from 'mongoose';
import { Connection } from 'mongoose';

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    family: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    consumed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ token: 1 });
refreshTokenSchema.index({ user: 1, family: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function getRefreshModel(connection: Connection, name = 'CredRefreshToken', collection = 'RefreshToken') {
  return (connection.models[name] as Model<any>) ?? connection.model(name, refreshTokenSchema, collection);
}
