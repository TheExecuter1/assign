import cron from "node-cron";
import { flushWatchProgressToQueue } from "../../services/watch.service";
import { logger } from "../global-utils/logger.utils";

const WATCH_PROGRESS_FLUSH_CRON = process.env.WATCH_PROGRESS_FLUSH_CRON || "* * * * *";

let watchEventFlusherJob: ReturnType<typeof cron.schedule> | null = null;


// runs every mimute to flush the watch progress data to the queue for further processing.
export const startWatchEventFlusher = () => {
    if (watchEventFlusherJob) return;

    try {
        watchEventFlusherJob = cron.schedule(WATCH_PROGRESS_FLUSH_CRON, async () => {
            try {
                await flushWatchProgressToQueue();
            } catch (error: any) {
                logger.error("watch.flush.run_failed", { error: error?.message });
            }
        });

        logger.info("watch.flush.scheduler.started", { cron: WATCH_PROGRESS_FLUSH_CRON });
    } catch (error: any) {
        logger.error("watch.flush.schedule_failed", {
            cron: WATCH_PROGRESS_FLUSH_CRON,
            error: error?.message,
        });
    }
};

export const stopWatchEventFlusher = () => {
    watchEventFlusherJob?.stop();
    watchEventFlusherJob = null;

    logger.info("watch.flush.scheduler.stopped");
};