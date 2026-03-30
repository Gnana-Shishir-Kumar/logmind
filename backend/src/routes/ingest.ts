// POST /api/ingest — log ingestion route handler.

import type { Request, Response, Router } from "express";
import { Router as createRouter } from "express";

import { bulkIndexLogs } from "../services/elasticService";
import { generateEmbedding } from "../utils/embeddings";
import { parseLogLine } from "../utils/logParser";

const INDEX_NAME = "logmind-logs";

export const ingestRouter: Router = createRouter();

interface IngestRequestBody {
  logs?: string[];
}

ingestRouter.post(
  "/api/ingest",
  async (req: Request<unknown, unknown, IngestRequestBody>, res: Response) => {
    const { logs } = req.body ?? {};

    if (!Array.isArray(logs)) {
      return res.status(400).json({
        error: "Request body must include 'logs' as an array of strings.",
      });
    }

    const documents = [];
    const errors: string[] = [];

    for (const raw of logs) {
      if (typeof raw !== "string") {
        errors.push("Non-string log entry encountered and skipped.");
        // eslint-disable-next-line no-continue
        continue;
      }

      try {
        const parsed = parseLogLine(raw);
        const message_vector = await generateEmbedding(parsed.message);

        documents.push({
          ...parsed,
          message_vector,
        });
      } catch (err) {
        errors.push(
          `Failed to parse or prepare log: ${raw} :: ${(err as Error).message}`,
        );
      }
    }

    try {
      await bulkIndexLogs(documents);
    } catch (err) {
      errors.push(`Bulk index error: ${(err as Error).message}`);
      return res.status(500).json({
        indexed: 0,
        errors,
      });
    }

    return res.json({
      indexed: documents.length,
      errors,
    });
  },
);
