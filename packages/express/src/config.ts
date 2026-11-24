import {
  assertJwtSecret,
  resolveConfig as resolveCoreConfig,
  type AuditDatabaseAdapter,
  type CredConfig,
  type EmailAdapter,
  type RefreshTokenDatabaseAdapter,
  type UserDatabaseAdapter
} from '@cred-kit/core';
import type { MongooseStorageOptions } from '@cred-kit/mongo-storage';
import type { emailServiceOptions } from '@cred-kit/smtp';
import type { Store } from 'express-rate-limit';

const PREFIX = '@cred-kit/express';

/** Cookie `sameSite` values accepted by the adapter. */
export type CredSameSite = 'strict' | 'lax' | 'none';

/**
 * Prebuilt storage adapters for hosts that implement the core storage
 * contract themselves (for example a SQL backend).
 */
export interface CredDatabaseConfig {
  /** User storage adapter. */
  user: UserDatabaseAdapter;
  /** Refresh-token storage adapter. */
  refreshToken: RefreshTokenDatabaseAdapter;
  /**
   * Optional audit-log storage adapter. Without it, audit writes are dropped
   * (core's documented fire-and-forget behaviour) and the audit-log route
   * responds with `503`.
   */
  audit?: AuditDatabaseAdapter;
}

/** Connection options for the bundled `@cred-kit/mongo-storage` adapter. */
export type CredMongoStorageOptions = MongooseStorageOptions;

/**
 * Storage configuration: either MongoDB options that the adapter builds into
 * `@cred-kit/mongo-storage`, or prebuilt core adapters for another backend.
 */
export type CredDatabaseInput = CredMongoStorageOptions | CredDatabaseConfig;

/** Options for the bundled `@cred-kit/smtp` email service. */
export type CredEmailServiceOptions = emailServiceOptions;

/**
 * Email configuration: either `@cred-kit/smtp` options that the adapter builds
 * into a core `EmailAdapter`, or a prebuilt adapter.
 */
export type CredEmailInput = CredEmailServiceOptions | EmailAdapter;

/** Resolved storage configuration, normalized for runtime construction. */
export type ResolvedCredDatabase =
  | { kind: 'mongoose'; options: CredMongoStorageOptions }
  | { kind: 'custom'; adapters: CredDatabaseConfig };

/** Resolved email configuration, normalized for runtime construction. */
export type ResolvedCredEmail =
  | { kind: 'email-service'; options: CredEmailServiceOptions }
  | { kind: 'custom'; adapter: EmailAdapter };

export interface CredOAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

/** Optional OAuth providers. A provider is enabled only when both fields are set. */
export interface CredOAuthConfig {
  google?: CredOAuthProviderConfig;
  github?: CredOAuthProviderConfig;
}

export interface CredCookieConfig {
  /** Access-token cookie name. Defaults to `token`. */
  accessTokenName?: string;
  /** Refresh-token cookie name. Defaults to `refreshToken`. */
  refreshTokenName?: string;
  /**
   * `Secure` flag for auth cookies. Defaults to `NODE_ENV === 'production'`.
   * Enable this whenever the API is served over HTTPS.
   */
  secure?: boolean;
  /** SameSite policy for standard auth cookies. Defaults to `strict`. */
  sameSite?: CredSameSite;
  /** Optional cookie domain (for example `.example.com`). */
  domain?: string;
  /** Access-token cookie path. Defaults to `/`. */
  accessTokenPath?: string;
  /** Access-token cookie lifetime. Defaults to 15 minutes. */
  accessTokenMaxAgeMs?: number;
  /**
   * Refresh-token cookie lifetime. Defaults to core's `refreshTokenTtlMs`
   * (7 days unless overridden through `core`).
   */
  refreshTokenMaxAgeMs?: number;
}

/** Options for the optional health-check route mounted on the router. */
export interface CredHealthConfig {
  /**
   * Whether to mount the health route. Defaults to `true`. Set to `false` to
   * disable the route entirely.
   */
  enabled?: boolean;
  /**
   * Optional host-supplied check. When set, the router calls it on each
   * request and returns `503` if the promise rejects. The built-in default
   * only reports the adapter's own health with a simple `{ status: 'ok' }`
   * envelope.
   */
  check?: () => Promise<void>;
  /**
   * Per-second budget for the health route. Defaults to a 60-second window
   * allowing 30 requests, matching the shipped API.
   */
  rateLimit?: Partial<CredRateLimitRule>;
}

