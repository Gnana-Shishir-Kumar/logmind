import axios from "axios";

// In dev, always use same origin (empty) so Vite proxy forwards /api to backend.
// Avoids "Network Error" from cross-origin or unreachable backend URL.
// In production, use VITE_API_URL.
const baseURL = import.meta.env.DEV
  ? ""
  : (import.meta.env.VITE_API_URL ?? "http://localhost:4000");

export const api = axios.create({
  baseURL,
});

export async function ingestLogs(lines: string[]) {
  const response = await api.post("/api/ingest", { logs: lines });
  return response.data as { indexed: number; errors: string[] };
}

export type QueryMode = "rag" | "agent";

export async function queryChat(message: string, mode: QueryMode) {
  const response = await api.post("/api/query", { message, mode });
  return response.data as {
    answer: string;
    sources?: any[];
    toolsCalled?: any[];
    response_time_ms: number;
  };
}

export async function getHealth() {
  const response = await api.get("/api/health");
  return response.data as {
    status: "ok" | "degraded";
    elasticsearch: boolean;
    timestamp: string;
  };
}
