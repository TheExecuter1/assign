# DESIGN.md

## 1. What I identified in the original code

The original service worked, but every endpoint was structured the same way: do a small DB call, then `await axios.post(...)` to N external services in series, then respond. 
That causes issues as it depends on third response for user facing api. Also every event was getting pushed to DB causing DB load. 


### NOTE : in utilities/global utils environment_utils, notify utils and response_utils are mu go to boilerplat utilites that i use in all of my projects.

**Reliability**

- **User-facing latency is bound to the third party apis.** Signup awaits push, then analytics, then CRM. If the CRM slows down , it affects signup too. None of these calls are required to confirm "user created".
- **No timeouts on outbound HTTP.** A hung TCP connection holds an Express worker indefinitely.
- **No retries.** A single 500 from analytics drops the event silently (the catch just logs).
- **Just printing** out an error to console no alert, no DLQ.
- **Process death = data loss.** No graceful shutdown; SIGTERM during deploy drops everything in flight.

**Scalability**

- **Watch heartbeat does a DB write per request.** At 2,000 viewers × 2 heartbeats/min = 4,000 writes/min just for progress, before any growth. The heartbeat also calls analytics on the request path — same 4k RPM hitting an internal service.

**Correctness**

- **No input validation.** `req.body` is destructured raw. A missing `userId` writes `undefined` to the DB; a malformed `amount` flows into revenue capture as a string.
- **Purchase has no idempotency.** A double-tap on the client triggers two charges/two campaign sends.
- **Auth middleware blocked the new endpoints.** `PUBLIC_PATHS` referred to paths that don't exist on this service (`/api/v1/auth/...`) and used exact-equality matching, so `/api/v1/user/signup` required a JWT — which a brand-new user, by definition, does not have.
- **No Error middleware**, so unhandled errors fell through to the default Express HTML 500 page.


## 2. What I changed and why

### 2.1 Validation: `zod` schemas + a `validateBody` middleware
`src/validators/{user,purchase,watch}.schema.ts` describe the inbound payload srtucture. `validateBody(schema)` parses, replaces `req.body` with the parsed value (so downstream code is typed), and returns a structured 400 with field-level issues on failure. Failures never reach controllers; controllers/services can rely on the shape.

I considered putting validation inside each service. I chose the middleware boundary because (a) it keeps services free of HTTP concerns, (b) it lets routes compose `validate → rateLimit → lock → controller` in the order I want lock to apply only to *valid* requests.

### 2.2  A mock durable queue + mock consumers
`src/utilities/external/queue.ts` exposes `enqueue(queueName, payload)` and `registerConsumer(queueName, handler)`. Services publish; mock workers register consumers. The mock simulates ~5 ms publish latency and a 0.1% enqueue failure, and on a successful publish dispatches the message to the registered handler via `setImmediate` so the publisher is decoupled from downstream work.

For all the third party calls which were await i pushed that to a mock queue (like rabbitmq/sqs) so that we can do fire and forget for it so we dont delay the response fo api and stress our servic. 

### 2.3 Watch service: Major Change
The original approach (DB on every heartbeat) does not scale. Aggregation has to live somewhere, so it lives in Redis on the way in, and a periodic cron job drains it to the DB in batches.

**Heartbeat path (`POST /watch/event`):**
- `validate → cacheWatchEvent (Redis HINCRBY + HSET + dirty_set) → 200`.
- `cacheWatchEvent` tracks **two separate atomic counters** per `(userId, contentId)` hash:
  - `watch_count` — incremented on every event with `event_name = "watch"`.
  - `buffer_count` — incremented on every event with `event_name = "buffer"`.
- An `HSET` overwrites `watchedSeconds` with the latest value.
- The key is added to a Redis-side dirty set (`watch_progress:dirty`) so the cron can discover it after a restart.
- A 24 h TTL on each hash cleans up abandoned sessions.

**Cron flusher (`src/utilities/jobs/watch_event_flusher.ts`):**
- `startWatchEventFlusher` schedules `flushWatchProgressToQueue` via **`node-cron`** using `WATCH_PROGRESS_FLUSH_CRON` (default `* * * * *` = every minute, configurable).
- For each key in the dirty set it reads the full hash and computes:
  - `watch_duration = watch_count × 30 s` (one heartbeat ≈ 30 s of viewing).
  - `buffer_duration = buffer_count × 30 s`.
