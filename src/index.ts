import 'dotenv/config';
import path from "path";
import fs from "fs/promises";
import Fastify from "fastify";
import sensible from "@fastify/sensible";
import cron from "node-cron";
import { initDb, fetchLatestResult, fetchHistory, getResult } from "./database.js";
import { fetchAndStore } from "./fetcher.js";

const DB_PATH = process.env.DATABASE_FILE ?? "data/data.db";
const FETCH_CRON = process.env.FETCH_CRON ?? "0 4 * * 3";
const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "0.0.0.0";
const FETCH_TOKEN = process.env.FETCH_TOKEN;

if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT ?? 8000}`);
}

const app = Fastify({ logger: true });

// Accept empty JSON bodies: some clients send Content-Type: application/json with no body.
// Treat an empty body as an empty object to avoid Fastify's "Body cannot be empty" error.
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req: any, body: string, done: (err: Error | null, result?: any) => void) => {
    if (body === null || body === undefined || body === "") {
      return done(null, {});
    }
    try {
      const parsed = JSON.parse(body);
      done(null, parsed);
    } catch (err: any) {
      done(err as Error);
    }
  }
);

app.setErrorHandler((error, request, reply) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const statusCode = (error as any)?.statusCode ?? 500;

  app.log.error(
    {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      method: request.method,
      url: request.url,
      body: request.body,
      query: request.query,
      params: request.params,
    },
    "Request failed"
  );

  if (!reply.sent) {
    reply.status(statusCode).send({
      error: errorMessage || "Internal Server Error",
    });
  }
});

async function ensureDataDirectory(): Promise<void> {
  const dir = path.dirname(DB_PATH);
  await fs.mkdir(dir, { recursive: true });
}

app.get("/health", async () => ({ status: "ok" }));

app.get("/data/latest", async () => {
  const item = await fetchLatestResult(DB_PATH);
  if (!item) {
    throw app.httpErrors.notFound("No data available");
  }
  return item;
});

app.get("/data/history", async (request) => {
  const query = request.query as { limit?: string };
  const limit = Number(query.limit ?? "10");
  return fetchHistory(DB_PATH, limit);
});

app.get("/data/:id", async (request) => {
  const params = request.params as { id: string };
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw app.httpErrors.badRequest("Invalid id");
  }
  const item = await getResult(DB_PATH, id);
  if (!item) {
    throw app.httpErrors.notFound("Item not found");
  }
  return item;
});

function requireFetchToken(request: any): void {
  if (!FETCH_TOKEN) {
    return;
  }

  const header = request.headers.authorization;
  const expected = `Bearer ${FETCH_TOKEN}`;

  if (header !== expected) {
    throw app.httpErrors.unauthorized("Missing or invalid authorization token");
  }
}

// Manual trigger endpoint: POST /fetch
app.post("/fetch", async (request, reply) => {
  requireFetchToken(request);
  app.log.info("Manual fetch requested");
  try {
    const result = await fetchAndStore(DB_PATH);
    app.log.info({ id: result.id, preview: result.data }, "Manual fetch succeeded");
    return reply.code(200).send({ id: result.id, data: result.data });
  } catch (err) {
    app.log.error(err, "Manual fetch failed");
    return reply.code(500).send({ error: (err instanceof Error ? err.message : String(err)) });
  }
});

async function startServer(): Promise<void> {
  await app.register(sensible);
  await ensureDataDirectory();
  await initDb(DB_PATH);

  // Perform an initial fetch on startup so you can see logs immediately
  try {
    app.log.info("Starting initial fetch");
    const result = await fetchAndStore(DB_PATH);
    app.log.info({ id: result.id, preview: result.data }, "Initial fetch succeeded");
  } catch (err) {
    app.log.error(err, "Initial fetch failed");
  }

  cron.schedule(
    FETCH_CRON,
    async () => {
      app.log.info("Running scheduled fetch");
      try {
        const result = await fetchAndStore(DB_PATH);
        app.log.info({ id: result.id, preview: result.data }, "Scheduled fetch completed successfully");
      } catch (error) {
        app.log.error(error, "Scheduled fetch failed");
      }
    },
    {
      timezone: process.env.SCHEDULER_TIMEZONE ?? "UTC",
    }
  );

  const address = HOST === "0.0.0.0" ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
  await app.listen({ port: PORT, host: HOST });

  console.log("\nServer ready:");
  console.log(`  ${address}`);
  console.log(`Latest results: ${address}/data/latest`);
  console.log(`Health check: ${address}/health`);
  console.log(`History: ${address}/data/history?limit=10`);
  console.log(`\nMake sure the page is clickable in your terminal by clicking any of the URLs above.`);
}

startServer().catch((error) => {
  console.error(error);
  process.exit(1);
});
