
import type { NextRequest } from 'next/server';
import { resolveClientIpOrUnknown } from './request-ip';

type LimitBucket = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, LimitBucket>();
const DEFAULT_MAX_BUCKETS = 50_000;
const DEFAULT_PRUNE_INTERVAL_MS = 60_000;
let lastPruneAt = 0;

type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs: number };
const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;
type RateLimitBackend = 'auto' | 'upstash' | 'local';
let warnedAutoFallbackInProd = false;
let warnedInvalidBackend = false;
let warnedUpstashFallbackInProd = false;
let warnedSecureDefaultsInProd = false;

function resolveLimitEnv(name: string, fallback: number): number {
    const parsed = Number(process.env[name] || fallback);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pruneBuckets(now: number) {
    const maxBuckets = resolveLimitEnv('RATE_LIMIT_MAX_BUCKETS', DEFAULT_MAX_BUCKETS);

    for (const [key, bucket] of buckets.entries()) {
        if (now > bucket.resetAt) {
            buckets.delete(key);
        }
    }

    if (buckets.size <= maxBuckets) return;

    const overflow = buckets.size - maxBuckets;
    const oldestByReset = [...buckets.entries()]
        .sort((a, b) => a[1].resetAt - b[1].resetAt)
        .slice(0, overflow);

    for (const [key] of oldestByReset) {
        buckets.delete(key);
    }
}

function maybePruneBuckets(now: number) {
    const maxBuckets = resolveLimitEnv('RATE_LIMIT_MAX_BUCKETS', DEFAULT_MAX_BUCKETS);
    const pruneIntervalMs = resolveLimitEnv(
        'RATE_LIMIT_PRUNE_INTERVAL_MS',
        DEFAULT_PRUNE_INTERVAL_MS
    );

    if (now - lastPruneAt >= pruneIntervalMs || buckets.size > maxBuckets) {
        pruneBuckets(now);
        lastPruneAt = now;
    }
}

export function getRequestIp(req: NextRequest): string {
    return resolveClientIpOrUnknown(req.headers);
}

function checkRateLimitLocal(params: {
    key: string;
    limit: number;
    windowMs: number;
}): RateLimitResult {
    const now = Date.now();
    maybePruneBuckets(now);

    const bucket = buckets.get(params.key);

    if (!bucket || now > bucket.resetAt) {
        buckets.set(params.key, {
            count: 1,
            resetAt: now + params.windowMs,
        });
        return {
            allowed: true,
            remaining: Math.max(0, params.limit - 1),
            retryAfterMs: 0,
        };
    }

    if (bucket.count >= params.limit) {
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs: Math.max(0, bucket.resetAt - now),
        };
    }

    bucket.count += 1;
    buckets.set(params.key, bucket);

    return {
        allowed: true,
        remaining: Math.max(0, params.limit - bucket.count),
        retryAfterMs: 0,
    };
}

function normalizeRateLimitValue(raw: number, fallback: number, min = 1): number {
    if (!Number.isFinite(raw)) return fallback;
    const normalized = Math.floor(raw);
    return normalized >= min ? normalized : fallback;
}

function resolveRateLimitBackend(): RateLimitBackend {
    const fallback = process.env.NODE_ENV === 'production' ? 'upstash' : 'auto';
    const raw = (process.env.RATE_LIMIT_BACKEND || fallback).trim().toLowerCase();
    if (raw === 'auto' || raw === 'upstash' || raw === 'local') {
        if (process.env.NODE_ENV === 'production' && !process.env.RATE_LIMIT_BACKEND && !warnedSecureDefaultsInProd) {
            warnedSecureDefaultsInProd = true;
            console.warn('[rate-limit] RATE_LIMIT_BACKEND not set in production. Defaulting to "upstash" for secure distributed enforcement.');
        }
        return raw;
    }

    if (!warnedInvalidBackend) {
        warnedInvalidBackend = true;
        console.warn(`[rate-limit] Invalid RATE_LIMIT_BACKEND="${raw}". Falling back to "${fallback}".`);
    }
    return fallback;
}

