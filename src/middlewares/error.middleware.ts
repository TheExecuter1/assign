import { ErrSeverity, send_slack_message } from "../utilities/global-utils/notify.utils";
import express from "express";
import { logger } from "../utilities/global-utils/logger.utils";

export const errorMiddleware = (
    err: any,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
) => {
    logger.error("unhandled.error", {
        path: req.originalUrl,
        method: req.method,
        message: err?.message,
        stack: err?.stack,
    });

    // Best-effort alerting; never let it crash the response.
    send_slack_message(err?.stack || String(err), ErrSeverity.high, req.body, req).catch(() => undefined);

    if (res.headersSent) {
        return;
    }
    res.status(500).json({
        status: 500,
        data: null,
        error: "Internal server error",
    });
};