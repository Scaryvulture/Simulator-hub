import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeConversationMetadataForViewer } from '@/lib/metadata-visibility';

describe('metadata-visibility', () => {
    it('keeps audit metadata for admin viewers', () => {
        const now = new Date().toISOString();
        const metadata = sanitizeConversationMetadataForViewer({
            rag_traces: [{ id: 1 }],
            trigger_traces: [{ id: 2 }],
            voice_audit_events: [{ id: 3 }],
            voice_audit_totals: { total: 1 },
            evaluation_log_access_audit: [{ id: 'entry-1' }],
            lti_launch: { mapping_id: 'map_1', bot_id: 'bot_1' },
            lti_outcome_sync: { status: 'synced', scoreGiven: 83, scoreMaximum: 100, attemptedAt: now },
            evaluation: { raw_log: 'x', rag_trace: { id: 9 }, score: 80, timestamp: now },
        }, true);

        assert.deepEqual(metadata, {
            rag_traces: [{ id: 1 }],
            trigger_traces: [{ id: 2 }],
            voice_audit_events: [{ id: 3 }],
            voice_audit_totals: { total: 1 },
            evaluation_log_access_audit: [{ id: 'entry-1' }],
            lti_launch: { mapping_id: 'map_1', bot_id: 'bot_1' },
            lti_outcome_sync: { status: 'synced', scoreGiven: 83, scoreMaximum: 100, attemptedAt: now },
            evaluation: { raw_log: 'x', rag_trace: { id: 9 }, score: 80, timestamp: now },
        });
    });

    it('removes audit metadata for non-admin viewers', () => {
        const now = new Date().toISOString();
        const metadata = sanitizeConversationMetadataForViewer({
            rag_traces: [{ id: 1 }],
            trigger_traces: [{ id: 2 }],
            voice_audit_events: [{ id: 3 }],
            voice_audit_totals: { total: 1 },
            evaluation_log_access_audit: [{ id: 'entry-1' }],
            lti_launch: { mapping_id: 'map_1', bot_id: 'bot_1' },
            lti_outcome_sync: { status: 'failed', error: 'boom', attemptedAt: now },
            evaluation: { raw_log: 'x', rag_trace: { id: 9 }, score: 80, timestamp: now },
            custom_value: 'ok',
        }, false);

        assert.deepEqual(metadata, {
            evaluation: { score: 80, timestamp: now },
            custom_value: 'ok',
        });
    });

    it('marks raw log as expired for admin when outside retention window', () => {
        const metadata = sanitizeConversationMetadataForViewer({
            evaluation: {
                score: 100,
                max_score: 100,
                percentage: 100,
                timestamp: '2024-01-01T00:00:00.000Z',
                raw_log: '{"prompt":"x"}',
            },
        }, true);

        assert.deepEqual(metadata, {
            evaluation: {
                score: 100,
                max_score: 100,
                percentage: 100,
                timestamp: '2024-01-01T00:00:00.000Z',
                raw_log_expired: true,
            },
        });
    });
});
