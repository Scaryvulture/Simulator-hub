import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
    getRequestOriginFromHeaders,
    isCsrfExemptPath,
    isTrustedRequestOrigin,
    isUnsafeHttpMethod,
    resolveTrustedOrigins,
} from '@/lib/csrf'

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
    const previous: Record<string, string | undefined> = {}
    for (const [key, value] of Object.entries(overrides)) {
        previous[key] = process.env[key]
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }

    try {
        run()
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key]
            } else {
                process.env[key] = value
            }
        }
    }
}

describe('csrf', () => {
    it('recognizes unsafe HTTP methods', () => {
        assert.equal(isUnsafeHttpMethod('POST'), true)
        assert.equal(isUnsafeHttpMethod('patch'), true)
        assert.equal(isUnsafeHttpMethod('GET'), false)
    })

    it('keeps only explicit exempt paths', () => {
        assert.equal(isCsrfExemptPath('/api/auth/lti/login'), true)
        assert.equal(isCsrfExemptPath('/api/auth/lti/launch'), true)
        assert.equal(isCsrfExemptPath('/api/admin/qa-runs/worker'), true)
        assert.equal(isCsrfExemptPath('/api/chat/route'), false)
    })

    it('extracts request origin from origin/referer headers', () => {
        const fromOrigin = new Headers({
            origin: 'https://app.example.com',
        })
        assert.equal(getRequestOriginFromHeaders(fromOrigin), 'https://app.example.com')

        const fromReferer = new Headers({
            referer: 'https://app.example.com/admin/page?tab=1',
        })
        assert.equal(getRequestOriginFromHeaders(fromReferer), 'https://app.example.com')

        const invalid = new Headers({
            origin: '%%%invalid',
        })
        assert.equal(getRequestOriginFromHeaders(invalid), null)
    })

    it('builds trusted origins from request origin plus CSRF_TRUSTED_ORIGINS', () => {
        withEnv(
            {
                CSRF_TRUSTED_ORIGINS: 'https://app.example.com, https://admin.example.com,%%%invalid',
            },
            () => {
                const trusted = resolveTrustedOrigins('https://main.example.com')
                assert.equal(trusted.has('https://main.example.com'), true)
                assert.equal(trusted.has('https://app.example.com'), true)
                assert.equal(trusted.has('https://admin.example.com'), true)
                assert.equal(trusted.has('%%%invalid'), false)
            }
        )
    })

    it('validates trusted request origin with optional missing-origin allowance', () => {
        const trustedOrigins = new Set(['https://main.example.com'])

        assert.equal(
            isTrustedRequestOrigin({
                candidateOrigin: 'https://main.example.com',
                trustedOrigins,
                allowMissingOrigin: false,
            }),
            true
        )

        assert.equal(
            isTrustedRequestOrigin({
                candidateOrigin: 'https://evil.example.com',
                trustedOrigins,
                allowMissingOrigin: false,
            }),
            false
        )

        assert.equal(
            isTrustedRequestOrigin({
                candidateOrigin: null,
                trustedOrigins,
                allowMissingOrigin: true,
            }),
            true
        )

        assert.equal(
            isTrustedRequestOrigin({
                candidateOrigin: null,
                trustedOrigins,
                allowMissingOrigin: false,
            }),
            false
        )
    })
})
