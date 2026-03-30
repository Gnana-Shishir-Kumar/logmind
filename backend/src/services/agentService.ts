// Microsoft Foundry MCP-style agent for log analysis.
// NOTE: This is a simple MCP-like implementation using OpenAI tool calling as a fallback.
// TODO: Replace the OpenAI-based loop with a proper Foundry MCP agent when the SDK is available.

import { OpenAIClient, AzureKeyCredential } from "@azure/openai";

import { queryLogs } from "./ragService";
import { elasticClient, getIndexStats } from "./elasticService";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_OPENAI_KEY =
  process.env.AZURE_OPENAI_KEY ?? process.env.AZURE_OPENAI_API_KEY ?? "";
const AZURE_OPENAI_CHAT_DEPLOYMENT =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT ?? "gpt-4o";

let azureChatClient: OpenAIClient | null = null;

function getAzureChatClient(): OpenAIClient | null {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_KEY) return null;

  if (!azureChatClient) {
    azureChatClient = new OpenAIClient(
      AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(AZURE_OPENAI_KEY),
    );
  }

  return azureChatClient;
}

// ---- MCP tools ----

type SearchLogsParams = {
  query: string;
  level?: string;
  service?: string;
  hours_back?: number;
};

type GetErrorSummaryParams = {
  hours_back: number;
};

type DetectAnomaliesParams = {
  window_minutes: number;
};

async function toolSearchLogs(params: SearchLogsParams) {
  const { query } = params;
  const result = await queryLogs(query);
  return result;
}

async function toolGetErrorSummary(params: GetErrorSummaryParams) {
  const now = new Date();
  const from = new Date(
    now.getTime() - params.hours_back * 60 * 60 * 1000,
  ).toISOString();

  const hits = await elasticClient.search({
    index: "logmind-logs",
    size: 100,
    query: {
      bool: {
        must: [{ match_all: {} }],
        filter: [
          { term: { level: "ERROR" } },
          { range: { timestamp: { gte: from } } },
        ],
      },
    },
    _source: ["timestamp", "service", "message", "level"],
  });

  const buckets: Record<
    string,
    { count: number; examples: Array<{ timestamp: string; message: string }> }
  > = {};

  for (const hit of hits.hits.hits as any[]) {
    const src = hit._source as any;
    const service = src.service ?? "unknown";

    if (!buckets[service]) {
      buckets[service] = { count: 0, examples: [] };
    }

    buckets[service].count += 1;
    if (buckets[service].examples.length < 3) {
      buckets[service].examples.push({
        timestamp: src.timestamp,
        message: src.message,
      });
    }
  }

  const contextLines = Object.entries(buckets).map(
    ([service, info]) => `Service: ${service}
Errors: ${info.count}
Examples:
${info.examples
  .map((e) => `- [${e.timestamp}] ${e.message}`)
  .join("\n")}`,
  );

  const prompt = [
    "You are a log analysis assistant. Summarize the ERROR-level logs grouped by service.",
    `Time window: last ${params.hours_back} hours.`,
    "",
    "Data:",
    contextLines.join("\n\n") || "(no ERROR logs found)",
    "",
    "Provide a concise summary of key errors, affected services, and any obvious patterns.",
  ].join("\n");

  const summary = await callLLM(prompt);

  return {
    summary,
    raw: buckets,
  };
}

async function toolGetIndexStats() {
  const stats = await getIndexStats();

  // Also gather distinct services observed in the index.
  const servicesAgg = await elasticClient.search({
    index: "logmind-logs",
    size: 0,
    aggs: {
      services: {
        terms: {
          field: "service",
          size: 50,
        },
      },
    },
  });

  const services =
    (servicesAgg.aggregations as any)?.services?.buckets?.map(
      (b: any) => b.key,
    ) ?? [];

  return {
    ...stats,
    services,
  };
}

async function toolDetectAnomalies(params: DetectAnomaliesParams) {
  const now = new Date();
  const from = new Date(
    now.getTime() - params.window_minutes * 60 * 1000,
  ).toISOString();

  const intervalMinutes = Math.max(1, Math.floor(params.window_minutes / 10));

  const resp = await elasticClient.search({
    index: "logmind-logs",
    size: 0,
    query: {
      range: {
        timestamp: {
          gte: from,
        },
      },
    },
    aggs: {
      levels_over_time: {
        date_histogram: {
          field: "timestamp",
          fixed_interval: `${intervalMinutes}m`,
        },
        aggs: {
          errors: {
            filter: { term: { level: "ERROR" } },
          },
        },
      },
      errors_by_message: {
        terms: {
          field: "message.keyword",
          size: 10,
        },
        aggs: {
          by_service: {
            terms: {
              field: "service",
              size: 5,
            },
          },
        },
      },
      services: {
        terms: {
          field: "service",
          size: 20,
        },
      },
    },
  });

  const levelsAgg = (resp.aggregations as any)
    ?.levels_over_time?.buckets as any[];
  const errorsByMessage = (resp.aggregations as any)
    ?.errors_by_message?.buckets as any[];
  const servicesBuckets = (resp.aggregations as any)?.services
    ?.buckets as any[];

  const errorCounts = levelsAgg?.map((b) => b.errors.doc_count) ?? [];
  const avgErrors =
    errorCounts.length > 0
      ? errorCounts.reduce((a, b) => a + b, 0) / errorCounts.length
      : 0;

  const spikes =
    levelsAgg?.filter((b) => b.errors.doc_count > 2 * avgErrors) ?? [];

  const repeatedErrors = errorsByMessage
    ?.filter((b) => b.doc_count > 5)
    .map((b) => ({
      message: b.key,
      count: b.doc_count,
      services: b.by_service.buckets.map((sb: any) => sb.key),
    })) ?? [];

  const services = servicesBuckets?.map((b) => b.key) ?? [];

  const report = {
    window_minutes: params.window_minutes,
    average_error_rate_per_bucket: avgErrors,
    spikes: spikes.map((b) => ({
      time: b.key_as_string,
      error_count: b.errors.doc_count,
    })),
    repeated_errors: repeatedErrors,
    services_seen: services,
  };

  return report;
}

