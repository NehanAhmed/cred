import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI!);
    console.log('Database Connected Sucessfully.');
  } catch (error) {
    console.log('Error Connecting to Database', error);
  }
};
export default connectDB;
