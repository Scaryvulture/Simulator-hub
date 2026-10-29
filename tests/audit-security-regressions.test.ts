import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sanitizeSessionMetadata, readBodyWithLimit } from '../src/lib/request-validation';
import { sanitizeConversationMetadataForViewer } from '../src/lib/metadata-visibility';
import { estimateSttCost } from '../src/lib/stt-cost';
import { snapshotBot } from '../src/lib/runtime-snapshot';

test('client metadata cannot forge grades, runtime snapshots or operation receipts', () => {
    const input = { user_note: 'keep', evaluation: { percentage: 100 }, evaluation_history: [1], session_vars: {}, examiner_state: {}, detector_state: {}, runtime_snapshot: {}, initialized: true, initialization_result: {}, _operation: {}, _requests: [], qa_lab: {} };
    assert.deepEqual(sanitizeSessionMetadata(input), { user_note: 'keep' });
});

test('private snapshots, answer state and previous raw evaluations never reach students', () => {
    const metadata = sanitizeConversationMetadataForViewer({ runtime_snapshot: { secret: 'prompt' }, evaluation_history: [{ raw_log: 'prompt' }], examiner_state: { answer: 'yes' }, flow_state: {}, session_vars: {}, _requests: [], _operation: {}, evaluation: { score: 1, evaluator_snapshot: { prompt: 'private' }, transcript_sha256: 'hash' } }, false);
    assert.deepEqual(metadata, { evaluation: { score: 1 } });
});

test('body reading stops at the real limit without trusting content-length', async () => {
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(64)); }, cancel() { cancelled = true; } });
    const request = new Request('http://localhost', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await assert.rejects(readBodyWithLimit(request, 100), /too large/i);
    assert(cancelled);
});

test('STT cost uses provider duration or a labeled server estimate, never caller duration', () => {
    assert.deepEqual(estimateSttCost({ usage: { type: 'duration', seconds: 60 } }, 1), { durationMs: 60_000, costUsd: 0.006, source: 'provider_duration' });
    assert.equal(estimateSttCost({ duration_ms: 1 }, 960_000).costUsd, 0.006);
    assert.equal(estimateSttCost({}, 16_000).source, 'server_estimate');
});

test('runtime snapshots retain configuration but omit credentials', () => {
    const snapshot = snapshotBot({ id: 'b', name: 'Bot', bot_type: 'GENERIC', openai_prompt_id: '', openai_vector_store_id: null, prompt_version: '1', config: {}, api_key: 'private' } as Parameters<typeof snapshotBot>[0]);
    assert(!('api_key' in snapshot));
});
