// currently unsed as these are handled  via a queue
import { logger } from "../global-utils/logger.utils";

const SIMULATED_LATENCY_MS = 50;
const SIMULATED_FAILURE_RATE = 0.02;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const simulate = async (name: string, payload: Record<string, unknown>) => {
    await sleep(SIMULATED_LATENCY_MS);
    if (Math.random() < SIMULATED_FAILURE_RATE) {
        throw new Error(`${name} simulated failure`);
    }
    logger.debug("external.call.ok", { integration: name, payload });
};

export const sendPushNotification = (input: { token?: string; title: string; body: string }) =>
    simulate("push", input as unknown as Record<string, unknown>);

export const sendTransactionalEmail = (input: {
    to: string;
    subject: string;
    template: string;
    data?: Record<string, unknown>;
}) => simulate("email", input as unknown as Record<string, unknown>);

export const trackAnalyticsEvent = (input: {
    userId: string;
    event: string;
    timestamp?: number;
    [k: string]: unknown;
}) => simulate("analytics", input as unknown as Record<string, unknown>);

export const upsertCrmContact = (input: { email: string; name: string; source: string }) =>
    simulate("crm.contact", input as unknown as Record<string, unknown>);

export const triggerCrmCampaign = (input: { userId: string; campaignId: string }) =>
    simulate("crm.campaign", input as unknown as Record<string, unknown>);

export const captureRevenueEvent = (input: {
    userId: string;
    amount: number;
    currency: string;
    event: string;
}) => simulate("revenue", input as unknown as Record<string, unknown>);
