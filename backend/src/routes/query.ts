// POST /api/query — natural language log query route handler.

import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";

import { queryLogs } from "../services/ragService";
import { runAgent } from "../services/agentService";

export const queryRouter: Router = createRouter();

interface QueryRequestBody {
  message?: string;
  mode?: "rag" | "agent";
}

queryRouter.post(
  "/api/query",
  async (req: Request<unknown, unknown, QueryRequestBody>, res: Response) => {
    const startedAt = Date.now();

    const { message, mode = "rag" } = req.body ?? {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Body must include a 'message' string.",
      });
    }

    try {
      if (mode === "agent") {
        const answer = await runAgent(message);
        const responseTimeMs = Date.now() - startedAt;

        // NOTE: toolsCalled is not yet tracked explicitly; this can be enhanced
        // later by returning tool metadata from runAgent.
        return res.json({
          answer,
          toolsCalled: [],
          response_time_ms: responseTimeMs,
        });
      }

      const { answer, sources } = await queryLogs(message);
      const responseTimeMs = Date.now() - startedAt;

      return res.json({
        answer,
        sources,
        response_time_ms: responseTimeMs,
      });
    } catch (err) {
      const responseTimeMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : "Failed to process query.";
      // eslint-disable-next-line no-console
      console.error("Error handling /api/query:", err);

      return res.status(500).json({
        error: message,
        response_time_ms: responseTimeMs,
      });
    }
  },
);
