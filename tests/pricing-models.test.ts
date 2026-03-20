import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectRuntimePricingModels } from '@/lib/pricing-models';
import type { BotConfig } from '@/lib/schemas/bot-config';

describe('pricing-models', () => {
    it('resolves configured llm model when present', () => {
        const models = collectRuntimePricingModels({
            botType: 'GENERIC',
            openaiPromptId: 'pmpt_abc',
            config: {
                llm_model: 'gpt-4o-mini',
            } as BotConfig,
        });

        assert.deepEqual(models, ['gpt-4o-mini']);
    });

    it('always uses llm_model even when prompt id is present', () => {
        const models = collectRuntimePricingModels({
            botType: 'EXAMINER',
            openaiPromptId: 'pmpt_examiner',
            config: {
                llm_model: 'gpt-4o-mini',
            } as BotConfig,
        });

        assert.deepEqual(models, ['gpt-4o-mini']);
    });

    it('throws when llm_model is missing', () => {
        assert.throws(() => collectRuntimePricingModels({
            botType: 'GENERIC',
            openaiPromptId: 'pmpt_generic',
            config: {} as BotConfig,
        }), /llm_model/i);
    });
});
