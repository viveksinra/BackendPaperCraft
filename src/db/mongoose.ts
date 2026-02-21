import mongoose from "mongoose";
import { env } from "../shared/config/env";
import { logger } from "../shared/logger";

export async function connectMongo(): Promise<typeof mongoose> {
  const uri = env.MONGODB_URI;
  mongoose.set("strictQuery", true);
  mongoose.connection.on("connected", () => logger.info({ msg: "Mongo connected" }));
  mongoose.connection.on("disconnected", () => logger.warn({ msg: "Mongo disconnected" }));
  mongoose.connection.on("error", (err) => logger.error({ msg: "Mongo error", err }));
  return mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
  });
}




