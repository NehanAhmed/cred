process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.BACKEND_URL = 'http://localhost:3000';

jest.mock('../helpers/email.helpers', () => ({
  sendEmailVerification: jest.fn().mockResolvedValue(undefined),
  sendPasswordReset: jest.fn().mockResolvedValue(undefined)
}));
