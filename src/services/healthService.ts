import mongoose from "mongoose";
import { logger } from "../shared/logger";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface HealthCheck {
  status: HealthStatus;
  mongo: boolean;
  uptime: number;
}

export async function getHealthCheck(): Promise<HealthCheck> {
  const mongoConnected = mongoose.connection.readyState === 1;

  const status: HealthStatus = mongoConnected ? "healthy" : "unhealthy";

  return {
    status,
    mongo: mongoConnected,
    uptime: process.uptime(),
  };
}
