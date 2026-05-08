import express from "express";
import {PurchaseCompleteInput} from "../validators/purchase.schema";
import {enqueue} from "../utilities/external/queue";
import {ErrSeverity, send_slack_message} from "../utilities/global-utils/notify.utils";
import {send_response} from "../utilities/global-utils/response.utils";

export const purchase_complete_service = async (req: express.Request, res: express.Response) => {
    const {userId, planId, amount, currency, email, deviceToken} = req.body as PurchaseCompleteInput;

    await savePurchaseToDB({userId, planId, amount});
    try {


        if (deviceToken) {
            enqueue("purchase.push", {
                token: deviceToken,
                title: "Purchase Successful!",
                body: `Your ${planId} plan is now active.`,
            }).then();
        }

        enqueue("purchase.email", {
            to: email,
            subject: "Your subscription is active",
            template: "purchase_confirmation",
            data: {planId, amount},
        }).then();

        enqueue("purchase.revenue", {userId, amount, currency, event: "subscription_purchase"}).then();

        enqueue("purchase.crm_campaign", {userId, campaignId: "post_purchase_upsell"}).then();

    } catch (e) {
        // Alerting va slack
        send_slack_message("error processing purchase events", ErrSeverity.medium, {error: e instanceof Error ? e.message : String(e)}).then();
    }

    return send_response(res, true, 200, "Purchase recorded");
};

async function savePurchaseToDB(_purchase: { userId: string; planId: string; amount: number }) {
    return new Promise((resolve) => setTimeout(resolve, 15));
}