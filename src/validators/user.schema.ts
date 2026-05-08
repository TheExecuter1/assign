import { z } from "zod";

export const userSignupSchema = z.object({
    userId: z.string().min(1).max(64),
    email: z.string().email().max(254),
    name: z.string().min(1).max(120),
    deviceToken: z.string().min(1).max(512).optional(),
});

export type UserSignupInput = z.infer<typeof userSignupSchema>;
