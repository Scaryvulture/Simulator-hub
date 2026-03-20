import 'server-only';

import prisma from '@/lib/prisma';
import { decrypt, encrypt, isEncrypted, maskApiKey } from '@/lib/crypto';

const QA_LAB_CONFIG_SCOPE = 'default';

type QaLabConfigRecord = {
    id: string;
    scope: string;
    evals_enabled: boolean;
    evals_auto_create: boolean;
    evals_name_prefix: string;
    evals_eval_id: string | null;
    openai_api_key: string | null;
    created_at: Date;
    updated_at: Date;
};

type QaLabConfigDelegate = {
    findUnique(args: { where: { scope: string } }): Promise<QaLabConfigRecord | null>;
    upsert(args: {
        where: { scope: string };
        update: Record<string, never>;
        create: {
            scope: string;
            evals_enabled: boolean;
            evals_auto_create: boolean;
            evals_name_prefix: string;
            evals_eval_id: string | null;
            openai_api_key: string | null;
        };
    }): Promise<QaLabConfigRecord>;
    update(args: {
        where: { scope: string };
        data: {
            evals_enabled: boolean;
            evals_auto_create: boolean;
            evals_name_prefix: string;
            evals_eval_id: string | null;
            openai_api_key?: string | null;
        };
    }): Promise<QaLabConfigRecord>;
};

function getQaLabConfigDelegate(): QaLabConfigDelegate | null {
    const maybe = (prisma as unknown as { qaLabConfig?: Partial<QaLabConfigDelegate> }).qaLabConfig;
    if (!maybe) return null;
    if (typeof maybe.findUnique !== 'function') return null;
    if (typeof maybe.upsert !== 'function') return null;
    if (typeof maybe.update !== 'function') return null;
    return maybe as QaLabConfigDelegate;
}

function isMissingQaLabConfigTableError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: unknown }).code;
    const message = String((error as { message?: unknown }).message || '');
    if (code === 'P2021') return true;
    if (!message) return false;
    const lower = message.toLowerCase();
    return lower.includes('qa_lab_config')
        && (lower.includes('does not exist') || lower.includes('doesn\'t exist') || lower.includes('table'));
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
    if (!raw) return fallback;
    const value = raw.trim().toLowerCase();
    if (value === 'true' || value === '1' || value === 'yes') return true;
    if (value === 'false' || value === '0' || value === 'no') return false;
    return fallback;
}