/** Resolved health-check configuration used at runtime. */
export interface ResolvedCredHealthConfig {
  enabled: boolean;
  check: () => Promise<void>;
  rateLimit: CredRateLimitRule;
}

export interface CredRateLimitRule {
  windowMs: number;
  max: number;
  message: string;
}

export interface CredRateLimits {
  auth: CredRateLimitRule;
  login: CredRateLimitRule;
  register: CredRateLimitRule;
  forgotPassword: CredRateLimitRule;
  refresh: CredRateLimitRule;
  verifyEmail: CredRateLimitRule;
  resetPassword: CredRateLimitRule;
  logout: CredRateLimitRule;
  oauth: CredRateLimitRule;
  profile: CredRateLimitRule;
  profileUpdate: CredRateLimitRule;
}

export type CredRateLimitsInput = {
  [K in keyof CredRateLimits]?: Partial<CredRateLimitRule>;
};

/**
 * Creates one rate-limit store per limiter. Supply a shared backend store
 * (Redis, a database, ...) for multi-process deployments. The factory is
 * called once for each limiter because `express-rate-limit` rejects sharing a
 * single store instance between limiter instances.
 */
export type CredRateLimitStoreFactory = () => Store;

/** Minimal logger contract; `console` satisfies it. */
export interface CredErrorLogger {
  error(...args: unknown[]): void;
}

/**
 * Host-supplied configuration for {@link credExpress}.
 *
 * By default the adapter builds the official `@cred-kit/mongo-storage` and
 * `@cred-kit/smtp` implementations from the supplied options and injects them
 * into `@cred-kit/core`. Prebuilt core adapters can be supplied instead when the
 * host uses a different backend.
 */
export interface CredExpressConfig {
  database: CredDatabaseInput;
  email: CredEmailInput;
  /** HS256 signing secret. Must be at least 32 characters (enforced by core). */
  jwtSecret: string;
  /** Frontend origin used for email-verification and OAuth redirects. */
  clientUrl: string;
  /** Public API origin used to build OAuth callback URLs. */
  backendUrl: string;
  /**
   * Public path where this router is mounted. Defaults to `/api`.
   *
   * The same value scopes the refresh cookie and builds OAuth callback URLs,
   * so it must match the path passed to `app.use(...)`.
   */
  basePath?: string;
  oauth?: CredOAuthConfig;
  cookies?: CredCookieConfig;
  rateLimits?: CredRateLimitsInput;
  /**
   * Factory for the rate-limit store. Called once per limiter so each limiter
   * gets its own instance. Defaults to `express-rate-limit`'s in-memory store;
   * supply a shared backend for multi-process deployments.
   */
  rateLimitStoreFactory?: CredRateLimitStoreFactory;
  /** Core tunables (token lifetimes, bcrypt rounds, lockout policy, ...). */
  core?: Partial<CredConfig>;
  /** JSON body limit for the mounted router. Defaults to `10kb`. */
  jsonBodyLimit?: string;
  /** Optional error logger; defaults to `console`. */
  logger?: CredErrorLogger;
  /** Optional health-check route configuration. Enabled by default. */
  health?: CredHealthConfig;
}

export interface ResolvedCredCookieConfig {
  accessTokenName: string;
  refreshTokenName: string;
  secure: boolean;
  sameSite: CredSameSite;
  domain?: string;
  accessTokenPath: string;
  accessTokenMaxAgeMs: number;
  refreshTokenMaxAgeMs: number;
}

/** Fully validated configuration used by the router and controllers. */
export interface ResolvedCredExpressConfig {
  database: ResolvedCredDatabase;
  email: ResolvedCredEmail;
  jwtSecret: string;
  clientUrl: string;
  backendUrl: string;
  basePath: string;
  oauth: CredOAuthConfig;
  cookies: ResolvedCredCookieConfig;
  rateLimits: CredRateLimits;
  rateLimitStoreFactory?: CredRateLimitStoreFactory;
  core: CredConfig;
  jsonBodyLimit: string;
  logger: CredErrorLogger;
  health: ResolvedCredHealthConfig;
}

