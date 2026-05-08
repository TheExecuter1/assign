import express from "express";
import cors from "cors";
import morgan from "morgan";
import { get_environment } from "./utilities/global-utils/environment.utils";
import { authMiddleware } from "./middlewares/auth.middleware";
import { errorMiddleware } from "./middlewares/error.middleware";
import { logger } from "./utilities/global-utils/logger.utils";
import { flushWatchProgressToQueue } from "./services/watch.service";
import { startWatchEventFlusher, stopWatchEventFlusher } from "./utilities/jobs/watch_event_flusher";
import v1Routes from "./routes/v1Routes";

startWatchEventFlusher();

morgan.token("ip", (req, _res) => {
    return (<any>req)?.headers?.["x-forwarded-for"];
});

const app = express();

app.use(cors());
app.use(morgan(":ip :url :response-time ms"));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", uptimeSec: Math.round(process.uptime()) });
});

app.use(authMiddleware);
app.use("/api/v1", v1Routes);
app.use(errorMiddleware);

const PORT = Number(process.env.PORT) || 3000;
const server = app.listen(PORT, () => {
    logger.info("server.listening", { port: PORT, env: get_environment().env_mode });
});

/**
 * Graceful shutdown: stop the watch-progress flusher, do one final publish
 * so the trailing aggregation window is not lost, then exit. Other side
 * effects are published inline on the request path so there is nothing else
 * in-process to drain.
 */
const shutdown = async (signal: string) => {
    logger.info("server.shutdown.start", { signal });
    stopWatchEventFlusher();
    server.close(() => logger.info("server.http.closed"));
    try {
        await flushWatchProgressToQueue();
    } catch (err: any) {
        logger.error("server.shutdown.error", { error: err?.message });
    }
    logger.info("server.shutdown.complete");
    process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason: any) => {
    logger.error("unhandledRejection", { reason: reason?.message || String(reason) });
});
process.on("uncaughtException", (err) => {
    logger.error("uncaughtException", { error: err.message, stack: err.stack });
});
