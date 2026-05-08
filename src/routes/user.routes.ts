import express from "express";
import { user_signup_controller } from "../controllers/user.controller";
import { validate_payload } from "../middlewares/validate.middleware";
import { userSignupSchema } from "../validators/user.schema";

const router = express.Router();

router.post("/signup", validate_payload(userSignupSchema), user_signup_controller);

export default router;
