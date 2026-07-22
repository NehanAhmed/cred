export interface LimiterOptions {
  windowMs: number;
  max: number;
  message: string;
}

export const authLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts, please try again later.',
};

export const profileLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many profile requests, please try again later.',
};

export const loginLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many login attempts, please try again in 15 minutes.',
};

export const registerLimiterConfig: LimiterOptions = {
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts, please try again in 60 minutes.',
};

export const forgotLimiterConfig: LimiterOptions = {
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many password reset attempts, please try again in 60 minutes.',
};

export const refreshLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many refresh attempts, please try again in 15 minutes.',
};

export const verifyEmailLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many verification attempts, please try again later.',
};

export const resetPasswordLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset attempts, please try again later.',
};

export const logoutLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many logout attempts, please try again later.',
};

export const oauthLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many OAuth attempts, please try again later.',
};

export const profileUpdateLimiterConfig: LimiterOptions = {
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many profile update attempts, please try again later.',
};

export const healthLimiterConfig: LimiterOptions = {
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Too many health check requests, please try again later.',
};
