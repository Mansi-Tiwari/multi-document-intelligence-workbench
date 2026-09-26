import { Router } from "express";
import { z } from "zod";
import {
  AnalysisIdSchema,
  AnalysisSchema,
  AnalysisSummarySchema,
  CreateAnalysisRequestSchema,
  CreateAnalysisResponseSchema,
} from "@mdiw/shared";
import { parseInput } from "../http/parseInput";
import { sendJson } from "../http/sendJson";
import type { AnalysisService } from "../services/AnalysisService";

const IdParamsSchema = z.object({ id: AnalysisIdSchema });
const ListAnalysesResponseSchema = z.object({ analyses: z.array(AnalysisSummarySchema) });

export function analysesRouter(service: AnalysisService): Router {
  const router = Router();

  // Synchronous: runs the whole analysis within the request. Documents that can't be
  // analysed are skipped and listed in `skipped`; 422 NOTHING_TO_ANALYZE if all are.
  router.post("/", async (req, res) => {
    const request = parseInput(CreateAnalysisRequestSchema, req.body, "Invalid analysis request.");
    const response = await service.create(request);
    sendJson(res, 201, CreateAnalysisResponseSchema, response);
  });

  router.get("/", (_req, res) => {
    sendJson(res, 200, ListAnalysesResponseSchema, { analyses: service.list() });
  });

  router.get("/:id", (req, res) => {
    const { id } = parseInput(IdParamsSchema, req.params, "Invalid analysis id.");
    sendJson(res, 200, AnalysisSchema, service.get(id));
  });

  return router;
}
