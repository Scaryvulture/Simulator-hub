import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeImageTriggersForSave } from '@/lib/image-trigger-utils';

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
    const previous: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(overrides)) {
        previous[key] = process.env[key];
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }

    try {
        run();
    } finally {
        for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test('sanitizeImageTriggersForSave removes completely empty rows', () => {
    const result = sanitizeImageTriggersForSave([
        { pattern: '', image_url: '', caption: '' },
        { pattern: 'riesgo', image_url: 'https://example.com/riesgo.png', caption: '  Riesgo  ' },
    ]);

    assert.equal(result.partialRow, undefined);
    assert.deepEqual(result.sanitized, [
        { pattern: 'riesgo', image_url: 'https://example.com/riesgo.png', caption: 'Riesgo' },
    ]);
});

test('sanitizeImageTriggersForSave flags partial rows', () => {
    const result = sanitizeImageTriggersForSave([
        { pattern: 'riesgo', image_url: '' },
    ]);

    assert.equal(result.partialRow, 1);
    assert.equal(result.sanitized, undefined);
});

test('sanitizeImageTriggersForSave trims pattern and URL', () => {
    const result = sanitizeImageTriggersForSave([
        { pattern: '  casco  ', image_url: '  https://example.com/casco.jpg  ' },
    ]);

    assert.equal(result.partialRow, undefined);
    assert.deepEqual(result.sanitized, [
        { pattern: 'casco', image_url: 'https://example.com/casco.jpg' },
    ]);
});

test('sanitizeImageTriggersForSave rejects invalid urls', () => {
    const result = sanitizeImageTriggersForSave([
        { pattern: 'casco', image_url: 'not-a-valid-url' },
    ]);

    assert.equal(result.invalidUrlRow, 1);
    assert.equal(result.sanitized, undefined);
});

test('sanitizeImageTriggersForSave normalizes Google Drive image links', () => {
    const result = sanitizeImageTriggersForSave([
        { pattern: 'casco', image_url: 'https://drive.google.com/file/d/abc123XYZ/view?usp=sharing' },
    ]);

    assert.deepEqual(result.sanitized, [
        { pattern: 'casco', image_url: 'https://drive.google.com/uc?export=view&id=abc123XYZ' },
    ]);
});

test('sanitizeImageTriggersForSave enforces host allowlist when enabled', () => {
    withEnv(
        {
            IMAGE_TRIGGER_ENFORCE_HOST_ALLOWLIST: 'true',
            IMAGE_TRIGGER_ALLOWED_HOSTS: 'drive.google.com,cdn.example.com',
        },
        () => {
            const blocked = sanitizeImageTriggersForSave([
                { pattern: 'riesgo', image_url: 'https://evil.example.org/x.png' },
            ]);
            assert.equal(blocked.invalidHostRow, 1);
            assert.equal(blocked.invalidHost, 'evil.example.org');

            const allowed = sanitizeImageTriggersForSave([
                { pattern: 'riesgo', image_url: 'https://cdn.example.com/x.png' },
            ]);
            assert.equal(allowed.invalidHostRow, undefined);
            assert.deepEqual(allowed.sanitized, [
                { pattern: 'riesgo', image_url: 'https://cdn.example.com/x.png' },
            ]);
        }
    );
});
