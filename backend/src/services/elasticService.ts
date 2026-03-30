// Elasticsearch client + indexing + vector search utilities.

import { Client } from "@elastic/elasticsearch";
import type { ParsedLog } from "../utils/logParser";

const ELASTICSEARCH_URL =
  process.env.ELASTICSEARCH_URL ?? "http://localhost:9200";

const INDEX_NAME = "logmind-logs";

export const elasticClient = new Client({
  node: ELASTICSEARCH_URL,
});

export type IndexedLog = ParsedLog & { message_vector: number[] };

export async function indexLog(doc: IndexedLog) {
  await elasticClient.index({
    index: INDEX_NAME,
    document: doc,
  });
}

export async function bulkIndexLogs(docs: IndexedLog[]) {
  if (!docs.length) return;

  const body: any[] = [];

  for (const doc of docs) {
    body.push({ index: { _index: INDEX_NAME } });
    body.push(doc);
  }

  await elasticClient.bulk({ refresh: false, body });
}

interface HybridSearchOptions {
  level?: string;
  service?: string;
  from?: string;
  to?: string;
  size?: number;
}

export async function hybridSearch(
  query: string,
  queryVector: number[],
  options: HybridSearchOptions = {},
) {
  const size = options.size ?? 10;

  const filters: any[] = [];

  if (options.level) {
    filters.push({ term: { level: options.level } });
  }

  if (options.service) {
    filters.push({ term: { service: options.service } });
  }

  if (options.from || options.to) {
    const range: Record<string, string> = {};
    if (options.from) range.gte = options.from;
    if (options.to) range.lte = options.to;
    filters.push({ range: { timestamp: range } });
  }

  const bm25Query = {
    index: INDEX_NAME,
    size,
    query: {
      bool: {
        must: [
          {
            match: {
              message: query,
            },
          },
        ],
        filter: filters,
      },
    },
    _source: true,
  };

  const hybridQuery = {
    ...bm25Query,
    knn: {
      field: "message_vector",
      query_vector: queryVector,
      k: 10,
      num_candidates: 50,
      filter: filters.length ? { bool: { filter: filters } } : undefined,
    },
  };

  // eslint-disable-next-line no-console
  console.log("Elasticsearch hybrid search query:", JSON.stringify(hybridQuery));

  try {
    const response = await elasticClient.search(hybridQuery as any);
    return response.hits.hits.map((hit) => ({
      _id: hit._id,
      _score: hit._score,
      _source: hit._source,
    }));
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // Index may have been auto-created without dense_vector mapping; fall back to BM25 only.
    if (
      msg.includes("knn") &&
      (msg.includes("dense_vector") || msg.includes("dense vector"))
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        "KNN not supported on message_vector (wrong mapping). Recreate index with createIndex.ts and re-seed. Using BM25-only search.",
      );
      const response = await elasticClient.search(bm25Query as any);
      return response.hits.hits.map((hit) => ({
        _id: hit._id,
        _score: hit._score,
        _source: hit._source,
      }));
    }
    throw err;
  }
}

export async function getIndexStats() {
  const stats = await elasticClient.indices.stats({
    index: INDEX_NAME,
    metric: ["docs", "store"],
  });

  const indexStats = stats.indices?.[INDEX_NAME];

  const docCount =
    indexStats?.total?.docs?.count ??
    stats._all?.primaries?.docs?.count ??
    0;

  const sizeInBytes =
    indexStats?.total?.store?.size_in_bytes ??
    stats._all?.primaries?.store?.size_in_bytes ??
    0;

  const latest = await elasticClient.search({
    index: INDEX_NAME,
    size: 1,
    sort: [{ timestamp: "desc" }],
    _source: ["timestamp"],
  });

  const lastIndexedTimestamp =
    (latest.hits.hits[0]?._source as any)?.timestamp ?? null;

  return {
    docCount,
    sizeInBytes,
    lastIndexedTimestamp,
  };
}
