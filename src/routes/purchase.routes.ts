import express from "express";
import { purchase_complete_controller } from "../controllers/purchase.controller";
import { acquireLock } from "../middlewares/rateLimit.middleware";
import { validate_payload } from "../middlewares/validate.middleware";
import { purchaseCompleteSchema } from "../validators/purchase.schema";

const router = express.Router();

router.post(
    "/complete",
    validate_payload(purchaseCompleteSchema),
    // lock the route to prevent duplicate processing of the same purchase
    acquireLock({
        prefix: "lock:purchase_complete",
        ttlMs: 60 * 1000,
        keyExtractor: (req) => {
            const body = req.body as { userId: string; planId: string; txn_refrence_id?: string };
            return  `${body.userId}:${body.planId}:${body.txn_refrence_id}`;
        },
    }),
    purchase_complete_controller,
);

export default router;
