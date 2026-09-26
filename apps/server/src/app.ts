import express from "express";
import type { Express } from "express";
import { errorHandler, notFoundHandler } from "./http/errorHandler";
import { healthRouter } from "./routes/health.routes";

/** Builds the Express app. Pure: no env access, dependencies will be passed as parameters. */
export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
