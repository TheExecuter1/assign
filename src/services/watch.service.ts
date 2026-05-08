import express from "express";
import {parseExpression} from "cron-parser";
import {getRedisClient} from "../middlewares/rateLimit.middleware";
import {WatchEventInput} from "../validators/watch.schema";
import {logger} from "../utilities/global-utils/logger.utils";
import {send_response} from "../utilities/global-utils/response.utils";

const DIRTY_SET_KEY = "watch_progress:dirty";
const HASH_TTL_SECONDS = 24 * 60 * 60;


enum EEventTypes {
    // frequent events
    WATCH = "watch",
    buffer = "buffer",

    // user events , less frequent
    seek = "seek",
    pause = "pause",
    play = "play",
    completed  = "completed",
}

type WatchProgressPayload = {
    userId: string;
    contentId: string;
    watchedSeconds: number;
    sessionId: string;
    // Added
    event_name ?: EEventTypes;
};

const getWatchProgressRedisKey = (data: Pick<WatchProgressPayload, "userId" | "contentId">) =>
    `watch_progress:${data.userId}:${data.contentId}`;

/**
 * The key is added to a Redis-side dirty set so the flusher can find it .
 */
async function cacheWatchEvent(data: WatchProgressPayload) {
    const client = await getRedisClient();
    const redisKey = getWatchProgressRedisKey(data);


    // Keep track of watch and buffer events to calculate total watch time and buffering time in the flusher.
    if (data.event_name == EEventTypes.WATCH){
        await client.hIncrBy(redisKey, "watch_count", 1);
    }
    if (data.event_name == EEventTypes.buffer){
        await client.hIncrBy(redisKey, "buffer_count", 1);
    }

    await client.hSet(redisKey, {
        userId: data.userId,
        contentId: data.contentId,
        sessionId: data.sessionId,
        event_name: data.event_name,
        watchedSeconds: data.watchedSeconds,
    });
    await client.expire(redisKey, HASH_TTL_SECONDS);

    // adds the key to a Redis set to mark it as dirty/updated, so the flusher can find and process it later.
    await client.sAdd(DIRTY_SET_KEY, redisKey);
}


// fn triggered by startWatchEventFlusher cron
export async function flushWatchProgressToQueue() {
    const client = await getRedisClient();
    try {
        const keys = await client.sMembers(DIRTY_SET_KEY);
        if (keys.length === 0) return;

        for (const redisKey of keys) {
            const hash = await client.hGetAll(redisKey);
            const watch_count = Number(hash.watch_count || 0);
            const buffer_count = Number(hash.buffer_count || 0);

            update_progress_to_db(Date.now(), hash.userId, hash.contentId, Number(hash.watchedSeconds || 0), watch_count, buffer_count).then();
            await client.sRem(DIRTY_SET_KEY, redisKey);

        }
    } catch (error: any) {
        logger.error("watch.flush.failed", {error: error?.message});
    }
}


// Called approximately every 30s per active viewer; ~2,000 concurrent viewers
export const watch_event_service = async (req: express.Request, res: express.Response) => {
    const {userId, contentId, watchedSeconds, sessionId,event_name } = req.body as WatchEventInput;


    //Updated the watch progress in redis cache for quick access and to reduce DB writes.
    await cacheWatchEvent({userId, contentId, watchedSeconds, sessionId});

    // later it is fluhed to the database in batches by the flushWatchProgressToQueue function.
    // Removed the api call as we are handling the watch event totaly via redis and DB

    return send_response(res, {}, 200, "Watch event recorded");
};


async function update_progress_to_db(timestamp, userId, videoId, watch_seconds, event_count, buffer_count) {
    // doing an upsert here
    // over writing and adding to exising duration if exists
    await db_update({
        userId,
        videoId,
        watch_seconds,
        watch_duration: event_count * 30, //  30 seconds of watch time * event count + (existing watch_seconds || 0) in DB,
        buffer_duration : buffer_count * 30,
        timestamp,
    })
}

async function db_update(_payload: {
    userId: string;
    videoId: string;
    watch_seconds: number;
    watch_duration: number;
    buffer_duration: number;
    timestamp: number;
}) {
    return new Promise((resolve) => setTimeout(resolve, 10));
}
