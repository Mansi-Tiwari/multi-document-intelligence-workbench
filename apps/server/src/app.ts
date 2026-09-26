import express from "express";
import type { Express } from "express";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./http/errorHandler";
import { requestIdMiddleware } from "./http/requestId";
import { corsMiddleware, rateLimitMiddleware } from "./http/security";
import type { CorsOptions, RateLimitOptions } from "./http/security";
import { documentsRouter } from "./routes/documents.routes";
import { healthRouter } from "./routes/health.routes";
import type { DocumentService } from "./services/DocumentService";
import type { UploadLimits } from "@mdiw/shared";

export type AppOptions = {
  cors: CorsOptions;
  /** `false` disables rate limiting (e.g. in tests). */
  rateLimit: Omit<RateLimitOptions, "skipPaths"> | false;
  services: { documents: DocumentService };
  /** Overrides the shared upload limits (tests use small ones). */
  uploadLimits?: UploadLimits;
};

/** Builds the Express app. Pure: no env access; configuration comes in through `options`. */
export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable("x-powered-by");

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.use(corsMiddleware(options.cors));
  if (options.rateLimit !== false) {
    // The health check is excluded so monitoring never gets throttled.
    app.use("/api", rateLimitMiddleware({ ...options.rateLimit, skipPaths: ["/health"] }));
  }
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/health", healthRouter());
  app.use("/api/documents", documentsRouter(options.services.documents, options.uploadLimits));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
