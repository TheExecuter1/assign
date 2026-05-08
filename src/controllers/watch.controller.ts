import express from "express";
import { watch_event_service } from "../services/watch.service";

export const watch_event_controller = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) => {
    try {
        return await watch_event_service(req, res);
    } catch (err) {
        next(err);
    }
};
