import mongoose, { Connection, Model } from 'mongoose';
import { REFRESH_TOKEN_MODEL_NAME, USER_MODEL_NAME } from './model-names.js';

const refreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true
    },
    /**
     * Public, non-secret half of the raw refresh token. It lets the adapter
     * find the candidate document before the bcrypt hash is verified.
     */
    lookupId: {
      type: String,
      default: null
    },
    /** Public lookup id used to find the token before bcrypt verification. */
    lookupId: {
      type: String,
      default: null,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: USER_MODEL_NAME,
      required: true
    },
    family: {
      type: String,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true
    },
    consumed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ token: 1 }, { unique: true });
refreshTokenSchema.index(
  { lookupId: 1 },
  {
    unique: true,
    partialFilterExpression: { lookupId: { $type: 'string' } }
  }
);
refreshTokenSchema.index({ user: 1, family: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export function getRefreshModel(
  connection: Connection,
  name = REFRESH_TOKEN_MODEL_NAME,
  collection = 'RefreshToken'
) {
  return (
    (connection.models[name] as Model<any>) ??
    connection.model(name, refreshTokenSchema, collection)
  );
}
