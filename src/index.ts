import app from './app';
import connectDB from './db/db';
import { config } from 'dotenv';

config();

const start = async () => {
  await connectDB();
  const PORT = process.env.PORT || '3000';
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
