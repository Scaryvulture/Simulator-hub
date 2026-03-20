import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    toPublicChatResponse,
    toPublicSessionResponse,
} from '@/lib/public-response-contract';

describe('public-response-contract', () => {
    it('exposes only safe keys for normal chat responses', () => {
        const payload = toPublicChatResponse({
            content: 'hola',
            ended: false,
            bypass: false,
            rag_no_evidence: true,
            ragTrace: { id: 'trace' },
            triggerAudit: [{ id: 1 }],
            usage: { prompt_tokens: 100 },
            costUsd: 0.1,
        } as unknown as Record<string, unknown>);

        assert.deepEqual(Object.keys(payload).sort(), ['bypass', 'content', 'end_reason', 'ended', 'rag_no_evidence']);
        assert.equal(payload.content, 'hola');
        assert.equal(payload.rag_no_evidence, true);
        assert.equal(payload.end_reason, null);
    });

    it('exposes only safe keys for ended chat responses', () => {
        const payload = toPublicChatResponse({
            content: 'La sesión ha finalizado.',
            ended: true,
            bypass: true,
            end_reason: 'SESSION_ALREADY_ENDED',
            rag_no_evidence: true,
            ragTrace: { id: 'trace' },
        } as unknown as Record<string, unknown>);

        assert.deepEqual(Object.keys(payload).sort(), ['bypass', 'content', 'end_reason', 'ended', 'rag_no_evidence']);
        assert.equal(payload.ended, true);
        assert.equal(payload.end_reason, 'SESSION_ALREADY_ENDED');
        assert.equal(payload.rag_no_evidence, true);
    });

    it('sanitizes session metadata for non-admin viewers', () => {
        const safeSession = toPublicSessionResponse({
            id: 'session_1',
            bot_id: 'bot_1',
            organization_id: 'org_1',
            external_user_id: 'user_1',
            created_at: new Date('2026-02-23T10:00:00.000Z'),
            ended: false,
            metadata: {
                rag_traces: [{ id: 1 }],
                trigger_traces: [{ id: 2 }],
                voice_audit_events: [{ id: 3 }],
                voice_audit_totals: { total: 1 },
                evaluation: {
                    raw_log: 'secret',
                    rag_trace: { id: 9 },
                    score: 90,
                },
                visible: 'ok',
            },
        }, false);

        assert.deepEqual(safeSession, {
            id: 'session_1',
            bot_id: 'bot_1',
            organization_id: 'org_1',
            external_user_id: 'user_1',
            created_at: new Date('2026-02-23T10:00:00.000Z'),
            ended: false,
            metadata: {
                evaluation: { score: 90 },
                visible: 'ok',
            },
        });
    });

    it('does not leak unexpected sensitive fields even if caller passes them', () => {
        const safeSession = toPublicSessionResponse({
            id: 'session_2',
            bot_id: 'bot_2',
            metadata: { ok: true },
            ended: true,
            api_key: 'sk-should-never-leak',
            openai_api_key: 'sk-should-never-leak',
            bot: {
                id: 'bot_2',
                api_key: 'sk-should-never-leak',
                openai_prompt_id: 'pmpt_secret',
            },
        } as unknown as Record<string, unknown>, false);

        assert.equal((safeSession as unknown as { api_key?: string }).api_key, undefined);
        assert.equal((safeSession as unknown as { openai_api_key?: string }).openai_api_key, undefined);
        assert.equal((safeSession as unknown as { bot?: unknown }).bot, undefined);
    });
});
