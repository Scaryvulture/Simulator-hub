import crypto from 'crypto';

const ENCRYPTED_PREFIX = 'enc';
const ENCRYPTED_VERSION_V3 = 'v3';
const ENCRYPTED_VERSION_V2 = 'v2';
const ALGORITHM_V2 = 'aes-256-gcm';
const V3_SALT_LENGTH = 16;
const V2_IV_LENGTH = 12;
const V2_AUTH_TAG_LENGTH = 16;

const LEGACY_ALGORITHM = 'aes-256-cbc';
const LEGACY_IV_LENGTH = 16;
let warnedLegacyMigration = false;

function resolvePrimaryEncryptionSecret(): string {
    const configuredKey = process.env.ENCRYPTION_KEY?.trim() || process.env.ENCRYPTION_SECRET?.trim();
    if (configuredKey) return configuredKey;
    throw new Error('ENCRYPTION_KEY or ENCRYPTION_SECRET environment variable is required');
}

function deriveKey(secret: string, salt: string | Buffer): Buffer {
    return crypto.scryptSync(secret, salt, 32);
}

function deriveLegacyKey(secret: string): Buffer {
    return deriveKey(secret, 'salt');
}

function resolveLegacyMigrationSecret(): string | null {
    const value = process.env.ENCRYPTION_MIGRATION_LEGACY_SECRET?.trim();
    return value || null;
}

function isHex(value: string): boolean {
    return /^[0-9a-fA-F]+$/.test(value);
}

function isEncryptedV2Payload(text: string): boolean {
    const textParts = text.split(':');
    if (textParts.length !== 5) return false;
    const [prefix, version, ivPart, encryptedPart, tagPart] = textParts;
    return prefix === ENCRYPTED_PREFIX
        && version === ENCRYPTED_VERSION_V2
        && ivPart.length === V2_IV_LENGTH * 2
        && tagPart.length === V2_AUTH_TAG_LENGTH * 2
        && isHex(ivPart)
        && isHex(encryptedPart)
        && encryptedPart.length > 0
        && encryptedPart.length % 2 === 0
        && isHex(tagPart);
}

function isEncryptedV3Payload(text: string): boolean {
    const textParts = text.split(':');
    if (textParts.length !== 6) return false;
    const [prefix, version, saltPart, ivPart, encryptedPart, tagPart] = textParts;
    return prefix === ENCRYPTED_PREFIX
        && version === ENCRYPTED_VERSION_V3
        && saltPart.length === V3_SALT_LENGTH * 2
        && ivPart.length === V2_IV_LENGTH * 2
        && tagPart.length === V2_AUTH_TAG_LENGTH * 2
        && isHex(saltPart)
        && isHex(ivPart)
        && isHex(encryptedPart)
        && encryptedPart.length > 0
        && encryptedPart.length % 2 === 0
        && isHex(tagPart);
}

function isLegacyEncryptedPayload(text: string): boolean {
    const parts = text.split(':');
    if (parts.length !== 2) return false;
    const [ivPart, payloadPart] = parts;
    return ivPart.length === LEGACY_IV_LENGTH * 2
        && isHex(ivPart)
        && isHex(payloadPart)
        && payloadPart.length > 0
        && payloadPart.length % 2 === 0;
}

function decryptV2WithSecret(text: string, secret: string): string {
    if (!isEncryptedV2Payload(text)) {
        throw new Error('Invalid encrypted payload format for v2');
    }

    const [, , ivPart, encryptedPart, tagPart] = text.split(':');
    const iv = Buffer.from(ivPart, 'hex');
    const encryptedText = Buffer.from(encryptedPart, 'hex');
    const authTag = Buffer.from(tagPart, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM_V2, deriveLegacyKey(secret), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function decryptV3WithSecret(text: string, secret: string): string {
    if (!isEncryptedV3Payload(text)) {
        throw new Error('Invalid encrypted payload format for v3');
    }

    const [, , saltPart, ivPart, encryptedPart, tagPart] = text.split(':');
    const salt = Buffer.from(saltPart, 'hex');
    const iv = Buffer.from(ivPart, 'hex');
    const encryptedText = Buffer.from(encryptedPart, 'hex');
    const authTag = Buffer.from(tagPart, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM_V2, deriveKey(secret, salt), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function decryptLegacyWithSecret(text: string, secret: string): string {
    if (!isLegacyEncryptedPayload(text)) {
        throw new Error('Invalid encrypted payload format for legacy cipher');
    }

    const [ivPart, encryptedPart] = text.split(':');
    const iv = Buffer.from(ivPart, 'hex');
    const encryptedText = Buffer.from(encryptedPart, 'hex');
    const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, deriveLegacyKey(secret), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

export function encrypt(text: string): string {
    if (typeof text !== 'string' || text.length === 0) {
        throw new Error('Cannot encrypt empty value');
    }

    const secret = resolvePrimaryEncryptionSecret();
    const salt = crypto.randomBytes(V3_SALT_LENGTH);
    const key = deriveKey(secret, salt);
    const iv = crypto.randomBytes(V2_IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM_V2, key, iv);
    let encrypted = cipher.update(text, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}:${ENCRYPTED_VERSION_V3}:${salt.toString('hex')}:${iv.toString('hex')}:${encrypted.toString('hex')}:${authTag.toString('hex')}`;
}

export function decrypt(text: string): string {
    if (!text) return '';

    const primarySecret = resolvePrimaryEncryptionSecret();
    if (isEncryptedV3Payload(text)) {
        return decryptV3WithSecret(text, primarySecret);
    }

    if (isEncryptedV2Payload(text)) {
        return decryptV2WithSecret(text, primarySecret);
    }

    if (isLegacyEncryptedPayload(text)) {
        try {
            return decryptLegacyWithSecret(text, primarySecret);
        } catch (legacyPrimaryError) {
            const migrationSecret = resolveLegacyMigrationSecret();
            if (migrationSecret) {
                try {
                    const decrypted = decryptLegacyWithSecret(text, migrationSecret);
                    if (!warnedLegacyMigration) {
                        warnedLegacyMigration = true;
                        console.warn(
                            '[crypto] Decrypted a legacy payload with ENCRYPTION_MIGRATION_LEGACY_SECRET. Re-save secrets to migrate to v3.'
                        );
                    }
                    return decrypted;
                } catch {
                    throw new Error(
                        'Failed to decrypt legacy payload with ENCRYPTION_KEY and ENCRYPTION_MIGRATION_LEGACY_SECRET.'
                    );
                }
            }

            throw new Error(
                `Failed to decrypt legacy payload with ENCRYPTION_KEY/ENCRYPTION_SECRET: ${
                    legacyPrimaryError instanceof Error ? legacyPrimaryError.message : String(legacyPrimaryError)
                }`
            );
        }
    }

    throw new Error('Unsupported encrypted payload format');
}

export function isEncrypted(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    return isEncryptedV3Payload(text) || isEncryptedV2Payload(text) || isLegacyEncryptedPayload(text);
}

export function maskApiKey(apiKey: string): string {
    if (!apiKey) return '';
    if (isEncrypted(apiKey)) return '********'; // Hide completely if it's the raw encrypted string
    if (apiKey.length <= 8) return '********';
    return `${apiKey.slice(0, 3)}...${apiKey.slice(-4)}`;
}