/**
 * Default rate limits, matching the shipped API. Each route also passes
 * through the global `auth` or `profile` limiter, so the tighter rule wins.
 */
export const defaultCredRateLimits: CredRateLimits = {
  auth: {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many authentication attempts, please try again later.'
  },
  login: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again in 15 minutes.'
  },
  register: {
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many registration attempts, please try again in 60 minutes.'
  },
  forgotPassword: {
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Too many password reset attempts, please try again in 60 minutes.'
  },
  refresh: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many refresh attempts, please try again in 15 minutes.'
  },
  verifyEmail: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many verification attempts, please try again later.'
  },
  resetPassword: {
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many password reset attempts, please try again later.'
  },
  logout: {
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many logout attempts, please try again later.'
  },
  oauth: {
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: 'Too many OAuth attempts, please try again later.'
  },
  profile: {
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many profile requests, please try again later.'
  },
  profileUpdate: {
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: 'Too many profile update attempts, please try again later.'
  }
};

const USER_ADAPTER_METHODS = [
  'findOne',
  'create',
  'delete',
  'update',
  'findOneByTwoConditions',
  'incrementLoginAttempts',
  'findOneAndUpdate'
] as const;

const REFRESH_ADAPTER_METHODS = [
  'findOne',
  'create',
  'delete',
  'update',
  'findOneAndUpdate',
  'deleteMany'
] as const;

const AUDIT_ADAPTER_METHODS = ['create', 'find', 'count'] as const;
const EMAIL_ADAPTER_METHODS = ['sendEmailVerification', 'sendPasswordReset'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const readRequiredString = (name: string, value: unknown): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${PREFIX}: "${name}" is required and must be a non-empty string`);
  }

  return value.trim();
};

const readOptionalString = (name: string, value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  return readRequiredString(name, value);
};

const stripTrailingSlashes = (value: string): string => {
  let end = value.length;

  while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) {
    end -= 1;
  }

  return value.slice(0, end);
};

const readUrl = (name: string, value: unknown): string => {
  const raw = readRequiredString(name, value);

  let url: URL;
  try {
    url = new URL(raw);
  } catch (error) {
    throw new Error(`${PREFIX}: "${name}" must be an absolute URL, received "${raw}"`, {
      cause: error
    });
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${PREFIX}: "${name}" must use http or https, received "${url.protocol}"`);
  }

  if (url.search !== '' || url.hash !== '') {
    throw new Error(`${PREFIX}: "${name}" must not contain a query string or fragment`);
  }

  return stripTrailingSlashes(url.href);
};

const readBasePath = (value: unknown): string => {
  const raw = readRequiredString('basePath', value);

  if (!raw.startsWith('/')) {
    throw new Error(`${PREFIX}: "basePath" must start with "/", received "${raw}"`);
  }

  if (raw.includes('?') || raw.includes('#') || /\s/.test(raw)) {
    throw new Error(`${PREFIX}: "basePath" must be a plain URL path, received "${raw}"`);
  }

  return stripTrailingSlashes(raw);
};

