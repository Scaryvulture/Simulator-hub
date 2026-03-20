import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    isContentLengthOverLimit,
    isValidUuid,
    sanitizeSessionMetadata,
    parseJsonBodyWithLimit,
    PayloadTooLargeError,
} from '@/lib/request-validation';

describe('request-validation', () => {
    it('accepts valid UUIDs and rejects invalid values', () => {
        assert.equal(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
        assert.equal(isValidUuid('not-a-uuid'), false);
        assert.equal(isValidUuid(123), false);
    });

    it('strips reserved metadata keys', () => {
        const metadata = sanitizeSessionMetadata({
            user_note: 'ok',
            session_id: 'should-be-removed',
            bot_id: 'should-be-removed',
            external_user_id: 'should-be-removed',
            rag_traces: [{ test: true }],
            trigger_traces: [{ test: true }],
            voice_audit_events: [{ test: true }],
            llm_prompt_traces: [{ test: true }],
            evaluation_log_access_audit: [{ test: true }],
            runtime_block: { reason: 'test' },
            flow_state: { ended: true },
            lti_launch: { mapping_id: 'secret' },
            lti_outcome_sync: { status: 'failed' },
        });

        assert.deepEqual(metadata, { user_note: 'ok' });
    });

    it('enforces metadata size limit', () => {
        const previous = process.env.SESSION_METADATA_MAX_BYTES;
        process.env.SESSION_METADATA_MAX_BYTES = '256';

        try {
            assert.throws(
                () => sanitizeSessionMetadata({ payload: 'x'.repeat(5_000) }),
                /metadata exceeds maximum allowed size/i
            );
        } finally {
            if (previous === undefined) {
                delete process.env.SESSION_METADATA_MAX_BYTES;
            } else {
                process.env.SESSION_METADATA_MAX_BYTES = previous;
            }
        }
    });

    it('detects oversized content-length safely', () => {
        assert.equal(isContentLengthOverLimit('1024', 2048), false);
        assert.equal(isContentLengthOverLimit('4096', 2048), true);
        assert.equal(isContentLengthOverLimit(null, 2048), false);
        assert.equal(isContentLengthOverLimit('abc', 2048), false);
        assert.equal(isContentLengthOverLimit('-1', 2048), false);
    });

    it('parses json body within configured byte limit', async () => {
        const req = new Request('http://localhost/test', {
            method: 'POST',
            body: JSON.stringify({ a: 1, b: 'ok' }),
            headers: { 'content-type': 'application/json' },
        });

        const parsed = await parseJsonBodyWithLimit(req, 1024);
        assert.deepEqual(parsed, { a: 1, b: 'ok' });
    });

    it('rejects json body when real byte size exceeds configured limit', async () => {
        const req = new Request('http://localhost/test', {
            method: 'POST',
            body: JSON.stringify({ payload: 'x'.repeat(500) }),
            headers: { 'content-type': 'application/json' },
        });

        await assert.rejects(
            () => parseJsonBodyWithLimit(req, 32),
            (error: unknown) => error instanceof PayloadTooLargeError
        );
    });

    it('throws syntax error for invalid json body', async () => {
        const req = new Request('http://localhost/test', {
            method: 'POST',
            body: '{"invalid":',
            headers: { 'content-type': 'application/json' },
        });

        await assert.rejects(
            () => parseJsonBodyWithLimit(req, 1024),
            (error: unknown) => error instanceof SyntaxError
        );
    });
});
