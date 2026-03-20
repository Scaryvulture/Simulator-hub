import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { safeRegex } from '@/lib/safe-regex';

describe('safe-regex', () => {
    it('accepts simple regex patterns', () => {
        const regex = safeRegex('hola|chau', 'i');
        assert.equal(regex instanceof RegExp, true);
        assert.equal(regex?.test('Hola, buen dia'), true);
    });

    it('blocks nested quantifier patterns', () => {
        const regex = safeRegex('(ab+)+', 'i');
        assert.equal(regex, null);
    });

    it('blocks broad quantified alternation patterns', () => {
        const regex = safeRegex('(hola|holi)+', 'i');
        assert.equal(regex, null);
    });
});
