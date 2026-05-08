import { z } from "zod";

export const purchaseCompleteSchema = z.object({
    userId: z.string().min(1).max(64),
    planId: z.string().min(1).max(64),
    amount: z.number().positive().finite().max(10_000_000),
    currency: z.string().length(3).default("INR"),
    email: z.string().email().max(254),
    deviceToken: z.string().min(1).max(512).optional(),
    // Added
    txn_refrence_id: z.string().min(1).max(128).optional(),
});

export type PurchaseCompleteInput = z.infer<typeof purchaseCompleteSchema>;
