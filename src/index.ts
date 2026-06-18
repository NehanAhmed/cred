import app from './app';
import connectDB from './db/db';
const PORT = process.env.PORT || '3000';
connectDB();
app.listen(PORT, () => {
  console.log(`Server is Running on Port ${PORT}`);
});
