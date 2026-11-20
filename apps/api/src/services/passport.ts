import passport from 'passport';
import { Strategy as GoogleStrategy, VerifyCallback } from 'passport-google-oauth20';
import { Strategy as GitHubStrategy } from 'passport-github2';
import userModel from '../models/user.models.js';
import crypto from 'crypto';
import { logAuditEvent } from '../helpers/audit.helpers.js';

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
  avatar: string | undefined,
  isEmailVerified: boolean
) => {
  const providerField = provider === 'google' ? 'googleId' : 'githubId';

  let user = await userModel.findOne({ [providerField]: profileId });
  if (user) return user;

  // Email-based linking requires the OAuth provider to have verified the
  // address. Linking on an unverified email is an account-takeover vector:
  // anyone who controls the address on the provider side could claim an
  // existing account. Unverified emails fall through to account creation,
  // which fails cleanly on a duplicate email.
  if (email && isEmailVerified) {
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

export function initializePassport(): void {
  const googleClientID = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (googleClientID && googleClientSecret) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: googleClientID,
          clientSecret: googleClientSecret,
          callbackURL: `${process.env.BACKEND_URL}/api/auth/google/callback`,
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
              profile.photos?.[0]?.value,
              // The OIDC `email_verified` claim from the provider.
              profile.emails?.[0]?.verified === true
            );
            done(null, user);
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  } else {
    console.warn('Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET. Google login disabled.');
  }

  const githubClientID = process.env.GITHUB_OAUTH_CLIENT_ID;
  const githubClientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;

  if (githubClientID && githubClientSecret) {
    passport.use(
      new GitHubStrategy(
        {
          clientID: githubClientID,
          clientSecret: githubClientSecret,
          callbackURL: `${process.env.BACKEND_URL}/api/auth/github/callback`,
          scope: ['user:email'],
          // Return every email with its `primary`/`verified` flags so the
          // callback can ignore unverified addresses instead of trusting the
          // first entry (which passport-github2 would otherwise expose).
          allRawEmails: true,
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: { id: string; displayName?: string; username?: string; emails?: { value: string; primary?: boolean; verified?: boolean }[]; photos?: { value: string }[] },
          done: VerifyCallback
        ) => {
          try {
            // Prefer the verified primary address, then any verified address.
            // An email without a verified flag is never used for linking.
            const primaryVerified = profile.emails?.find(
              (entry) => entry.primary && entry.verified === true
            );
            const anyVerified = profile.emails?.find((entry) => entry.verified === true);
            const email = primaryVerified?.value ?? anyVerified?.value;

            const user = await findOrCreateOAuthUser(
              'github',
              profile.id,
              email,
              profile.displayName ||
                profile.username ||
                email?.split('@')[0] ||
                'user',
              profile.photos?.[0]?.value,
              email !== undefined
            );
            done(null, user);
          } catch (error) {
            done(error as Error);
          }
        }
      )
    );
  } else {
    console.warn('Missing GITHUB_OAUTH_CLIENT_ID or GITHUB_OAUTH_CLIENT_SECRET. GitHub login disabled.');
  }
}

export default passport;
