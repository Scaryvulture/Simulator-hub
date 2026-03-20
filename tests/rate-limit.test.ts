import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { checkRateLimit } from '@/lib/rate-limit';

function withEnv(overrides: Record<string, string | undefined>, run: () => Promise<void> | void) {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(overrides)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    const done = () => {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    };

    const result = run();
    if (result && typeof (result as Promise<void>).then === 'function') {
        return (result as Promise<void>).finally(done);
    }
    done();
}

describe('rate-limit', () => {
    it('blocks after exceeding the configured limit', async () => {
        const key = `test-rate-limit-${Date.now()}`;
        const limit = 2;
        const windowMs = 300;

        const first = await checkRateLimit({ key, limit, windowMs });
        const second = await checkRateLimit({ key, limit, windowMs });
        const third = await checkRateLimit({ key, limit, windowMs });

        assert.equal(first.allowed, true);
        assert.equal(second.allowed, true);
        assert.equal(third.allowed, false);
        assert.equal(third.remaining, 0);
        assert.ok(third.retryAfterMs > 0);
    });

    it('resets after the time window', async () => {
        const key = `test-rate-limit-reset-${Date.now()}`;
        const limit = 1;
        const windowMs = 120;

        const first = await checkRateLimit({ key, limit, windowMs });
        const blocked = await checkRateLimit({ key, limit, windowMs });
        assert.equal(first.allowed, true);
        assert.equal(blocked.allowed, false);

        await new Promise((resolve) => setTimeout(resolve, windowMs + 40));

        const afterWindow = await checkRateLimit({ key, limit, windowMs });
        assert.equal(afterWindow.allowed, true);
    });

    it('falls back to safe defaults when limit/window are invalid', async () => {
        const key = `test-rate-limit-invalid-${Date.now()}`;

        const first = await checkRateLimit({ key, limit: Number.NaN, windowMs: 0 });
        const second = await checkRateLimit({ key, limit: Number.NaN, windowMs: 0 });

        assert.equal(first.allowed, true);
        assert.equal(second.allowed, true);
        assert.ok(Number.isFinite(first.remaining));
        assert.ok(first.remaining >= 0);
    });

    it('enforces fail-closed when upstash backend is required but unavailable', async () => {
        await withEnv(
            {
                RATE_LIMIT_BACKEND: 'upstash',
                RATE_LIMIT_FAIL_CLOSED: 'true',
                UPSTASH_REDIS_REST_URL: undefined,
                UPSTASH_REDIS_REST_TOKEN: undefined,
            },
            async () => {
                const result = await checkRateLimit({
                    key: `test-rate-limit-fail-closed-${Date.now()}`,
                    limit: 10,
                    windowMs: 500,
                });

                assert.equal(result.allowed, false);
                assert.equal(result.remaining, 0);
                assert.ok(result.retryAfterMs > 0);
            }
        );
    });

    it('uses local backend explicitly even when upstash vars are missing', async () => {
        await withEnv(
            {
                RATE_LIMIT_BACKEND: 'local',
                RATE_LIMIT_FAIL_CLOSED: 'true',
                UPSTASH_REDIS_REST_URL: undefined,
                UPSTASH_REDIS_REST_TOKEN: undefined,
            },
            async () => {
                const key = `test-rate-limit-local-backend-${Date.now()}`;
                const first = await checkRateLimit({ key, limit: 1, windowMs: 300 });
                const second = await checkRateLimit({ key, limit: 1, windowMs: 300 });

                assert.equal(first.allowed, true);
                assert.equal(second.allowed, false);
            }
        );
    });

    it('defaults to secure production behavior when backend/fail-closed are unset', async () => {
        await withEnv(
            {
                NODE_ENV: 'production',
                RATE_LIMIT_BACKEND: undefined,
                RATE_LIMIT_FAIL_CLOSED: undefined,
                UPSTASH_REDIS_REST_URL: undefined,
                UPSTASH_REDIS_REST_TOKEN: undefined,
            },
            async () => {
                const result = await checkRateLimit({
                    key: `test-rate-limit-prod-defaults-${Date.now()}`,
                    limit: 5,
                    windowMs: 500,
                });

                assert.equal(result.allowed, false);
                assert.equal(result.remaining, 0);
                assert.ok(result.retryAfterMs > 0);
            }
        );
    });
});
