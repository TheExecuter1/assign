import { Request, Response, NextFunction } from 'express';

interface RequestWithOrgId extends Request {
    orgId?: string;
}

type RedisSetOptions = {
    NX?: boolean;
    PX?: number;
};

type StoredValue = {
    value: string;
    expireAt: number | null;
};

type SetValue = {
    members: Set<string>;
    expireAt: number | null;
};

type RateLimitResult = {
    limit: number;
    count: number;
    remaining: number;
    resetTime: number;
    retryAfterMs: number;
};

class MockRedisClient {
    public isOpen = true;
    private readonly store = new Map<string, StoredValue>();
    private readonly sets = new Map<string, SetValue>();

    on(_event: string, _handler: (...args: unknown[]) => void) {
        return this;
    }

    async connect() {
        this.isOpen = true;
    }

    async get(key: string): Promise<string | null> {
        return this.getEntry(key)?.value ?? null;
    }

    async set(key: string, value: string, options: RedisSetOptions = {}): Promise<'OK' | null> {
        const existing = this.getEntry(key);
        if (options.NX && existing) {
            return null;
        }

        const expireAt = typeof options.PX === 'number' ? Date.now() + options.PX : null;
        this.store.set(key, { value, expireAt });
        return 'OK';
    }

    async hGetAll(key: string): Promise<Record<string, string>> {
        const entry = this.getEntry(key);
        if (!entry) {
            return {};
        }

        try {
            const parsedValue = JSON.parse(entry.value) as Record<string, unknown>;
            return Object.entries(parsedValue).reduce<Record<string, string>>((acc, [field, value]) => {
                acc[field] = String(value ?? '');
                return acc;
            }, {});
        } catch (_error) {
            return {};
        }
    }

    async hSet(key: string, values: Record<string, string | number>): Promise<number> {
        const existingEntry = this.getEntry(key);
        let currentHash: Record<string, string> = {};

        if (existingEntry) {
            try {
                const parsedValue = JSON.parse(existingEntry.value) as Record<string, unknown>;
                currentHash = Object.entries(parsedValue).reduce<Record<string, string>>((acc, [field, value]) => {
                    acc[field] = String(value ?? '');
                    return acc;
                }, {});
            } catch (_error) {
                currentHash = {};
            }
        }

        const nextHash = {
            ...currentHash,
            ...Object.entries(values).reduce<Record<string, string>>((acc, [field, value]) => {
                acc[field] = String(value);
                return acc;
            }, {}),
        };

        this.store.set(key, {
            value: JSON.stringify(nextHash),
            expireAt: existingEntry?.expireAt ?? null,
        });

        return Object.keys(values).length;
    }

    async del(key: string): Promise<number> {
        const existed = this.getEntry(key) ? 1 : 0;
        this.store.delete(key);
        this.sets.delete(key);
        return existed;
    }

    async hIncrBy(key: string, field: string, increment: number): Promise<number> {
        const existing = this.getEntry(key);
        let hash: Record<string, string> = {};
        if (existing) {
            try {
                const parsed = JSON.parse(existing.value) as Record<string, unknown>;
                for (const [k, v] of Object.entries(parsed)) hash[k] = String(v ?? "");
            } catch (_error) {
                hash = {};
            }
        }
        const next = (Number(hash[field] || 0) || 0) + increment;
        hash[field] = String(next);
        this.store.set(key, {
            value: JSON.stringify(hash),
            expireAt: existing?.expireAt ?? null,
        });
        return next;
    }

    async expire(key: string, seconds: number): Promise<number> {
        const entry = this.store.get(key);
        if (entry) {
            entry.expireAt = Date.now() + seconds * 1000;
            return 1;
        }
        const setEntry = this.sets.get(key);
        if (setEntry) {
            setEntry.expireAt = Date.now() + seconds * 1000;
            return 1;
        }
        return 0;
    }

    async sAdd(key: string, members: string | string[]): Promise<number> {
        const set = this.getSet(key) ?? { members: new Set<string>(), expireAt: null };
        const list = Array.isArray(members) ? members : [members];
        let added = 0;
        for (const m of list) {
            if (!set.members.has(m)) {
                set.members.add(m);
                added++;
            }
        }
        this.sets.set(key, set);
        return added;
    }

    async sRem(key: string, members: string | string[]): Promise<number> {
        const set = this.getSet(key);
        if (!set) return 0;
        const list = Array.isArray(members) ? members : [members];
        let removed = 0;
        for (const m of list) {
            if (set.members.delete(m)) removed++;
        }
        if (set.members.size === 0) this.sets.delete(key);
        return removed;
    }

    async sMembers(key: string): Promise<string[]> {
        const set = this.getSet(key);
        return set ? Array.from(set.members) : [];
    }

    clear() {
        this.store.clear();
        this.sets.clear();
    }

    private getEntry(key: string): StoredValue | null {
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expireAt !== null && entry.expireAt <= Date.now()) {
            this.store.delete(key);
            return null;
        }

        return entry;
    }

    private getSet(key: string): SetValue | null {
        const set = this.sets.get(key);
        if (!set) return null;
        if (set.expireAt !== null && set.expireAt <= Date.now()) {
            this.sets.delete(key);
            return null;
        }
        return set;
    }
}

