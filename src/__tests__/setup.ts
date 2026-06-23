process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.BACKEND_URL = 'http://localhost:3000';
process.env.CORS_ORIGIN = 'http://localhost:5173';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-google-client-secret';
process.env.GITHUB_OAUTH_CLIENT_ID = 'test-github-client-id';
process.env.GITHUB_OAUTH_CLIENT_SECRET = 'test-github-client-secret';
jest.mock('../helpers/email.helpers', () => ({
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined)
}));
