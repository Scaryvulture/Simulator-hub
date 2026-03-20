import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    resolveClientIpFromHeaders,
    resolveClientIpOrUnknown,
    UNKNOWN_IP,
} from '@/lib/request-ip';

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

describe('request-ip', () => {
    it('ignores proxy headers when TRUST_PROXY_HEADERS is disabled', async () => {
        await withEnv({ TRUST_PROXY_HEADERS: 'false' }, () => {
            const headers = new Headers({
                'x-real-ip': '203.0.113.10',
                'x-forwarded-for': '203.0.113.11',
            });

            const resolved = resolveClientIpFromHeaders(headers);
            assert.equal(resolved, null);
            assert.equal(resolveClientIpOrUnknown(headers), UNKNOWN_IP);
        });
    });

    it('uses x-forwarded-for first valid segment when proxy headers are trusted', async () => {
        await withEnv({ TRUST_PROXY_HEADERS: 'true' }, () => {
            const headers = new Headers({
                'x-forwarded-for': 'unknown, 198.51.100.24, 10.0.0.1',
                'x-real-ip': '203.0.113.99',
            });

            const resolved = resolveClientIpFromHeaders(headers);
            assert.equal(resolved, '198.51.100.24');
        });
    });

    it('prefers explicit vercel ip header when available', async () => {
        await withEnv({ TRUST_PROXY_HEADERS: 'false' }, () => {
            const headers = new Headers({
                'x-vercel-ip': '203.0.113.25',
                'x-forwarded-for': '198.51.100.1',
            });

            const resolved = resolveClientIpFromHeaders(headers);
            assert.equal(resolved, '203.0.113.25');
        });
    });

    it('trusts proxy headers by default when x-vercel-id is present', async () => {
        await withEnv({ TRUST_PROXY_HEADERS: undefined }, () => {
            const headers = new Headers({
                'x-vercel-id': 'sfo1::abc123',
                'x-forwarded-for': '198.51.100.50, 10.0.0.1',
            });

            const resolved = resolveClientIpFromHeaders(headers);
            assert.equal(resolved, '198.51.100.50');
        });
    });
});
