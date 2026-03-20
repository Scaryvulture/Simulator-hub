import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePhraseListTrigger } from '@/lib/trigger-matcher';

describe('trigger-matcher phrase list', () => {
    it('matches exact phrase after normalization (accents/punctuation)', async () => {
        const result = await evaluatePhraseListTrigger(
            {
                phrases: ['adios', 'hasta luego'],
                scope: { mode: 'tail_only', end_window_chars: 80, end_window_tokens: 8 },
                exact_mode: 'token_boundary',
            },
            {
                raw_message: 'Gracias!!! Adiós.',
                current_flow_step: 'FLOW',
                trigger_id: 'close#0',
            }
        );

        assert.equal(result.matched, true);
        assert.equal(result.layer, 'exact');
    });

    it('matches fuzzy typo without model fallback', async () => {
        const result = await evaluatePhraseListTrigger(
            {
                phrases: ['adios'],
                scope: { mode: 'tail_only', end_window_chars: 60, end_window_tokens: 6 },
                fuzzy: { enabled: true },
            },
            {
                raw_message: 'Bueno, adioz',
                current_flow_step: 'FLOW',
                trigger_id: 'close#1',
            }
        );

        assert.equal(result.matched, true);
        assert.equal(result.layer, 'fuzzy');
    });

    it('blocks match when question guardrail is active', async () => {
        const result = await evaluatePhraseListTrigger(
            {
                phrases: ['gracias', 'chau'],
                guardrails: { block_on_question: true },
            },
            {
                raw_message: 'Gracias, ¿y otra cosa?',
                current_flow_step: 'FLOW',
                trigger_id: 'close#2',
            }
        );

        assert.equal(result.matched, false);
        assert.equal(result.guardrails_applied.includes('question_detected'), true);
    });

    it('uses model fallback only for ambiguous fuzzy signals', async () => {
        let calls = 0;
        const result = await evaluatePhraseListTrigger(
            {
                phrases: ['muchas gracias, hasta luego'],
                scope: { mode: 'tail_only', end_window_chars: 80, end_window_tokens: 12 },
                fuzzy: { enabled: true, min_similarity: 0.95, gray_zone_min_similarity: 0.65 },
                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
            },
            {
                raw_message: 'mucha gracia hasta lugo',
                current_flow_step: 'FLOW',
                trigger_id: 'close#3',
            },
            async () => {
                calls += 1;
                return { match: true, confidence: 0.92 };
            }
        );

        assert.equal(result.model_used, true);
        assert.equal(result.layer, 'model');
        assert.equal(result.matched, true);
        assert.equal(calls, 1);
    });

    it('propagates model fallback resolver errors (fail-closed)', async () => {
        await assert.rejects(
            () => evaluatePhraseListTrigger(
                {
                    phrases: ['muchas gracias, hasta luego'],
                    scope: { mode: 'tail_only', end_window_chars: 80, end_window_tokens: 12 },
                    fuzzy: { enabled: true, min_similarity: 0.95, gray_zone_min_similarity: 0.65 },
                    model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                },
                {
                    raw_message: 'mucha gracia hasta lugo',
                    current_flow_step: 'FLOW',
                    trigger_id: 'close#fallback-error',
                },
                async () => {
                    throw new Error('model resolver timeout');
                }
            ),
            /model resolver timeout/
        );
    });

    it('does not fuzzy-match tiny tokens by default', async () => {
        const result = await evaluatePhraseListTrigger(
            {
                phrases: ['ok'],
                fuzzy: { enabled: true },
            },
            {
                raw_message: 'ook',
                current_flow_step: 'FLOW',
                trigger_id: 'misc#0',
            }
        );

        assert.equal(result.matched, false);
    });

    it('keeps fuzzy matching stable with very long messages by scanning tail scope', async () => {
        const longPrefix = Array.from({ length: 1200 }, (_, idx) => `ruido${idx}`).join(' ');
        const result = await evaluatePhraseListTrigger(
            {
                phrases: ['adios'],
                fuzzy: { enabled: true },
            },
            {
                raw_message: `${longPrefix} gracias por todo adioz`,
                current_flow_step: 'FLOW',
                trigger_id: 'close#long-input',
            }
        );

        assert.equal(result.matched, true);
        assert.equal(result.layer, 'fuzzy');
    });
});
