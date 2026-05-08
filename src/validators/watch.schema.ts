import { z } from "zod";

export const watchEventSchema = z.object({
    userId: z.string().min(1).max(64),
    contentId: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(128),
    watchedSeconds: z.number().int().nonnegative(),
    event_name: z.enum(["watch", "buffer", "seek", "pause", "play", "completed"]).optional(),
});

export type WatchEventInput = z.infer<typeof watchEventSchema>;
