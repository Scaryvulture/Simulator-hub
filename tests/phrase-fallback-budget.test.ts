import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PhraseFallbackBudget } from '@/lib/phrase-fallback-budget';
import type { PhraseModelFallbackInput } from '@/lib/trigger-matcher';

function buildInput(intentName: string, triggerId = 'step#0'): PhraseModelFallbackInput {
    return {
        trigger_id: triggerId,
        intent_name: intentName,
        scope_mode: 'tail_only',
        scoped_text: 'gracias',
        phrases: ['gracias', 'hasta luego'],
        guardrail_flags: {
            has_question: false,
            has_continuation: false,
            flow_state_allowed: true,
        },
    };
}

describe('phrase-fallback-budget', () => {
    it('enforces max calls per turn', () => {
        const budget = new PhraseFallbackBudget({
            max_per_turn: 2,
            max_per_intent_per_turn: 2,
        });

        assert.equal(budget.consume(buildInput('close')), true);
        assert.equal(budget.consume(buildInput('payment')), true);
        assert.equal(budget.consume(buildInput('invoice')), false);
    });

    it('enforces max calls per intent within the turn', () => {
        const budget = new PhraseFallbackBudget({
            max_per_turn: 5,
            max_per_intent_per_turn: 1,
        });

        assert.equal(budget.consume(buildInput('close')), true);
        assert.equal(budget.consume(buildInput('close')), false);
        assert.equal(budget.consume(buildInput('payment')), true);
    });

    it('normalizes intent keys and falls back to trigger id', () => {
        const budget = new PhraseFallbackBudget({
            max_per_turn: 5,
            max_per_intent_per_turn: 1,
        });

        assert.equal(budget.consume(buildInput(' Close ')), true);
        assert.equal(budget.consume(buildInput('close')), false);

        const emptyIntent: PhraseModelFallbackInput = {
            ...buildInput(''),
            intent_name: '',
            trigger_id: 'step#close',
        };
        assert.equal(budget.consume(emptyIntent), true);
        assert.equal(budget.consume({ ...emptyIntent, intent_name: '   ' }), false);
    });
});
