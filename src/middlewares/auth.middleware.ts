import express from "express";
import jwt from "jsonwebtoken";
import {send_error_response, status_codes, error_messages} from "../utilities/global-utils/response.utils";

// Endpoints that may be reached without an authenticated user. We match by
// prefix so /api/v1/user/signup and friends work whether they're hit at the
// app-mount level or after /api/v1.
const PUBLIC_PATH_PREFIXES = [
    "/api/v1/user/signup",
    "/api/v1/purchase/complete", // payment provider webhooks land here in real life
    "/api/v1/watch/event",       // device-token authenticated upstream by the CDN edge
    "/health",
];

const isPublicPath = (path: string) =>
    PUBLIC_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + "/"));

export interface AuthedRequest extends express.Request {
    user_id?: string;
    user_email?: string;
}

export async function authMiddleware(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
    if (isPublicPath(req.path)) {
        return next();
    }
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) {
        return send_error_response(res, error_messages.UNAUTHORIZED, {}, status_codes.UNAUTHORIZED);
    }
    try {
        const secret = process.env.JWT_SECRET || "random_token";
        const payload: any = jwt.verify(token, secret);
        req.user_id = payload.user_id;
        req.user_email = payload.email;
        return next();
    } catch (e) {
        return send_error_response(res, error_messages.UNAUTHORIZED, {}, status_codes.UNAUTHORIZED);
    }
}