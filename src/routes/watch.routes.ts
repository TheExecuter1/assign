import express from "express";
import { watch_event_controller } from "../controllers/watch.controller";
import { rateLimit } from "../middlewares/rateLimit.middleware";
import { validate_payload } from "../middlewares/validate.middleware";
import { watchEventSchema } from "../validators/watch.schema";

const router = express.Router();

router.post(
    "/event",
    validate_payload(watchEventSchema),

    // Rate limit by userId+sessionId+contentId to prevent abuse while allowing legitimate heartbeats
    // allowing at max 4 events per 10 second window for the same user-session-content combination
    rateLimit({
        prefix: "watch_event",
        limit: 4,
        windowMs: 10_000,
        keyExtractor: (req) => {
            const body = req.body as { userId: string; sessionId: string; contentId: string };
            return `${body.userId}:${body.sessionId}:${body.contentId}`;
        },
        errorMessage: "Heartbeat rate exceeded",
    }),
    watch_event_controller,
);

export default router;

