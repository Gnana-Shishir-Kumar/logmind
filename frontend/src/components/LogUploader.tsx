import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

import { ingestLogs } from "../api/client";

const LogUploader: React.FC = () => {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;

    const file = acceptedFiles[0];
    const content = await file.text();
    setText((prev) => (prev ? `${prev}\n${content}` : content));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/plain": [".log", ".txt"],
    },
  });

  const parseLines = (value: string) =>
    value
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

  const handleSubmit = async () => {
    const lines = parseLines(text);
    if (!lines.length) {
      setStatus("Please provide at least one log line.");
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const res = await ingestLogs(lines);
      setStatus(
        `Indexed ${res.indexed} log lines. Errors: ${res.errors.length}`,
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setStatus("Failed to ingest logs. Please check the backend.");
    } finally {
      setLoading(false);
    }
  };

  const loadSampleLogs = () => {
    const services = ["auth-service", "payment-service", "api-gateway"];
    const levels = ["INFO", "WARN", "ERROR"] as const;
    const sample: string[] = [];

    for (let i = 0; i < 20; i += 1) {
      const level = levels[Math.floor(Math.random() * levels.length)];
      const service = services[Math.floor(Math.random() * services.length)];
      const timestamp = new Date(
        Date.now() - Math.floor(Math.random() * 60) * 60 * 1000,
      )
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);

      let message = "";
      if (service === "auth-service") {
        message =
          level === "ERROR"
            ? "Token validation failed for user"
            : "User login request processed";
      } else if (service === "payment-service") {
        message =
          level === "ERROR"
            ? "Payment gateway timeout"
            : "Payment authorization succeeded";
      } else {
        message =
          level === "ERROR"
            ? "Upstream service unavailable"
            : "Request proxied to upstream";
      }

      sample.push(
        `${level} ${timestamp} ${service} - ${message} (trace=${Math.floor(
          Math.random() * 100000,
        )})`,
      );
    }

    setText(sample.join("\n"));
    setStatus("Loaded 20 sample log lines.");
  };

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-800 px-6 py-3">
        <h2 className="text-lg font-semibold">Upload Logs</h2>
        <p className="text-xs text-gray-400">
          Drag-and-drop log files or paste raw log lines to ingest into
          Elasticsearch.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div
          {...getRootProps({
            className:
              "border-2 border-dashed rounded-md px-4 py-6 text-center cursor-pointer " +
              (isDragActive
                ? "border-indigo-400 bg-gray-800"
                : "border-gray-700 bg-gray-900 hover:border-indigo-400"),
          })}
        >
          <input {...getInputProps()} />
          <p className="text-sm text-gray-300">
            {isDragActive
              ? "Drop the .log or .txt files here..."
              : "Drag & drop .log or .txt files here, or click to select files."}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="log-textarea"
              className="text-xs font-medium text-gray-300"
            >
              Raw log lines
            </label>
            <button
              type="button"
              onClick={loadSampleLogs}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Load sample logs
            </button>
          </div>
          <textarea
            id="log-textarea"
            rows={10}
            className="w-full rounded-md bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Paste log lines here..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && (
              <span className="mr-2 h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            Ingest logs
          </button>
          {status && (
            <p className="text-xs text-gray-300 max-w-md text-right">
              {status}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LogUploader;
