import express from "express";
import {purchase_complete_service} from "../services/purchase.service";

export const purchase_complete_controller = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
        return await purchase_complete_service(req, res);
    } catch (err) {
        next(err);
    }
};