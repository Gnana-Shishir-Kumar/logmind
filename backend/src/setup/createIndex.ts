import { Client } from "@elastic/elasticsearch";

// One-time setup script to ensure the "logmind-logs" index exists
// with the appropriate mapping for vector search and log metadata.
// Run with:
//   npx ts-node src/setup/createIndex.ts

async function ensureIndex() {
  const client = new Client({
    node: "http://localhost:9200",
  });

  const indexName = "logmind-logs";

  const exists = await client.indices.exists({ index: indexName });

  if (!exists) {
    await client.indices.create({
      index: indexName,
      mappings: {
        properties: {
          timestamp: { type: "date" },
          level: { type: "keyword" },
          service: { type: "keyword" },
          message: { type: "text" },
          message_vector: {
            type: "dense_vector",
            dims: 1536,
            index: true,
            similarity: "cosine",
          },
          raw: { type: "text" },
          metadata: {
            type: "object",
            dynamic: true,
          },
        },
      },
    });
  }

  console.log("Index ready");
}

ensureIndex().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Error ensuring index:", error);
  process.exit(1);
});

