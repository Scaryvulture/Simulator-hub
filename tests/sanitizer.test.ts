import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sanitizeResponse } from '@/lib/sanitizer';

describe('sanitizer', () => {
    it('removes script tags from model output', () => {
        const dirty = 'hola<script>alert("x")</script>mundo';
        const clean = sanitizeResponse(dirty);
        assert.equal(clean.includes('<script>'), false);
        assert.equal(clean, 'holamundo');
    });

    it('removes META tags and trims output', () => {
        const dirty = '  [META:debug] respuesta final  ';
        const clean = sanitizeResponse(dirty);
        assert.equal(clean, 'respuesta final');
    });

    it('removes citation artifacts like [1] and (ref)', () => {
        const dirty = 'Aplicá estos controles [1] [2] (ref).';
        const clean = sanitizeResponse(dirty);
        assert.equal(clean, 'Aplicá estos controles.');
    });
});
