import { GoogleGenerativeAI } from "@google/generative-ai";

// Embedding generation using Google Gemini text-embedding-004.
// When GEMINI_API_KEY is not set, returns a unit placeholder (cosine rejects zero vectors).

export const EMBEDDING_DIM = 1536;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "models/text-embedding-004";

let genAI: GoogleGenerativeAI | null = null;
let warnedNoConfig = false;

function getClient(): GoogleGenerativeAI | null {
  if (!GEMINI_API_KEY) return null;
  if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  return genAI;
}

/** Placeholder with magnitude 1 so cosine similarity is defined when Gemini is not configured. */
function placeholderEmbedding(): number[] {
  const v = new Array(EMBEDDING_DIM).fill(0);
  v[0] = 1;
  return v;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();

  if (!client) {
    if (!warnedNoConfig) {
      warnedNoConfig = true;
      // eslint-disable-next-line no-console
      console.warn(
        "Gemini embedding not configured (missing GEMINI_API_KEY). Using placeholder embeddings.",
      );
    }
    return placeholderEmbedding();
  }

  try {
    const model = client.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text);
    const values = result.embedding?.values ?? [];

    if (!values.length) return placeholderEmbedding();

    // Index expects 1536 dimensions; pad if the model returns fewer (e.g. 768).
    if (values.length >= EMBEDDING_DIM) return values.slice(0, EMBEDDING_DIM);
    const padded = [...values];
    while (padded.length < EMBEDDING_DIM) padded.push(0);
    return padded;
  } catch {
    return placeholderEmbedding();
  }
}
