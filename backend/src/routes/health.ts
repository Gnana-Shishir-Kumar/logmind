// GET /api/health — health check route handler.

import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";

import { elasticClient } from "../services/elasticService";

export const healthRouter: Router = createRouter();

healthRouter.get("/api/health", async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();

  let elasticsearchHealthy = false;

  try {
    await elasticClient.ping();
    elasticsearchHealthy = true;
  } catch {
    elasticsearchHealthy = false;
  }

  const status = elasticsearchHealthy ? "ok" : "degraded";

  return res.json({
    status,
    elasticsearch: elasticsearchHealthy,
    timestamp,
  });
});
