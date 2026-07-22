declare namespace Express {
  interface Request {
    user: {
      id: string;
      _id?: import('mongoose').Types.ObjectId;
      email: string;
      username: string;
      provider?: 'local' | 'google' | 'github';
      iat?: number;
      exp?: number;
    };
  }
}