const mockRedisClient = new MockRedisClient();

export const getRedisClient = async (): Promise<MockRedisClient> => {
    if (!mockRedisClient.isOpen) {
        await mockRedisClient.connect();
    }

    return mockRedisClient;
};

const getDefaultIdentifier = (req: RequestWithOrgId): string => {
    if (req.orgId?.trim()) {
        return req.orgId.trim();
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const forwardedIp = forwardedValue?.split(',')[0]?.trim();

    return forwardedIp || req.ip || req.socket?.remoteAddress || 'anonymous';
};

const checkRateLimit = async (key: string, limit: number, windowMs: number): Promise<RateLimitResult> => {
    const client = await getRedisClient();
    const now = Date.now();
    const serialized = await client.get(key);

    let timestamps: number[] = [];
    if (serialized) {
        try {
            timestamps = (JSON.parse(serialized) as number[]).filter((value) => Number.isFinite(value));
        } catch (_error) {
            timestamps = [];
        }
    }

    const activeTimestamps = timestamps.filter((timestamp) => now - timestamp < windowMs);
    activeTimestamps.push(now);

    const resetTime = activeTimestamps[0] + windowMs;
    const retryAfterMs = Math.max(resetTime - now, 0);

    await client.set(key, JSON.stringify(activeTimestamps), {
        PX: retryAfterMs || windowMs,
    });

    const count = activeTimestamps.length;

    return {
        limit,
        count,
        remaining: Math.max(limit - count, 0),
        resetTime,
        retryAfterMs,
    };
};



export interface RateLimitConfig {
    /** Prefix for the Redis key (e.g. 'login', 'checkpoint') */
    prefix: string;
    /** Max requests allowed inside the window */
    limit: number;
    /** Window duration in milliseconds */
    windowMs: number;
    /** Function to derive the unique identifier from the request */
    keyExtractor?: (req: Request) => string;
    /** Optional custom error message when rate limit is hit */
    errorMessage?: string;
}

/**
 * Creates an Express middleware that enforces a sliding-window rate limit.
 *
 * This currently uses a mocked in-memory Redis client so the interface stays
 * compatible until a real Redis client is wired in.
 */
export const rateLimit = (config: RateLimitConfig) => {
    const { prefix, limit, windowMs, keyExtractor } = config;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const typedReq = req as RequestWithOrgId;
            const identifier = (keyExtractor ? keyExtractor(req) : getDefaultIdentifier(typedReq)) || 'anonymous';
            const key = `rate_limit:${prefix}:${identifier}`;
            const result = await checkRateLimit(key, limit, windowMs);

            res.setHeader('X-RateLimit-Limit', String(result.limit));
            res.setHeader('X-RateLimit-Remaining', String(result.remaining));
            res.setHeader('X-RateLimit-Reset', String(result.resetTime));

            if (result.count > limit) {
                res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
                return res.status(429).json({
                    status: 429,
                    data: null,
                    error: config.errorMessage || 'Too many requests. Please try again later.',
                });
            }

            return next();
        } catch (error) {
            console.error('[rateLimit] Middleware error, failing open:', error);
            return next();
        }
    };
};

export interface RouteRateLimitConfig {
    /** Default config if no override matches */
    default: RateLimitConfig;
    /** Map of path prefixes to their specific rate limit configs */
    overrides: Record<string, RateLimitConfig>;
}



export interface LockConfig {
    /** Prefix for the Redis lock key (e.g. 'lock:login') */
    prefix: string;
    /** Max time in ms the lock is held before auto-expiry (safety net) */
    ttlMs?: number;
    /** Function to derive the unique resource identifier from the request */
    keyExtractor: (req: Request) => string;
}

/**
 * Creates an Express middleware that acquires a distributed lock.
 *
 * This currently uses the mocked in-memory Redis client above.
 */
export const acquireLock = (config: LockConfig) => {
    const { prefix, ttlMs = 60_000, keyExtractor } = config;

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const identifier = keyExtractor(req);
            if (!identifier) {
                return next();
            }

            const lockKey = `${prefix}:${identifier}`;
            const lockValue = `${Date.now()}-${Math.random()}`;
            const client = await getRedisClient();
            const acquired = await client.set(lockKey, lockValue, {
                NX: true,
                PX: ttlMs,
            });

            if (!acquired) {
                return res.status(409).json({
                    status: 409,
                    data: null,
                    error: 'Another request for this resource is already in progress. Please wait.',
                });
            }

            let released = false;
            const releaseLock = async () => {
                if (released) {
                    return;
                }
                released = true;

                try {
                    const currentValue = await client.get(lockKey);
                    if (currentValue === lockValue) {
                        await client.del(lockKey);
                    }
                } catch (error) {
                    console.error(`[acquireLock] Failed to release lock ${lockKey}:`, error);
                }
            };

            res.once('finish', () => {
                releaseLock().catch(() => undefined);
            });

            res.once('close', () => {
                releaseLock().catch(() => undefined);
            });

            return next();
        } catch (error) {
            console.error('[acquireLock] Middleware error, failing open:', error);
            return next();
        }
    };
};