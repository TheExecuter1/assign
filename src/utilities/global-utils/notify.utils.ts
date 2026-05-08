import axios from "axios";

import {exec} from "child_process";
import {get_environment} from "./environment.utils";

export enum ErrSeverity {
    high = "high",
    medium = "medium",
    low = "low",
}

export enum SlackChannel {
    test_Chan=  "teset"
}

export const getBranch = () =>
    new Promise((resolve, reject) => {
        return exec("git rev-parse --abbrev-ref HEAD", (err, stdout, stderr) => {
            if (err) reject(`getBranch Error: ${err}`);
            else if (typeof stdout === "string") resolve(stdout.trim());
        });
    });

export const try_shortening_context = (params: any) => {
    try {
        let ret_params = params;
        if (params) {
            if (typeof params === "string") {
                ret_params = params.toString();
                if (ret_params.length > 16) {
                    if (params.toString().includes('https:')) return params
                    ret_params = params.toString().slice(0, 4) + "..." + params.toString().slice(-4);
                }
            } else if (Array.isArray(params)) {
                ret_params = [];
                for (const k of params) {
                    ret_params.push(try_shortening_context(k));
                }
            } else if (Object.keys(params).length > 0) {
                ret_params = {};
                for (const k in params) {
                    ret_params[k] = try_shortening_context(params[k]);
                }
            }
        }
        return ret_params;
    } catch (e) {
        console.log(e);
    }
    return params;
};

export const send_slack_message = async (error_message: string, severity: ErrSeverity = ErrSeverity.high, context: any = "", request?: any) => {
    const env = get_environment();

    let icon = "red_circle";
    if (severity === ErrSeverity.medium) {
        icon = "large_orange_circle";
    }
    if (severity === ErrSeverity.low) {
        icon = "large_yellow_circle";
    }

    let db_log_payload = context;
    try {
        db_log_payload = JSON.stringify(db_log_payload);
    } catch {
        try {
            db_log_payload = db_log_payload.toString();
        } catch {
        }
    }

    context = try_shortening_context(context);
    try {
        context = JSON.stringify(context);
    } catch {
        try {
            context = context.toString();
        } catch {
        }
    }

    const api = request ? request.originalUrl || request.slack_message : "";

    // console.log('==========',api)

    // Store in DB
    // const is_to_be_sent = await store_error_on_db(api, error_message, severity, db_log_payload, request);
    const is_to_be_sent = true;
    if (is_to_be_sent || env.env_mode != "prod") {
        const payload = {
            blocks: [
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `${api} :${icon}:`,
                    },
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: error_message,
                    },
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "• Context: " + context.slice(0, 2499),
                    },
                },
            ],
        };

        payload.blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `• Branch: ${await getBranch()}`,
            },
        },)

        try {
            await axios.post(env.bug_slack_channel_url, payload);
        } catch (e) {
        }
    }
};


