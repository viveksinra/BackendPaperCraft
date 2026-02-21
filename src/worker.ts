import { bootstrapWorkers } from "./worker/index";
import { logger } from "./shared/logger";

bootstrapWorkers()
  .catch((error) => {
    logger.fatal({ msg: "Worker bootstrap failed", error });
    process.exit(1);
  });