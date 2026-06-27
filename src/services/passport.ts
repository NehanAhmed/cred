import passport from 'passport';
import { Strategy as GoogleStrategy, VerifyCallback } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import userModel from '../models/user.models';
import crypto from 'crypto';
import { logAuditEvent } from '../helpers/audit.helpers';

const generateUniqueUsername = async (base: string): Promise<string> => {
  const sanitized = base
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 25) || `user_${crypto.randomBytes(4).toString('hex')}`;

  const exists = await userModel.findOne({ username: sanitized });
  if (!exists) return sanitized;

  const suffix = crypto.randomBytes(3).toString('hex');
  return `${sanitized}_${suffix}`;
};

const findOrCreateOAuthUser = async (
  provider: 'google' | 'github',
  profileId: string,
  email: string | undefined,
  displayName: string,
  avatar: string | undefined
) => {
  const providerField = provider === 'google' ? 'googleId' : 'githubId';

  let user = await userModel.findOne({ [providerField]: profileId });
  if (user) return user;

  if (email) {
    user = await userModel.findOne({ email: email.toLowerCase() });
    if (user) {
      const wasLocal = user.provider === 'local';
      user.set(providerField, profileId);
      if (!user.avatar) user.avatar = avatar || null;
      if (wasLocal) user.provider = provider;
      const saved = await user.save();
      if (wasLocal) {
        logAuditEvent({
          userId: saved._id.toString(),
          action: 'oauth_login',
          status: 'success',
          provider,
          metadata: { reason: 'Account linked to existing local user by email' },
        }).catch(() => {});
      }
      return saved;
    }
  }

  const username = await generateUniqueUsername(
    displayName || email?.split('@')[0] || 'user'
  );

  return await userModel.create({
    username,
    email: email || `${profileId}@${provider}.oauth`,
    password: crypto.randomBytes(32).toString('hex'),
    provider,
    [providerField]: profileId,
    avatar: avatar || null,
    isVerified: true,
  });
};

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      callbackURL: '/api/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile, done: VerifyCallback) => {
      try {
        const user = await findOrCreateOAuthUser(
          'google',
          profile.id,
          profile.emails?.[0]?.value,
          profile.displayName ||
            profile.name?.givenName ||
            profile.emails?.[0]?.value?.split('@')[0] ||
            'user',
          profile.photos?.[0]?.value
        );
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_OAUTH_CLIENT_ID!,
      clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET!,
      callbackURL: '/api/auth/github/callback',
      scope: ['user:email'],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: { id: string; displayName?: string; username?: string; emails?: { value: string }[]; photos?: { value: string }[] },
      done: VerifyCallback
    ) => {
      try {
        const email = profile.emails?.[0]?.value;

        const user = await findOrCreateOAuthUser(
          'github',
          profile.id,
          email,
          profile.displayName ||
            profile.username ||
            email?.split('@')[0] ||
            'user',
          profile.photos?.[0]?.value
        );
        done(null, user);
      } catch (error) {
        done(error as Error);
      }
    }
  )
);

export default passport;
