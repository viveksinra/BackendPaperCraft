import pino, { LoggerOptions } from "pino";
import { env } from "./config/env";

const options: LoggerOptions = {
  level: env.LOG_LEVEL,
  base: {
    app: env.APP_NAME,
    env: env.NODE_ENV,
  },
  messageKey: "message",
  formatters: {
    level(label) {
      return { level: label };
    },
  },
};

export const logger = pino(options);




