# Logmind

Logmind is a full-stack playground for log analysis that combines Elasticsearch, Kibana, and LLM-powered retrieval-augmented generation (RAG). It lets you ingest raw logs, query them in natural language, and explore dashboards, all backed by an MCP-style agent for advanced workflows.

## Architecture

```text
                        +---------------------+
                        |    React Frontend   |
                        |  (Vite + Tailwind)  |
                        +----------+----------+
                                   |
                            HTTP / JSON (Axios)
                                   |
                    +--------------v---------------+
                    |       Node.js Backend       |
                    |  Express + TypeScript APIs  |
                    +------+-----------+----------+
                           |           |
                 /api/ingest|           |/api/query (RAG/Agent)
                           |           |
             +-------------v-+       +-v---------------------------+
             | Elasticsearch |       |    MCP / RAG Services      |
             |  logmind-logs |       | - LangChain RAG over ES    |
             +-------+-------+       | - MCP-style agentService   |
                     |               +----------------------------+
                     |
              +------v------+
              |   Kibana    |
              | Dashboards  |
              +-------------+
```

## Quick start

1. **Start Elasticsearch + Kibana**

   ```bash
   docker-compose up -d
   ```

2. **Install dependencies**

   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

3. **Configure environment**

   ```bash
   cd ..
   cp .env.example .env
   # Edit .env to add Azure/OpenAI keys if you want real embeddings and LLM answers.
   ```

4. **Create index and seed sample logs**

   ```bash
   cd backend
   npx ts-node src/setup/createIndex.ts
   npx ts-node src/setup/seedSampleLogs.ts
   ```

5. **Run backend and frontend**

   ```bash
   # In backend/
   npm run dev

   # In frontend/ (new terminal)
   npm run dev
   ```

   Open the printed Vite URL (e.g. `http://localhost:5173`) to access the Logmind UI.

> In short: **`docker-compose up` → `npm install` → seed → `npm run dev`**.

## Quest completion notes

- **Completes Quest 3 (RAG)**: Implements a LangChain-based RAG pipeline over Elasticsearch logs, with hybrid search (BM25 + vector) and Azure/OpenAI-backed answering.
- **Completes Quest 5 (MCP Agent)**: Exposes an MCP-style agent (`agentService`) with tools for searching logs, summarizing errors, inspecting index stats, and detecting anomalies.

## Elasticsearch + Kibana

Logmind intentionally uses **Elasticsearch + Kibana (EK)** rather than a purely managed search service:

- **Rich log ecosystem**: Elasticsearch is widely adopted for log storage, with mature ingestion patterns and Kibana dashboards for operations teams.
- **Flexible mappings and aggregations**: EK makes it easy to mix structured log fields, full-text search on messages, and vector search in the same index, which is ideal for log-centric RAG.
- **First-class dashboards**: Kibana provides out-of-the-box visualizations, time-series charts, and filters that pair naturally with the LLM chat interface.

Azure AI Search is great for managed vector search and document search, but this project optimizes for:

- A local, containerized stack that runs well via `docker-compose`.
- Direct control over index mappings (including `dense_vector`) and aggregations for anomaly detection.
- Easy integration with existing EK observability workflows.

## Example queries to try

In the **Chat** tab of the frontend, you can try prompts like:

- **"What errors happened in the last hour?"**
- **"Summarize all payment errors from the last 3 hours."**
- **"Which service has the most failures today?"**
- **"Are there any spikes in ERROR logs for payment-service?"**
- **"What are the most common auth-service warnings recently?"**
- **"Summarize anomalies today across all services."**

Switch between **RAG** and **Agent** modes to see how the answers differ:

- **RAG mode** returns focused answers based on retrieved log snippets.
- **Agent mode** can call tools to search logs, generate error summaries, inspect index stats, and detect anomalies before responding.

