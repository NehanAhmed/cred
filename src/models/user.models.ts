import mongoose from 'mongoose';

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
    resetPasswordToken: {
      type: String,
      default: null,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
    },
    googleId: {
      type: String,
      default: null,
    },
    githubId: {
      type: String,
      default: null,
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
  },
  { timestamps: true }
);

userSchema.index({ verificationToken: 1, verificationTokenExpires: 1 });
userSchema.index({ resetPasswordToken: 1, resetPasswordExpires: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ githubId: 1 });

userSchema.pre('save', async function () {
  if (this.provider === 'local' && !this.password) {
    throw new Error('Password is required for local accounts');
  }
});

const userModel = mongoose.model('User', userSchema);

export default userModel;
