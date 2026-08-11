import mongoose from "mongoose";

let connectionPromise = null;

export const connectDB = async () => {
  // readyState === 1 means CONNECTED (not 2 = connecting!)
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // If already connecting, wait for that — don't open a second connection
  if (connectionPromise) {
    return connectionPromise;
  }

  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  connectionPromise = mongoose
    .connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      bufferCommands: false, // Fail fast instead of buffering queries
    })
    .then(() => {
      console.log("MongoDB connected successfully");
      connectionPromise = null;
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err.message);
      connectionPromise = null;
      throw err;
    });

  return connectionPromise;
};