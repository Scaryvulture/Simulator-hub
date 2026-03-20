import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCspValue, getCspHeaderKey, shouldEnableCspNonce } from '@/lib/csp';

describe('csp', () => {
    it('defaults to blocking all frame ancestors when no trusted LMS origins are configured', () => {
        const previousOrigins = process.env.LTI_TRUSTED_EMBED_ORIGINS;
        try {
            delete process.env.LTI_TRUSTED_EMBED_ORIGINS;
            const csp = buildCspValue({ isDev: false });
            assert.match(csp, /frame-ancestors 'none'/);
        } finally {
            if (previousOrigins === undefined) {
                delete process.env.LTI_TRUSTED_EMBED_ORIGINS;
            } else {
                process.env.LTI_TRUSTED_EMBED_ORIGINS = previousOrigins;
            }
        }
    });

    it('allows trusted LMS embed origins in frame-ancestors', () => {
        const previousOrigins = process.env.LTI_TRUSTED_EMBED_ORIGINS;
        try {
            process.env.LTI_TRUSTED_EMBED_ORIGINS = 'https://lms.example.com, https://campus.example.org';
            const csp = buildCspValue({ isDev: false });
            assert.match(csp, /frame-ancestors 'self' https:\/\/lms\.example\.com https:\/\/campus\.example\.org/);
            assert.doesNotMatch(csp, /frame-ancestors 'none'/);
        } finally {
            if (previousOrigins === undefined) {
                delete process.env.LTI_TRUSTED_EMBED_ORIGINS;
            } else {
                process.env.LTI_TRUSTED_EMBED_ORIGINS = previousOrigins;
            }
        }
    });

    it('enables nonce by default in production', () => {
        const previousNodeEnv = process.env.NODE_ENV;
        const previousNonce = process.env.CSP_NONCE_ENABLED;
        try {
            process.env.NODE_ENV = 'production';
            delete process.env.CSP_NONCE_ENABLED;
            assert.equal(shouldEnableCspNonce(), true);
        } finally {
            if (previousNodeEnv === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = previousNodeEnv;
            }
            if (previousNonce === undefined) {
                delete process.env.CSP_NONCE_ENABLED;
            } else {
                process.env.CSP_NONCE_ENABLED = previousNonce;
            }
        }
    });

    it('builds nonce-based script-src when nonce mode is enabled', () => {
        const previousNonce = process.env.CSP_NONCE_ENABLED;
        const previousInline = process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT;
        try {
            process.env.CSP_NONCE_ENABLED = 'true';
            process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT = 'true';

            const csp = buildCspValue({ isDev: false, nonce: 'abc123' });
            assert.match(csp, /script-src[^;]*'nonce-abc123'/);
            assert.match(csp, /script-src[^;]*'strict-dynamic'/);
            assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
        } finally {
            if (previousNonce === undefined) {
                delete process.env.CSP_NONCE_ENABLED;
            } else {
                process.env.CSP_NONCE_ENABLED = previousNonce;
            }
            if (previousInline === undefined) {
                delete process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT;
            } else {
                process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT = previousInline;
            }
        }
    });

    it('falls back to unsafe-inline compatibility mode when nonce is disabled', () => {
        const previousNonce = process.env.CSP_NONCE_ENABLED;
        const previousInline = process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT;
        try {
            process.env.CSP_NONCE_ENABLED = 'false';
            process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT = 'true';

            const csp = buildCspValue({ isDev: false });
            assert.match(csp, /script-src[^;]*'unsafe-inline'/);
            assert.doesNotMatch(csp, /script-src[^;]*'nonce-/);
        } finally {
            if (previousNonce === undefined) {
                delete process.env.CSP_NONCE_ENABLED;
            } else {
                process.env.CSP_NONCE_ENABLED = previousNonce;
            }
            if (previousInline === undefined) {
                delete process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT;
            } else {
                process.env.CSP_ALLOW_UNSAFE_INLINE_SCRIPT = previousInline;
            }
        }
    });

    it('supports report-only header mode', () => {
        const previous = process.env.CSP_REPORT_ONLY;
        try {
            process.env.CSP_REPORT_ONLY = 'true';
            assert.equal(getCspHeaderKey(), 'Content-Security-Policy-Report-Only');
        } finally {
            if (previous === undefined) {
                delete process.env.CSP_REPORT_ONLY;
            } else {
                process.env.CSP_REPORT_ONLY = previous;
            }
        }
    });
});