function shouldFailClosedOnDistributedFailure(): boolean {
    const raw = (process.env.RATE_LIMIT_FAIL_CLOSED || '').trim().toLowerCase();
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (process.env.NODE_ENV === 'production') {
        if (!warnedSecureDefaultsInProd) {
            warnedSecureDefaultsInProd = true;
            console.warn('[rate-limit] RATE_LIMIT_FAIL_CLOSED not set in production. Defaulting to true for fail-closed behavior.');
        }
        return true;
    }
    return false;
}

function blockedFailClosed(windowMs: number): RateLimitResult {
    return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, windowMs),
    };
}

function parsePipelineResult(raw: unknown): unknown[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (
        typeof raw === 'object'
        && raw !== null
        && 'result' in raw
        && Array.isArray((raw as { result?: unknown }).result)
    ) {
        return (raw as { result: unknown[] }).result;
    }
    return [];
}

function toNumericResult(entry: unknown): number {
    if (typeof entry === 'number') return entry;
    if (
        entry
        && typeof entry === 'object'
        && 'result' in entry
        && typeof (entry as { result?: unknown }).result === 'number'
    ) {
        return (entry as { result: number }).result;
    }
    if (
        entry
        && typeof entry === 'object'
        && 'result' in entry
        && typeof (entry as { result?: unknown }).result === 'string'
    ) {
        const parsed = Number((entry as { result: string }).result);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof entry === 'string') {
        const parsed = Number(entry);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}

async function checkRateLimitUpstash(params: {
    key: string;
    limit: number;
    windowMs: number;
}): Promise<RateLimitResult | null> {
    const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
    const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
    if (!url || !token) return null;

    const redisKey = `rl:${params.key}`;
    const pipelineBody = [
        ['INCR', redisKey],
        ['PEXPIRE', redisKey, String(params.windowMs), 'NX'],
        ['PTTL', redisKey],
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    try {
        const response = await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(pipelineBody),
            signal: controller.signal,
        });

        if (!response.ok) return null;
        const json = await response.json();
        const result = parsePipelineResult(json);

        const count = toNumericResult(result[0]);
        const rawTtl = toNumericResult(result[2]);
        const ttlMs = rawTtl > 0 ? rawTtl : params.windowMs;

        if (count <= 0) return null;

        return {
            allowed: count <= params.limit,
            remaining: Math.max(0, params.limit - count),
            retryAfterMs: count <= params.limit ? 0 : ttlMs,
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

export async function checkRateLimit(params: {
    key: string;
    limit: number;
    windowMs: number;
}): Promise<RateLimitResult> {
    const normalizedParams = {
        key: params.key,
        limit: normalizeRateLimitValue(params.limit, DEFAULT_LIMIT),
        windowMs: normalizeRateLimitValue(params.windowMs, DEFAULT_WINDOW_MS),
    };

    const backend = resolveRateLimitBackend();
    if (backend === 'local') {
        return checkRateLimitLocal(normalizedParams);
    }

    const distributed = await checkRateLimitUpstash(normalizedParams);
    if (distributed) {
        return distributed;
    }

    const failClosed = shouldFailClosedOnDistributedFailure();
    if (backend === 'upstash' && failClosed) {
        return blockedFailClosed(normalizedParams.windowMs);
    }

    if (process.env.NODE_ENV === 'production' && backend === 'auto' && !warnedAutoFallbackInProd) {
        warnedAutoFallbackInProd = true;
        console.warn(
            '[rate-limit] Falling back to local in-memory limiter in production. Configure Upstash and RATE_LIMIT_BACKEND=upstash for distributed enforcement.'
        );
    }

    if (
        process.env.NODE_ENV === 'production'
        && backend === 'upstash'
        && !failClosed
        && !warnedUpstashFallbackInProd
    ) {
        warnedUpstashFallbackInProd = true;
        console.warn(
            '[rate-limit] Upstash backend unavailable; using local fallback because RATE_LIMIT_FAIL_CLOSED is false.'
        );
    }
    return checkRateLimitLocal(normalizedParams);
}
