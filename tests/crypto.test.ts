import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, it } from 'node:test';

import { decrypt, encrypt, isEncrypted } from '@/lib/crypto';

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

function encryptLegacyCbc(text: string, secret: string): string {
    const key = crypto.scryptSync(secret, 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function encryptV2Gcm(text: string, secret: string): string {
    const key = crypto.scryptSync(secret, 'salt', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `enc:v2:${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

describe('crypto', () => {
    it('encrypts/decrypts using authenticated v3 payload', () => {
        withEnv({ ENCRYPTION_KEY: 'unit-test-primary-secret' }, () => {
            const plain = 'sk-test-key-1234567890';
            const encrypted = encrypt(plain);

            assert.equal(isEncrypted(encrypted), true);
            assert.match(encrypted, /^enc:v3:/);
            assert.equal(decrypt(encrypted), plain);
        });
    });

    it('decrypts authenticated v2 payloads for backward compatibility', () => {
        withEnv({ ENCRYPTION_KEY: 'unit-test-primary-secret' }, () => {
            const plain = 'sk-test-key-legacy-v2';
            const encrypted = encryptV2Gcm(plain, 'unit-test-primary-secret');
            assert.equal(decrypt(encrypted), plain);
        });
    });

    it('decrypts legacy CBC payload with primary secret', () => {
        withEnv({ ENCRYPTION_KEY: 'legacy-secret-primary' }, () => {
            const plain = 'sk-legacy-123';
            const legacyPayload = encryptLegacyCbc(plain, 'legacy-secret-primary');
            assert.equal(decrypt(legacyPayload), plain);
        });
    });

    it('supports explicit migration secret for legacy payloads', () => {
        withEnv(
            {
                ENCRYPTION_KEY: 'new-primary-secret',
                ENCRYPTION_MIGRATION_LEGACY_SECRET: 'old-legacy-secret',
            },
            () => {
                const plain = 'sk-migrate-123';
                const legacyPayload = encryptLegacyCbc(plain, 'old-legacy-secret');
                assert.equal(decrypt(legacyPayload), plain);
            }
        );
    });

    it('fails decryption for legacy payload when migration secret is not configured', () => {
        withEnv(
            {
                ENCRYPTION_KEY: 'new-primary-secret',
                ENCRYPTION_MIGRATION_LEGACY_SECRET: undefined,
            },
            () => {
                const legacyPayload = encryptLegacyCbc('sk-no-migration', 'old-legacy-secret');
                assert.throws(
                    () => decrypt(legacyPayload),
                    /Failed to decrypt legacy payload with ENCRYPTION_KEY\/ENCRYPTION_SECRET/i
                );
            }
        );
    });

    it('throws when encryption key is missing', () => {
        withEnv(
            {
                ENCRYPTION_KEY: undefined,
                ENCRYPTION_SECRET: undefined,
                ENCRYPTION_MIGRATION_LEGACY_SECRET: undefined,
            },
            () => {
                assert.throws(
                    () => encrypt('sk-requires-secret'),
                    /ENCRYPTION_KEY or ENCRYPTION_SECRET environment variable is required/i
                );
            }
        );
    });
});
