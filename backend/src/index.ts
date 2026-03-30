// Express entry point for the Logmind backend.
// Load .env from repo root (parent of backend/) so one .env works for both apps.
import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), "..", ".env"),
});
// Fallback to backend/.env if root .env missing
dotenv.config();

import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response,
} from "express";

import { ingestRouter } from "./routes/ingest";
import { queryRouter } from "./routes/query";
import { healthRouter } from "./routes/health";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use(ingestRouter);
app.use(queryRouter);
app.use(healthRouter);

// Basic ping endpoint for quick checks.
app.get("/ping", (_req: Request, res: Response) => {
  res.json({ pong: true });
});

// Error handling middleware.
const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  // eslint-disable-next-line no-console
  console.error("Unhandled error:", err);

  const isDev = process.env.NODE_ENV !== "production";

  res.status(500).json({
    error: err.message ?? "Internal server error",
    stack: isDev ? err.stack : undefined,
  });
};

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Logmind backend listening on port ${PORT}`);
});
