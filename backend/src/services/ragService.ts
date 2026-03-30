// LangChain.js RAG pipeline for log question-answering using Google Gemini.

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Document } from "langchain/document";

import type { ParsedLog } from "../utils/logParser";
import { generateEmbedding } from "../utils/embeddings";
import { hybridSearch } from "./elasticService";

export type LogDocument = ParsedLog & {
  message_vector: number[];
};

interface QueryLogsResult {
  answer: string;
  sources: LogDocument[];
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHAT_MODEL = "gemini-2.5-flash";

let genAI: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI;
}

class ElasticsearchLogVectorStore {
  async retrieve(
    query: string,
    queryVector: number[],
    size = 5,
  ): Promise<Document<LogDocument>[]> {
    const hits = await hybridSearch(query, queryVector, { size });

    return hits.map((hit: any) => {
      const source = hit._source as LogDocument;

      const pageContent = source.message;
      const metadata = {
        level: source.level,
        service: source.service,
        timestamp: source.timestamp,
        raw: source.raw,
      };

      return new Document<LogDocument>({
        pageContent,
        metadata,
      });
    });
  }
}

const vectorStore = new ElasticsearchLogVectorStore();

export async function queryLogs(userQuestion: string): Promise<QueryLogsResult> {
  const questionEmbedding = await generateEmbedding(userQuestion);

  const docs = await vectorStore.retrieve(userQuestion, questionEmbedding, 5);

  const sources: LogDocument[] = docs.map((d) => ({
    timestamp: (d.metadata as any).timestamp,
    level: (d.metadata as any).level,
    service: (d.metadata as any).service,
    message: d.pageContent,
    raw: (d.metadata as any).raw,
    metadata: {},
    message_vector: [],
  }));

  const context = docs
    .map((d) => {
      const md = d.metadata as any;
      return `[${md.timestamp}] [${md.level}] [${md.service}] ${d.pageContent}`;
    })
    .join("\n");

  const prompt = [
    "You are a log analysis expert. Given these log entries, answer the question concisely.",
    "Focus on: error patterns, root causes, affected services, and time ranges.",
    "",
    "Log entries:",
    context || "(no relevant log entries found)",
    "",
    `Question: ${userQuestion}`,
    "",
    "Answer:",
  ].join("\n");

  const answer = await getAnswerFromModel(prompt);

  return {
    answer,
    sources,
  };
}

async function getAnswerFromModel(prompt: string): Promise<string> {
  const client = getClient();

  if (!client) {
    return "Unable to generate an answer because no language model is configured (set GEMINI_API_KEY).";
  }

  try {
    const model = client.getGenerativeModel({
      model: CHAT_MODEL,
      systemInstruction:
        "You are a senior SRE helping analyze logs. Be concise and focus on actionable insights.",
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text?.()?.trim();

    if (text) return text;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Gemini generateContent error:", err);
  }

  return "Unable to generate an answer because no language model is configured.";
}
