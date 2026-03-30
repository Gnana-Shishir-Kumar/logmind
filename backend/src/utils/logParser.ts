// Utilities for parsing raw log strings into structured JSON.

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG" | "UNKNOWN";

export interface ParsedLog {
  timestamp: string;
  level: LogLevel;
  service: string;
  message: string;
  raw: string;
  metadata: Record<string, any>;
}

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function toIsoStringOrNow(date: Date | null): string {
  if (!date || Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function normalizeLevel(levelRaw: string | undefined): LogLevel {
  if (!levelRaw) return "UNKNOWN";
  const lvl = levelRaw.toUpperCase();
  if (lvl.includes("ERROR")) return "ERROR";
  if (lvl.includes("WARN")) return "WARN";
  if (lvl.includes("DEBUG")) return "DEBUG";
  if (lvl.includes("INFO")) return "INFO";
  return "UNKNOWN";
}

// 1. Apache/Nginx common log format
function parseApacheLike(raw: string): ParsedLog | null {
  // Example:
  // 127.0.0.1 - - [10/Mar/2026:13:55:36] "GET /api/health HTTP/1.1" 200 612
  const regex =
    /^(\S+) \S+ \S+ \[([0-9]{2})\/([A-Za-z]{3})\/([0-9]{4}):([0-9]{2}):([0-9]{2}):([0-9]{2})] "([A-Z]+) ([^"]+) HTTP\/[0-9.]+" (\d{3}) (\d+|-)\s*$/;

  const match = raw.match(regex);
  if (!match) return null;

  const [
    ,
    remoteAddr,
    day,
    monthStr,
    year,
    hour,
    minute,
    second,
    method,
    path,
    status,
    bytes,
  ] = match;

  const month = MONTHS[monthStr];
  const date =
    month !== undefined
      ? new Date(
          Number(year),
          month,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        )
      : null;

  const message = `${method} ${path} ${status}`;

  return {
    timestamp: toIsoStringOrNow(date),
    level: "INFO",
    service: "web",
    message,
    raw,
    metadata: {
      remoteAddr,
      method,
      path,
      status: Number(status),
      bytes: bytes === "-" ? null : Number(bytes),
      format: "apache",
    },
  };
}

// 2. Syslog
function parseSyslog(raw: string): ParsedLog | null {
  // Example:
  // Mar 10 13:55:36 hostname service[pid]: message
  const regex =
    /^([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\S+)\s+([\w\-./]+)(?:\[(\d+)]):\s+(.*)$/;

  const match = raw.match(regex);
  if (!match) return null;

  const [
    ,
    monthStr,
    day,
    hour,
    minute,
    second,
    hostname,
    service,
    pid,
    message,
  ] = match;

  const now = new Date();
  const year = now.getFullYear();
  const month = MONTHS[monthStr];

  const date =
    month !== undefined
      ? new Date(
          year,
          month,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second),
        )
      : null;

  return {
    timestamp: toIsoStringOrNow(date),
    level: "INFO",
    service,
    message,
    raw,
    metadata: {
      hostname,
      pid: pid ? Number(pid) : undefined,
      format: "syslog",
    },
  };
}

// 3. JSON logs
function parseJsonLog(raw: string): ParsedLog | null {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj !== "object" || obj === null) return null;

    const level = normalizeLevel(obj.level);
    const timestamp = toIsoStringOrNow(
      obj.timestamp ? new Date(obj.timestamp) : null,
    );

    const service = typeof obj.service === "string" ? obj.service : "unknown";
    const message =
      typeof obj.message === "string" ? obj.message : raw.trim();

    const { timestamp: _t, level: _l, service: _s, message: _m, ...rest } = obj;

    return {
      timestamp,
      level,
      service,
      message,
      raw,
      metadata: {
        ...rest,
        format: "json",
      },
    };
  } catch {
    return null;
  }
}

// 4. Plain text: 'ERROR 2026-03-10 13:55:36 Payment service timeout'
function parsePlainText(raw: string): ParsedLog | null {
  const regex =
    /^(INFO|WARN|WARNING|ERROR|DEBUG)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+)$/i;
  const match = raw.match(regex);
  if (!match) return null;

  const [, levelRaw, dateStr, timeStr, rest] = match;
  const date = new Date(`${dateStr}T${timeStr}Z`);

  const level = normalizeLevel(levelRaw);

  // Try to infer service as the first word of the message, if it looks like one.
  const [maybeService, ...msgParts] = rest.split(" ");
  const service =
    maybeService && maybeService.toLowerCase() !== "service"
      ? maybeService.replace(/[:,-]$/, "")
      : "unknown";
  const message =
    msgParts.length > 0 ? msgParts.join(" ").trim() : rest.trim();

  return {
    timestamp: toIsoStringOrNow(date),
    level,
    service,
    message,
    raw,
    metadata: {
      format: "plain",
    },
  };
}

export function parseLogLine(raw: string): ParsedLog {
  const trimmed = raw.trim();

  const parsers = [parseApacheLike, parseSyslog, parseJsonLog, parsePlainText];

  for (const parser of parsers) {
    const result = parser(trimmed);
    if (result) return result;
  }

  // Fallback for unrecognized formats.
  return {
    timestamp: new Date().toISOString(),
    level: "UNKNOWN",
    service: "unknown",
    message: trimmed,
    raw,
    metadata: {
      format: "unknown",
    },
  };
}
