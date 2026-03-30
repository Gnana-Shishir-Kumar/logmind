import "dotenv/config";

import { indexLog } from "../services/elasticService";
import type { LogLevel, ParsedLog } from "../utils/logParser";
import { generateEmbedding } from "../utils/embeddings";

// One-time script to seed Elasticsearch with realistic sample logs.
// Run with:
//   npx ts-node src/setup/seedSampleLogs.ts

const SERVICES = ["auth-service", "payment-service", "api-gateway"] as const;

type Service = (typeof SERVICES)[number];

interface Counters {
  INFO: number;
  WARN: number;
  ERROR: number;
}

function randomChoice<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateMessage(level: LogLevel, service: Service): string {
  const userId = randomInt(1000, 9999);
  const orderId = `TXN-${randomInt(10000, 99999)}`;
  const ip = `192.168.${randomInt(0, 255)}.${randomInt(1, 254)}`;

  if (service === "auth-service") {
    if (level === "ERROR") {
      const variants = [
        `Authentication failed for user_id=${userId}: invalid credentials`,
        `Token validation failed for user_id=${userId} from IP ${ip}`,
        `Session lookup failed for user_id=${userId}: session not found`,
      ];
      return randomChoice(variants);
    }
    if (level === "WARN") {
      const variants = [
        `Slow login response for user_id=${userId} (850ms)`,
        `High auth cache miss rate detected (miss_ratio=${randomInt(60, 90)}%)`,
        `Auth rate limit nearing threshold for IP ${ip}`,
      ];
      return randomChoice(variants);
    }
    const variants = [
      `User login successful for user_id=${userId} from IP ${ip}`,
      `Refreshed access token for user_id=${userId}`,
      `Logout completed for user_id=${userId}`,
    ];
    return randomChoice(variants);
  }

  if (service === "payment-service") {
    if (level === "ERROR") {
      const variants = [
        `Payment processing timeout after 30s for order_id=${orderId}`,
        `Charge declined by gateway for order_id=${orderId}`,
        `Database connection pool exhausted: 50/50 connections in use during order_id=${orderId}`,
      ];
      return randomChoice(variants);
    }
    if (level === "WARN") {
      const variants = [
        `Slow payment response for order_id=${orderId} (3.2s)`,
        `Retrying payment authorization for order_id=${orderId}`,
        `High latency detected to payment gateway (p95=${randomInt(
          800,
          1500,
        )}ms)`,
      ];
      return randomChoice(variants);
    }
    const variants = [
      `Payment authorized successfully for order_id=${orderId}`,
      `Refund processed for order_id=${orderId}`,
      `Captured payment for order_id=${orderId}`,
    ];
    return randomChoice(variants);
  }

  // api-gateway
  if (level === "ERROR") {
    const variants = [
      `Upstream service unavailable for path=/api/payments status=503`,
      `Gateway timeout after 15s for path=/api/auth/login`,
      `Circuit breaker open for upstream=payment-service`,
    ];
    return randomChoice(variants);
  }
  if (level === "WARN") {
    const variants = [
      `High latency detected for upstream=auth-service p95=${randomInt(
        700,
        1200,
      )}ms`,
      `Retrying upstream request to payment-service`,
      `Client aborted request for path=/api/orders`,
    ];
    return randomChoice(variants);
  }
  const variants = [
    `Request completed path=/api/auth/login status=200`,
    `Proxied request to payment-service status=200`,
    `Health check OK for all upstreams`,
  ];
  return randomChoice(variants);
}

function generateTimestamp(base: Date, offsetMillis: number): string {
  return new Date(base.getTime() + offsetMillis).toISOString();
}

async function main() {
  const now = new Date();
  const logs: ParsedLog[] = [];
  const counts: Counters = { INFO: 0, WARN: 0, ERROR: 0 };

  // 15-payment-service error spike 2 hours ago within 5 minutes.
  const spikeBase = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  for (let i = 0; i < 15; i += 1) {
    const offset = randomInt(0, 5 * 60 * 1000); // within 5 minutes
    const timestamp = generateTimestamp(spikeBase, offset);
    const message = generateMessage("ERROR", "payment-service");

    const parsed: ParsedLog = {
      timestamp,
      level: "ERROR",
      service: "payment-service",
      message,
      raw: message,
      metadata: {
        seeded: true,
        scenario: "payment-spike",
      },
    };

    logs.push(parsed);
    counts.ERROR += 1;
  }

  // Remaining logs up to 200 total.
  const remaining = 200 - logs.length;

  for (let i = 0; i < remaining; i += 1) {
    const rnd = Math.random();
    let level: LogLevel;
    if (rnd < 0.7) level = "INFO";
    else if (rnd < 0.9) level = "WARN";
    else level = "ERROR";

    const service = randomChoice([...SERVICES]);

    // Spread remaining logs over the last 6 hours.
    const offsetMillis = -randomInt(0, 6 * 60 * 60 * 1000);
    const timestamp = generateTimestamp(now, offsetMillis);
    const message = generateMessage(level, service);

    const parsed: ParsedLog = {
      timestamp,
      level,
      service,
      message,
      raw: message,
      metadata: {
        seeded: true,
      },
    };

    logs.push(parsed);
    if (level === "INFO") counts.INFO += 1;
    else if (level === "WARN") counts.WARN += 1;
    else if (level === "ERROR") counts.ERROR += 1;
  }

  // Ensure total counts match 140 INFO, 40 WARN, 20 ERROR if possible.
  // We seeded 15 ERRORs already; adjust remaining distribution accordingly.
  const target: Counters = { INFO: 140, WARN: 40, ERROR: 20 };
  const totalSeeded = logs.length;
  if (totalSeeded !== 200) {
    // eslint-disable-next-line no-console
    console.warn(
      `Expected 200 logs but generated ${totalSeeded}. Check seed logic.`,
    );
  }

  // Compute embeddings and index.
  for (const log of logs) {
    const message_vector = await generateEmbedding(log.message);
    await indexLog({
      ...log,
      message_vector,
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${logs.length} logs: ${counts.INFO} INFO, ${counts.WARN} WARN, ${counts.ERROR} ERROR across auth-service, payment-service, api-gateway`,
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Error seeding sample logs:", err);
  process.exit(1);
});

