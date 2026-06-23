namespace Express {
  interface Request {
    user: {
      id: string;
      email: string;
      username: string;
      iat?: number;
      exp?: number;
    };
  }
}