function normalizeEvalId(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeNamePrefix(value: string | null | undefined): string {
    const trimmed = (value || '').trim();
    return trimmed || 'QA Lab';
}

function decryptStoredApiKey(value: string | null | undefined): string {
    if (!value) return '';
    if (isEncrypted(value)) return decrypt(value);
    return value;
}

type EnvQaLabRuntimeDefaults = {
    enabled: boolean;
    autoCreate: boolean;
    namePrefix: string;
    evalId: string | null;
};

function getEnvQaLabRuntimeDefaults(): EnvQaLabRuntimeDefaults {
    const enabled = parseBoolean(process.env.QA_OPENAI_EVALS_SYNC_ENABLED, false);
    const autoCreate = parseBoolean(process.env.QA_OPENAI_EVALS_AUTO_CREATE, true);
    const namePrefix = normalizeNamePrefix(process.env.QA_OPENAI_EVALS_NAME_PREFIX);
    const evalId = normalizeEvalId(process.env.QA_OPENAI_EVAL_ID);

    return {
        enabled,
        autoCreate,
        namePrefix,
        evalId,
    };
}

export type QaLabEvalsRuntimeConfig = {
    enabled: boolean;
    autoCreate: boolean;
    namePrefix: string;
    evalId: string | null;
    apiKey: string | null;
};

export type QaLabEvalsUiConfig = {
    enabled: boolean;
    auto_create: boolean;
    name_prefix: string;
    eval_id: string;
    has_api_key: boolean;
    api_key_masked: string;
    updated_at: string | null;
};

export async function getQaLabConfigRecord() {
    const delegate = getQaLabConfigDelegate();
    if (!delegate) return null;
    try {
        return await delegate.findUnique({
            where: { scope: QA_LAB_CONFIG_SCOPE },
        });
    } catch (error: unknown) {
        if (isMissingQaLabConfigTableError(error)) return null;
        throw error;
    }
}

export async function ensureQaLabConfigRecord() {
    const envDefaults = getEnvQaLabRuntimeDefaults();
    const delegate = getQaLabConfigDelegate();
    if (!delegate) return null;

    try {
        return await delegate.upsert({
            where: { scope: QA_LAB_CONFIG_SCOPE },
            update: {},
            create: {
                scope: QA_LAB_CONFIG_SCOPE,
                evals_enabled: envDefaults.enabled,
                evals_auto_create: envDefaults.autoCreate,
                evals_name_prefix: envDefaults.namePrefix,
                evals_eval_id: envDefaults.evalId,
                openai_api_key: null,
            },
        });
    } catch (error: unknown) {
        if (isMissingQaLabConfigTableError(error)) return null;
        throw error;
    }
}

export async function getQaLabEvalsUiConfig(): Promise<QaLabEvalsUiConfig> {
    const envDefaults = getEnvQaLabRuntimeDefaults();
    const record = await ensureQaLabConfigRecord();
    if (!record) {
        return {
            enabled: envDefaults.enabled,
            auto_create: envDefaults.autoCreate,
            name_prefix: envDefaults.namePrefix,
            eval_id: envDefaults.evalId || '',
            has_api_key: false,
            api_key_masked: '',
            updated_at: null,
        };
    }

    const decryptedApiKey = decryptStoredApiKey(record.openai_api_key);
    return {
        enabled: record.evals_enabled,
        auto_create: record.evals_auto_create,
        name_prefix: record.evals_name_prefix || 'QA Lab',
        eval_id: record.evals_eval_id || '',
        has_api_key: Boolean(decryptedApiKey),
        api_key_masked: decryptedApiKey ? maskApiKey(decryptedApiKey) : '',
        updated_at: record.updated_at?.toISOString() || null,
    };
}

export async function revealQaLabEvalsApiKey(): Promise<string> {
    const record = await ensureQaLabConfigRecord();
    if (!record) return '';
    return decryptStoredApiKey(record.openai_api_key);
}

export async function updateQaLabEvalsUiConfig(params: {
    enabled: boolean;
    autoCreate: boolean;
    namePrefix: string;
    evalId?: string | null;
    apiKey?: string;
    apiKeyAction: 'keep' | 'set' | 'clear';
}) {
    const record = await ensureQaLabConfigRecord();
    if (!record) {
        throw new Error('QA Lab config model is unavailable. Run `npm run prisma:generate` and `npm run prisma:push`.');
    }

    const updateData: {
        evals_enabled: boolean;
        evals_auto_create: boolean;
        evals_name_prefix: string;
        evals_eval_id: string | null;
        openai_api_key?: string | null;
    } = {
        evals_enabled: Boolean(params.enabled),
        evals_auto_create: Boolean(params.autoCreate),
        evals_name_prefix: normalizeNamePrefix(params.namePrefix),
        evals_eval_id: normalizeEvalId(params.evalId),
    };

    if (params.apiKeyAction === 'clear') {
        updateData.openai_api_key = null;
    } else if (params.apiKeyAction === 'set') {
        const normalized = (params.apiKey || '').trim();
        if (!normalized) {
            throw new Error('QA Lab OpenAI API key cannot be empty when replacing the key.');
        }
        updateData.openai_api_key = encrypt(normalized);
    }

    const delegate = getQaLabConfigDelegate();
    if (!delegate) {
        throw new Error('QA Lab config model is unavailable. Run `npm run prisma:generate` and restart.');
    }

    await delegate.update({
        where: { scope: QA_LAB_CONFIG_SCOPE },
        data: updateData,
    });

    return getQaLabEvalsUiConfig();
}

export async function getQaLabEvalsRuntimeConfig(): Promise<QaLabEvalsRuntimeConfig> {
    const envDefaults = getEnvQaLabRuntimeDefaults();
    const dbRecord = await getQaLabConfigRecord();

    if (!dbRecord) {
        return {
            enabled: envDefaults.enabled,
            autoCreate: envDefaults.autoCreate,
            namePrefix: envDefaults.namePrefix,
            evalId: envDefaults.evalId,
            apiKey: null,
        };
    }

    const dbApiKey = normalizeEvalId(decryptStoredApiKey(dbRecord.openai_api_key));

    return {
        enabled: dbRecord.evals_enabled,
        autoCreate: dbRecord.evals_auto_create,
        namePrefix: normalizeNamePrefix(dbRecord.evals_name_prefix),
        evalId: normalizeEvalId(dbRecord.evals_eval_id) || envDefaults.evalId,
        apiKey: dbApiKey,
    };
}
