import express from "express";
import {UserSignupInput} from "../validators/user.schema";
import {enqueue} from "../utilities/external/queue";
import {ErrSeverity, send_slack_message} from "../utilities/global-utils/notify.utils";
import {send_response, status_codes} from "../utilities/global-utils/response.utils";

export const user_signup_service = async (req: express.Request, res: express.Response) => {
    const { userId, email, name, deviceToken } = req.body as UserSignupInput;
    const timestamp = Date.now();

    await saveUserToDB({ userId, email, name });

    try{
        if (deviceToken) {
            enqueue("user.signup.push", {
                token: deviceToken,
                title: "Welcome to Alright!",
                body: `Hi ${name}, start watching now.`,
            }).then();
        }

        enqueue("user.signup.analytics", {userId, event: "user_signup", timestamp}).then();
        enqueue("user.signup.crm", {email, name, source: "organic_signup"}).then();
    }catch (e) {
        send_slack_message("error senidng signup event",ErrSeverity.medium ,{error: e instanceof Error ? e.message : String(e)}).then();
        console.error(e);
    }

    return send_response(res, true, status_codes.NEW_USER, "User created successfully");
};

async function saveUserToDB(_user: { userId: string; email: string; name: string }) {
    return new Promise((resolve) => setTimeout(resolve, 10));
}