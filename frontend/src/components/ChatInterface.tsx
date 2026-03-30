import React, { useState } from "react";
import ReactMarkdown from "react-markdown";

import type { QueryMode } from "../api/client";
import { queryChat } from "../api/client";

const markdownProse =
  "text-gray-100 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_strong]:text-white [&_code]:bg-gray-700 [&_code]:px-1 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-gray-900 [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5";

type Role = "user" | "assistant";

interface Message {
  id: string;
  role: Role;
  content: string;
  sources?: Array<{
    timestamp?: string;
    level?: string;
    service?: string;
    message?: string;
    raw?: string;
  }>;
}

const exampleQuestions = [
  "What errors happened in the last hour?",
  "Which service has the most failures?",
  "Summarize anomalies today",
];

const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<QueryMode>("rag");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    setLoading(true);
    try {
      const res = await queryChat(trimmed, mode);

      const assistant: Message = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: res.answer,
        sources: (res.sources as any[])?.map((s) => ({
          timestamp: s.timestamp,
          level: s.level,
          service: s.service,
          message: s.message,
          raw: s.raw,
        })),
      };

      setMessages((prev) => [...prev, assistant]);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      const backendError = err.response?.data?.error;
      const errorMsg: Message = {
        id: `${Date.now()}-error`,
        role: "assistant",
        content:
          backendError ||
          err.message ||
          "Something went wrong while querying the backend. Please try again.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (
    e,
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Chat</h2>
          <p className="text-xs text-gray-400">
            Ask natural language questions about your logs.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-xs text-gray-400">Mode</span>
          <div className="flex bg-gray-800 rounded-full p-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("rag")}
              className={`px-3 py-1 rounded-full ${
                mode === "rag"
                  ? "bg-indigo-500 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              RAG
            </button>
            <button
              type="button"
              onClick={() => setMode("agent")}
              className={`px-3 py-1 rounded-full ${
                mode === "agent"
                  ? "bg-indigo-500 text-white"
                  : "text-gray-300 hover:text-white"
              }`}
            >
              Agent
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-none border-b border-gray-800 px-6 py-2">
          <div className="flex flex-wrap gap-2 text-xs">
            {exampleQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setInput(q)}
                className="px-2 py-1 rounded-full bg-gray-800 text-gray-200 hover:bg-gray-700"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-sm text-gray-500">
              Start by asking a question about your logs, or pick one of the
              examples above.
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className="space-y-1">
              <div
                className={`max-w-3xl rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-indigo-600 text-white ml-auto"
                    : "bg-gray-800 text-gray-100 mr-auto"
                }`}
              >
                {m.role === "assistant" ? (
                  <div className={markdownProse}>
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <details className="ml-4 mr-auto max-w-3xl text-xs text-gray-400">
                  <summary className="cursor-pointer text-gray-300">
                    View source log snippets ({m.sources.length})
                  </summary>
                  <div className="mt-2 space-y-1">
                    {m.sources.map((s, idx) => (
                      <pre
                        // eslint-disable-next-line react/no-array-index-key
                        key={idx}
                        className="whitespace-pre-wrap bg-black/40 border border-gray-800 rounded p-2"
                      >
                        [{s.timestamp}] [{s.level}] [{s.service}]{" "}
                        {s.message ?? s.raw}
                      </pre>
                    ))}
                  </div>
                </details>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-gray-800 px-6 py-3">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                rows={2}
                className="w-full rounded-md bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Ask a question about your logs..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={loading}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && (
                <span className="mr-2 h-4 w-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
