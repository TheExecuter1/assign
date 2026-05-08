import { Request, Response, NextFunction } from "express";
import { ZodError, ZodTypeAny } from "zod";
import {send_response} from "../utilities/global-utils/response.utils";


export const validate_payload = (schema: ZodTypeAny) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                status: 400,
                data: null,
                error: "Invalid request body",
                issues: formatZodIssues(result.error),
            });
        }
        req.body = result.data;
        return next();
    };
};

const formatZodIssues = (err: ZodError) =>
    err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
    }));