- It fires `update_progress_to_db(...)` **fire-and-forget** (`.then()`) and immediately removes the key from the dirty set.
- On graceful shutdown (`SIGTERM`/`SIGINT`), `stopWatchEventFlusher` is called and one final `flushWatchProgressToQueue()` is awaited so the trailing cron window is not lost.

Net effect: regardless of how many heartbeats arrive for a given `(user, content)` in the cron window, the DB receives one aggregated write per minute carrying `watchedSeconds`, `watch_duration`, and `buffer_duration`. The write rate scales with *unique active viewers*, not with heartbeat frequency.


## 3. Trade-offs I consciously made
- I currently designed the service for immediate relief and a single-instance deploy, so some of the reliability issues (duplicate flushes, lost cron windows) only occur in a multi pod scenario. I chose to accept those issues for now to reduce complexity, but I flagged them in the code.

- **Cron (`node-cron`) instead of Kafka / event-streaming for the watch flusher.** The simplest correct solution given the time and constraint of no external infra. `node-cron` runs in-process and fires every minute; it has no persistence across restarts either. The graceful shutdown flush mitigates the trailing-window loss on normal deploys, but a hard crash still drops the last cron window. A streaming approach (Kafka consumer group) would give true at-least-once delivery without any cron at all — heartbeat events become Kafka messages, and a consumer group commits offsets only after the DB write succeeds.

- **Watch flusher writes directly to DB (no intermediate queue hop).** I better approach will be like discussed in system design round where I push the flushed to a go service that has a channel from where the go routines write to database, making the flush fire and forget.

- **No distributed flush lock.** Multiple pods will each run their own cron tick. Because each key is removed from the dirty set immediately after the `update_progress_to_db` call, two pods racing to flush the same key would both read it before either removes it,  resulting in a duplicate DB write. A single consumer Kafka consumer eliminates this. With a single-pod deploy the race does not occur.

- **All side effects are fire-and-forget.** Both signup and purchase publish to their queues with `.then()` — the HTTP response does not wait for broker acknowledgment. This gives the lowest possible latency but means a publish failure after `res.json()` is silent: the push notification or CRM event is lost. Awaiting the enqueue (or using the outbox pattern for purchase) gives the at-least-once guarantee at the cost of ~5 ms additional latency.

- **No structured request id / tracing.** Would add `x-request-id` propagation in production.


## 4. Remaining gaps / what I'd do with more time

1. **Replace cron with Kafka for the watch flusher.** `node-cron` runs in-process, has no persistence, and requires a distributed lock to be safe across pods. A Kafka consumer group eliminates all three problems at once. 

2. **Distributed flush lock.** Until cron is replaced by Kafka, a `SET NX PX` lock on `lock:watch_progress_flush` is needed to prevent duplicate DB writes when more than one pod is running.

3. **Forward `event_name` in `watch_event_service`.** The field is destructured from `req.body` but not passed to `cacheWatchEvent`, so `watch_count` / `buffer_count` increments never fire. One-line fix: `cacheWatchEvent({ userId, contentId, watchedSeconds, sessionId, event_name })`.

4. **Real broker + consumer behind `queue.ts`.** The publisher API is already shaped like RabbitMQ/SQS,  plus consumer workers for push/email/analytics/CRM/revenue with per-queue DLQs and a redrive policy.

5. **Trasaction safety for purchase.** `savePurchaseToDB` and "publish purchase event" should be in the same DB transaction (DB row + outbox row), so that only successfull txn enets are synced. 

6. **Retry and Circuit breaker.** Curently there are no retries and  circuit breakers for a failed event or process .
7. **Tests.** Unit tests for zod schemas, the watch flusher (counter splits, dirty-set lifecycle, graceful shutdown), and the queue mock (fire-and-forget vs await). Integration tests per endpoint with the mock Redis.
8. **Observability.** Replace the logger with `pino` or another logger. 
9. **Rate-limit storage at scale.** The sliding-window-of-timestamps approach reads/writes a JSON blob per request. A token-bucket via Lua (`redis-rate-limit-flexible`) is cheaper at high RPS.


