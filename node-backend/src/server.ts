import { app } from "./app.js";
import { env } from "./utils/env.js";
import logger from "./utils/logger.js";

const port = env.PORT;

async function start() {
  try {
    app.listen(port, () => {
      logger.info(`API listening on http://localhost:${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info("JSON config system is ready. Accounts can be managed via API.");
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception", { error });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection", { reason, promise });
  process.exit(1);
});

start();
