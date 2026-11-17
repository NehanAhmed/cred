import mongoose, { Connection, Model } from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: false,
    },
    bio: {
      type: String,
      required: false,
    },
    phoneNumber: {
      type: String,
      required: false,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', null],
      default: null,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationToken: {
      type: String,
      default: null,
    },
    verificationTokenExpires: {
      type: Date,
      default: null,
    },
    verificationTokenLookup: {
      type: String,
      default: null,
    },
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    resetPasswordTokenLookup: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
    },
    githubId: {
      type: String,
    },
    provider: {
      type: String,
      enum: ['local', 'github', 'google'],
      default: 'local',
    },
    avatar: {
      type: String,
      default: null,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockoutUntil: {
      type: Date,
      default: null,
    },
    lastLogin: {
      type: Date,
      default: null,
    },
    lastIp: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// The legacy hashed-token lookups moved to the opaque `*Lookup` ids, so the
// old compound indexes are dropped. The lookup fields are only ever compared
// by equality and are `null` for most users, hence the partial unique indexes
// (a sparse index would still collide on explicit `null` values).
userSchema.index(
  { verificationTokenLookup: 1 },
  { unique: true, partialFilterExpression: { verificationTokenLookup: { $type: 'string' } } },
);
userSchema.index(
  { resetPasswordTokenLookup: 1 },
  { unique: true, partialFilterExpression: { resetPasswordTokenLookup: { $type: 'string' } } },
);
userSchema.index({ googleId: 1 }, { unique: true, sparse: true });
userSchema.index({ githubId: 1 }, { unique: true, sparse: true });

userSchema.pre('save', async function () {
  if (this.provider === 'local' && !this.password) {
    throw new Error('Password is required for local accounts');
  }
});

export function getUserModel(connection: Connection, name = 'CredUser', collection = 'User') {
  return (connection.models[name] as Model<any>) ?? connection.model(name, userSchema, collection);
}