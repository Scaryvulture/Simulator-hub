import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    isEvaluationResult,
    readStoredEvaluationFromMetadata,
    toPublicEvaluationResult,
} from '@/lib/evaluation-result';

const BASE_EVALUATION = {
    score: 2,
    max_score: 3,
    percentage: 67,
    timestamp: '2026-03-06T15:00:00.000Z',
    results: {
        boolean: [
            { id: 'c1', title: 'Criterion 1', passed: true, reason: 'Met the criterion.' },
        ],
        qualitative: [
            { id: 'q1', title: 'Feedback', feedback: 'Needs more clarity.' },
        ],
    },
};

describe('evaluation-result', () => {
    it('recognizes valid public evaluation payloads', () => {
        assert.equal(isEvaluationResult(BASE_EVALUATION), true);
    });

    it('reads stored evaluation from session metadata', () => {
        const evaluation = readStoredEvaluationFromMetadata({
            evaluation: {
                ...BASE_EVALUATION,
                raw_log: '{"prompt":"x"}',
                rag_trace: { purpose: 'evaluate_conversation' },
            },
        });

        assert.ok(evaluation);
        assert.equal(evaluation?.score, 2);
        assert.equal(evaluation?.raw_log, '{"prompt":"x"}');
        assert.deepEqual(toPublicEvaluationResult(evaluation!), {
            ...BASE_EVALUATION,
        });
    });

    it('rejects malformed evaluation metadata', () => {
        const evaluation = readStoredEvaluationFromMetadata({
            evaluation: {
                score: 1,
                timestamp: '2026-03-06T15:00:00.000Z',
            },
        });

        assert.equal(evaluation, null);
        assert.equal(isEvaluationResult({ score: 1 }), false);
    });
});