const readPositiveInteger = (name: string, value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${PREFIX}: "${name}" must be a positive integer, received "${String(value)}"`);
  }

  return value;
};

const readBoolean = (name: string, value: unknown, fallback: boolean): boolean => {
  if (value === undefined) return fallback;

  if (typeof value !== 'boolean') {
    throw new Error(`${PREFIX}: "${name}" must be a boolean, received "${String(value)}"`);
  }

  return value;
};

const readSameSite = (value: unknown): CredSameSite => {
  if (value === undefined) return 'strict';

  if (value !== 'strict' && value !== 'lax' && value !== 'none') {
    throw new Error(
      `${PREFIX}: "cookies.sameSite" must be "strict", "lax", or "none", received "${String(value)}"`
    );
  }

  return value;
};

/**
 * Validates the subset of `bytes` syntax accepted by `express.json({ limit })`
 * so a typo fails at startup instead of on the first request.
 */
const readBodyLimit = (value: unknown): string => {
  const raw = readRequiredString('jsonBodyLimit', value ?? '10kb');

  if (!/^\d+(?:\.\d+)?\s*(?:b|kb|mb|gb|tb|pb)?$/i.test(raw)) {
    throw new Error(
      `${PREFIX}: "jsonBodyLimit" must be a size such as "10kb" or "1mb", received "${raw}"`
    );
  }

  return raw;
};

const assertAdapter = (name: string, value: unknown, methods: readonly string[]): void => {
  if (!isRecord(value)) {
    throw new Error(`${PREFIX}: "${name}" adapter is required`);
  }

  const missing = methods.filter((method) => typeof value[method] !== 'function');

  if (missing.length > 0) {
    throw new Error(
      `${PREFIX}: "${name}" adapter is missing required method(s): ${missing.join(', ')}`
    );
  }
};

const hasDatabaseOptions = (value: Record<string, unknown>): boolean =>
  value.uri !== undefined || value.connection !== undefined;

const hasDatabaseAdapters = (value: Record<string, unknown>): boolean =>
  value.user !== undefined || value.refreshToken !== undefined || value.audit !== undefined;

/**
 * Normalizes the two supported storage inputs into a runtime instruction:
 * build the bundled Mongo adapter, or use host-supplied core adapters.
 */
const resolveDatabase = (value: unknown): ResolvedCredDatabase => {
  if (!isRecord(value)) {
    throw new Error(`${PREFIX}: "database" is required`);
  }

  const hasOptions = hasDatabaseOptions(value);
  const hasAdapters = hasDatabaseAdapters(value);

  if (hasOptions && hasAdapters) {
    throw new Error(
      `${PREFIX}: "database" cannot combine "uri"/"connection" options with prebuilt adapters`
    );
  }

  if (hasOptions) {
    if (value.uri !== undefined && value.connection !== undefined) {
      throw new Error(`${PREFIX}: "database" must set either "uri" or "connection", not both`);
    }

    if (value.uri !== undefined) {
      return {
        kind: 'mongoose',
        options: { uri: readRequiredString('database.uri', value.uri) }
      };
    }

    if (!isRecord(value.connection) || typeof value.connection.asPromise !== 'function') {
      throw new Error(`${PREFIX}: "database.connection" must be a Mongoose Connection`);
    }

    return {
      kind: 'mongoose',
      options: { connection: value.connection } as unknown as CredMongoStorageOptions
    };
  }

  if (hasAdapters) {
    assertAdapter('database.user', value.user, USER_ADAPTER_METHODS);
    assertAdapter('database.refreshToken', value.refreshToken, REFRESH_ADAPTER_METHODS);

    if (value.audit !== undefined) {
      assertAdapter('database.audit', value.audit, AUDIT_ADAPTER_METHODS);
    }

    return {
      kind: 'custom',
      adapters: {
        user: value.user as UserDatabaseAdapter,
        refreshToken: value.refreshToken as RefreshTokenDatabaseAdapter,
        audit: value.audit as AuditDatabaseAdapter | undefined
      }
    };
  }

  throw new Error(
    `${PREFIX}: "database" must provide MongoDB options ("uri" or "connection") or prebuilt adapters ("user" and "refreshToken")`
  );
};

/**
 * Normalizes the two supported email inputs into a runtime instruction: build
 * the bundled `@cred-kit/smtp` service, or use a host-supplied core adapter.
 */
const resolveEmail = (value: unknown): ResolvedCredEmail => {
  if (!isRecord(value)) {
    throw new Error(`${PREFIX}: "email" is required`);
  }

  const hasAdapterShape =
    value.sendEmailVerification !== undefined || value.sendPasswordReset !== undefined;

  if (hasAdapterShape) {
    assertAdapter('email', value, EMAIL_ADAPTER_METHODS);
    return { kind: 'custom', adapter: value as unknown as EmailAdapter };
  }

  if (value.EMAIL_FROM === undefined && value.BACKEND_URL === undefined) {
    throw new Error(
      `${PREFIX}: "email" must provide email service options ("EMAIL_FROM" and "BACKEND_URL") or a prebuilt EmailAdapter`
    );
  }

  return {
    kind: 'email-service',
    options: {
      ...value,
      EMAIL_FROM: readRequiredString('email.EMAIL_FROM', value.EMAIL_FROM),
      BACKEND_URL: readUrl('email.BACKEND_URL', value.BACKEND_URL)
    } as unknown as CredEmailServiceOptions
  };
};

const resolveCookies = (
  overrides: CredCookieConfig | undefined,
  core: CredConfig,
  isProduction: boolean
): ResolvedCredCookieConfig => {
  if (overrides !== undefined && !isRecord(overrides)) {
    throw new Error(`${PREFIX}: "cookies" must be an object`);
  }

  const input: CredCookieConfig = overrides ?? {};
  const secure = readBoolean('cookies.secure', input.secure, isProduction);
  const sameSite = readSameSite(input.sameSite);

  if (sameSite === 'none' && !secure) {
    throw new Error(
      `${PREFIX}: "cookies.sameSite" cannot be "none" while "cookies.secure" is false`
    );
  }

  const accessTokenPath = readRequiredString(
    'cookies.accessTokenPath',
    input.accessTokenPath ?? '/'
  );

  if (!accessTokenPath.startsWith('/')) {
    throw new Error(`${PREFIX}: "cookies.accessTokenPath" must start with "/"`);
  }

  const refreshTokenMaxAgeMs = readPositiveInteger(
    'cookies.refreshTokenMaxAgeMs',
    input.refreshTokenMaxAgeMs ?? core.refreshTokenTtlMs
  );

  return {
    accessTokenName: readRequiredString(
      'cookies.accessTokenName',
      input.accessTokenName ?? 'token'
    ),
    refreshTokenName: readRequiredString(
      'cookies.refreshTokenName',
      input.refreshTokenName ?? 'refreshToken'
    ),
    secure,
    sameSite,
    domain: readOptionalString('cookies.domain', input.domain),
    accessTokenPath,
    accessTokenMaxAgeMs: readPositiveInteger(
      'cookies.accessTokenMaxAgeMs',
      input.accessTokenMaxAgeMs ?? 15 * 60 * 1000
    ),
    refreshTokenMaxAgeMs
  };
};

const resolveOAuth = (oauth: CredOAuthConfig | undefined): CredOAuthConfig => {
  if (oauth === undefined) return {};

  if (!isRecord(oauth)) {
    throw new Error(`${PREFIX}: "oauth" must be an object`);
  }

  const resolved: CredOAuthConfig = {};

  for (const provider of ['google', 'github'] as const) {
    const providerConfig = oauth[provider];
    if (providerConfig === undefined) continue;

    if (!isRecord(providerConfig)) {
      throw new Error(`${PREFIX}: "oauth.${provider}" must be an object`);
    }

    resolved[provider] = {
      clientId: readRequiredString(`oauth.${provider}.clientId`, providerConfig.clientId),
      clientSecret: readRequiredString(
        `oauth.${provider}.clientSecret`,
        providerConfig.clientSecret
      )
    };
  }

  return resolved;
};

const resolveRateLimitRule = (
  name: keyof CredRateLimits,
  defaults: CredRateLimitRule,
  override: Partial<CredRateLimitRule> | undefined
): CredRateLimitRule => {
  if (override !== undefined && !isRecord(override)) {
    throw new Error(`${PREFIX}: "rateLimits.${name}" must be an object`);
  }

  const value = { ...defaults, ...(override ?? {}) };

  return {
    windowMs: readPositiveInteger(`rateLimits.${name}.windowMs`, value.windowMs),
    max: readPositiveInteger(`rateLimits.${name}.max`, value.max),
    message: readRequiredString(`rateLimits.${name}.message`, value.message)
  };
};

/** Merges caller overrides over the default rate-limit table. */
export const resolveCredRateLimits = (overrides: CredRateLimitsInput = {}): CredRateLimits => {
  if (!isRecord(overrides)) {
    throw new Error(`${PREFIX}: "rateLimits" must be an object`);
  }

  return {
    auth: resolveRateLimitRule('auth', defaultCredRateLimits.auth, overrides.auth),
    login: resolveRateLimitRule('login', defaultCredRateLimits.login, overrides.login),
    register: resolveRateLimitRule('register', defaultCredRateLimits.register, overrides.register),
    forgotPassword: resolveRateLimitRule(
      'forgotPassword',
      defaultCredRateLimits.forgotPassword,
      overrides.forgotPassword
    ),
    refresh: resolveRateLimitRule('refresh', defaultCredRateLimits.refresh, overrides.refresh),
    verifyEmail: resolveRateLimitRule(
      'verifyEmail',
      defaultCredRateLimits.verifyEmail,
      overrides.verifyEmail
    ),
    resetPassword: resolveRateLimitRule(
      'resetPassword',
      defaultCredRateLimits.resetPassword,
      overrides.resetPassword
    ),
    logout: resolveRateLimitRule('logout', defaultCredRateLimits.logout, overrides.logout),
    oauth: resolveRateLimitRule('oauth', defaultCredRateLimits.oauth, overrides.oauth),
    profile: resolveRateLimitRule('profile', defaultCredRateLimits.profile, overrides.profile),
    profileUpdate: resolveRateLimitRule(
      'profileUpdate',
      defaultCredRateLimits.profileUpdate,
      overrides.profileUpdate
    )
  };
};

const resolveLogger = (logger: CredErrorLogger | undefined): CredErrorLogger => {
  if (logger === undefined) return console;

  if (!isRecord(logger) || typeof logger.error !== 'function') {
    throw new Error(`${PREFIX}: "logger" must expose an error(...args) method`);
  }

  return logger;
};

const resolveRateLimitStoreFactory = (
  factory: CredRateLimitStoreFactory | undefined
): CredRateLimitStoreFactory | undefined => {
  if (factory === undefined) return undefined;

  if (typeof factory !== 'function') {
    throw new Error(`${PREFIX}: "rateLimitStoreFactory" must be a function`);
  }

  return factory;
};

const HEALTH_RATE_LIMIT_DEFAULTS: CredRateLimitRule = {
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many health checks, please try again later.'
};

const resolveHealth = (userHealth: CredHealthConfig | undefined): ResolvedCredHealthConfig => {
  const enabled = userHealth?.enabled ?? true;

  if (userHealth !== undefined && typeof userHealth !== 'object') {
    throw new Error(`${PREFIX}: "health" must be an object or omitted`);
  }

  if (userHealth?.check !== undefined && typeof userHealth.check !== 'function') {
    throw new Error(`${PREFIX}: "health.check" must be a function`);
  }

  const rateLimit: CredRateLimitRule = {
    ...HEALTH_RATE_LIMIT_DEFAULTS,
    ...userHealth?.rateLimit
  };

  return {
    enabled,
    check: userHealth?.check ?? (() => Promise.resolve()),
    rateLimit
  };
};

/**
 * Validates a user configuration and fills in defaults.
 *
 * Throws a descriptive error before any route is mounted so configuration
 * mistakes surface at startup rather than on the first request.
 */
export const resolveCredConfig = (userConfig: CredExpressConfig): ResolvedCredExpressConfig => {
  if (!isRecord(userConfig)) {
    throw new Error(`${PREFIX}: configuration object is required`);
  }

  const database = resolveDatabase(userConfig.database);
  const email = resolveEmail(userConfig.email);

  if (typeof userConfig.jwtSecret !== 'string') {
    throw new Error(`${PREFIX}: "jwtSecret" is required and must be a string`);
  }

  try {
    assertJwtSecret(userConfig.jwtSecret);
  } catch (error) {
    throw new Error(
      `${PREFIX}: ${error instanceof Error ? error.message : 'invalid "jwtSecret" configuration'}`,
      { cause: error }
    );
  }

  const core = resolveCoreConfig(userConfig.core);
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    database,
    email,
    jwtSecret: userConfig.jwtSecret,
    clientUrl: readUrl('clientUrl', userConfig.clientUrl),
    backendUrl: readUrl('backendUrl', userConfig.backendUrl),
    basePath: readBasePath(userConfig.basePath ?? '/api'),
    oauth: resolveOAuth(userConfig.oauth),
    cookies: resolveCookies(userConfig.cookies, core, isProduction),
    rateLimits: resolveCredRateLimits(userConfig.rateLimits),
    rateLimitStoreFactory: resolveRateLimitStoreFactory(userConfig.rateLimitStoreFactory),
    core,
    jsonBodyLimit: readBodyLimit(userConfig.jsonBodyLimit),
    logger: resolveLogger(userConfig.logger),
    health: resolveHealth(userConfig.health)
  };
};

/** Builds the config object expected by core's token-issuing services. */
export const createCoreAuthConfig = (
  config: ResolvedCredExpressConfig
): { jwtSecret: string } & CredConfig => ({
  jwtSecret: config.jwtSecret,
  ...config.core
});
