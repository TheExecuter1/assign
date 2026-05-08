import { logger } from "../global-utils/logger.utils";

const SIMULATED_LATENCY_MS = 5;
const SIMULATED_FAILURE_RATE = 0.001;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type QueueHandler = (payload: Record<string, unknown>) => Promise<void> | void;

const consumers = new Map<string, QueueHandler>();

/**
 * Register a consumer for a queue. In a real broker this would be a worker
 * process holding a long-lived connection; here it is just an in-process
 * handler the mock will invoke after a successful publish.
 */
export const registerConsumer = (queueName: string, handler: QueueHandler): void => {
    consumers.set(queueName, handler);
};

/**
 * Mock durable queue (RabbitMQ/SQS shaped). The publish side is awaited so
 * callers get the same durability guarantee a real broker provides: once
 * enqueue resolves, the message is "persisted". Delivery to the registered
 * consumer is then dispatched asynchronously via setImmediate so the
 * publisher is never blocked by downstream work — the same decoupling a
 * real broker enforces between producer and consumer.
 */
export const enqueue = async (
    queueName: string,
    payload: Record<string, unknown>,
): Promise<void> => {
    await sleep(SIMULATED_LATENCY_MS);
    if (Math.random() < SIMULATED_FAILURE_RATE) {
        throw new Error(`queue:${queueName} simulated enqueue failure`);
    }
    logger.debug("queue.enqueue.ok", { queue: queueName, payload });

    const handler = consumers.get(queueName);
    if (!handler) return;
    setImmediate(() => {
        Promise.resolve(handler(payload)).catch((err: any) => {
            logger.error("queue.consumer.failed", {
                queue: queueName,
                error: err?.message || String(err),
            });
        });
    });
};
