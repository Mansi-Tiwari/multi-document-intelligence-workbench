import { Router } from "express";
import { HealthResponseSchema } from "@mdiw/shared";
import { sendJson } from "../http/sendJson";

export function healthRouter(): Router {
  const router = Router();
  router.get("/", (_req, res) => {
    sendJson(res, 200, HealthResponseSchema, { status: "ok" });
  });
  return router;
}