// ---- Tool wiring for OpenAI function calling ----

const tools = [
  {
    type: "function",
    function: {
      name: "search_logs",
      description:
        "Search logs by natural language query, with optional filters for level, service, and time range.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          level: { type: "string" },
          service: { type: "string" },
          hours_back: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_error_summary",
      description:
        "Get a summary of all ERROR-level logs in the last N hours, grouped by service.",
      parameters: {
        type: "object",
        properties: {
          hours_back: {
            type: "number",
            description: "How many hours back to look.",
          },
        },
        required: ["hours_back"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_index_stats",
      description:
        "Get statistics about the log index: total docs, services seen, last ingest time.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detect_anomalies",
      description:
        "Detect unusual patterns: sudden spike in ERROR rate, new unknown services, repeated identical errors.",
      parameters: {
        type: "object",
        properties: {
          window_minutes: {
            type: "number",
            description:
              "Sliding window size in minutes to analyze recent logs for anomalies.",
          },
        },
        required: ["window_minutes"],
      },
    },
  },
] as const;

async function dispatchToolCall(name: string, args: any) {
  switch (name) {
    case "search_logs":
      return toolSearchLogs(args as SearchLogsParams);
    case "get_error_summary":
      return toolGetErrorSummary(args as GetErrorSummaryParams);
    case "get_index_stats":
      return toolGetIndexStats();
    case "detect_anomalies":
      return toolDetectAnomalies(args as DetectAnomaliesParams);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function callLLM(prompt: string): Promise<string> {
  const azureClient = getAzureChatClient();

  if (azureClient) {
    const response = await azureClient.getChatCompletions(
      AZURE_OPENAI_CHAT_DEPLOYMENT,
      [
        {
          role: "system",
          content:
            "You are a senior SRE helping analyze logs. Be concise and focus on actionable insights.",
        },
        { role: "user", content: prompt },
      ],
    );

    const choice = response.choices[0];
    const content = choice.message?.content;

    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      return content.map((c) => c.text ?? "").join("").trim();
    }
  }

  if (!OPENAI_API_KEY) {
    return "No language model is configured for summarization.";
  }

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a senior SRE helping analyze logs. Be concise and focus on actionable insights.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const data = (await resp.json()) as any;
  const text = data.choices?.[0]?.message?.content;
  if (typeof text === "string") return text.trim();

  return "Unable to generate a summary because no language model is available.";
}

// ---- Public agent entrypoint ----

export async function runAgent(userMessage: string): Promise<string> {
  // If no OpenAI key is configured, fall back to a simple direct queryLogs call.
  if (!OPENAI_API_KEY) {
    const result = await queryLogs(userMessage);
    return result.answer;
  }

  const messages: any[] = [
    {
      role: "system",
      content:
        "You are the Logmind MCP agent. You can call tools to search logs, summarize errors, inspect index stats, and detect anomalies. Always explain your findings clearly to SREs and developers.",
    },
    { role: "user", content: userMessage },
  ];

  // First call: let the model decide if it wants to call tools.
  const first = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
      tools,
      tool_choice: "auto",
    }),
  });

  const firstData = (await first.json()) as any;
  const firstMsg = firstData.choices?.[0]?.message;

  if (firstMsg?.tool_calls && firstMsg.tool_calls.length > 0) {
    messages.push(firstMsg);

    for (const toolCall of firstMsg.tool_calls) {
      const name = toolCall.function.name as string;
      const args = JSON.parse(toolCall.function.arguments || "{}");
      const result = await dispatchToolCall(name, args);

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name,
        content: JSON.stringify(result),
      });
    }

    // Second call: ask the model to produce a final answer using tool results.
    const finalResp = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
        }),
      },
    );

    const finalData = (await finalResp.json()) as any;
    const text = finalData.choices?.[0]?.message?.content;
    if (typeof text === "string") {
      return text.trim();
    }
  }

  // No tool calls chosen; just return the direct response content.
  if (typeof firstMsg?.content === "string") {
    return firstMsg.content.trim();
  }

  return "I was unable to generate a response.";
}

