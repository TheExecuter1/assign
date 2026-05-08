import express from "express";
import { user_signup_service } from "../services/user.service";

export const user_signup_controller = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
) => {
    try {
        return await user_signup_service(req, res);
    } catch (err) {
        next(err);
    }
};
