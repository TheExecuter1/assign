/**
 * Tiny structured logger. Emits one JSON object per line so that whatever log
 * shipper sits in front of stdout in production (datadog, loki, etc.) gets
 * something parseable. Kept dependency-free for the assignment.
 */
type Level = "debug" | "info" | "warn" | "error";

const emit = (level: Level, msg: string, meta?: Record<string, unknown>) => {
    const line = {
        ts: new Date().toISOString(),
        level,
        msg,
        ...(meta || {}),
    };
    const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
    out.write(JSON.stringify(line) + "\n");
};

export const logger = {
    debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
