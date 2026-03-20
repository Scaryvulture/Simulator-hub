import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeRagConfig } from '@/lib/rag-config';

describe('rag-config normalization', () => {
    it('defaults wrapper fallback to none when not configured', () => {
        const normalized = normalizeRagConfig({
            mode: 'always',
            owner: 'wrapper',
            vector_store_ids: ['vs_1'],
        });

        assert.equal(normalized.wrapper.fallback, 'none');
    });

    it('keeps explicit wrapper fallback when configured', () => {
        const normalized = normalizeRagConfig({
            mode: 'always',
            owner: 'wrapper',
            vector_store_ids: ['vs_1'],
            wrapper: {
                fallback: 'secondary_store',
            },
        });

        assert.equal(normalized.wrapper.fallback, 'secondary_store');
    });

    it('accepts legacy fallback_strategy when wrapper fallback is absent', () => {
        const normalized = normalizeRagConfig({
            mode: 'always',
            owner: 'wrapper',
            vector_store_ids: ['vs_1'],
            fallback_strategy: 'rewrite_retry',
        });

        assert.equal(normalized.wrapper.fallback, 'rewrite_retry');
    });

    it('ignores invalid wrapper fallback and stays fail-closed', () => {
        const normalized = normalizeRagConfig({
            mode: 'always',
            owner: 'wrapper',
            vector_store_ids: ['vs_1'],
            wrapper: {
                fallback: 'invalid_option',
            },
        });

        assert.equal(normalized.wrapper.fallback, 'none');
    });
});
