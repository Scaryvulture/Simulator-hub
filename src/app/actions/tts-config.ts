'use server';

import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/auth-utils';
import { revalidatePath } from 'next/cache';
import { encrypt, decrypt, isEncrypted, maskApiKey } from '@/lib/crypto';
import type { Prisma } from '@prisma/client';

type ApiKeyAction = 'keep' | 'set' | 'clear';

async function ensureTtsConfigRecord() {
    const existing = await prisma.ttsConfig.findFirst();
    if (existing) return existing;

    return prisma.ttsConfig.create({
        data: {
            provider: 'openai',
            model: 'tts-1',
            default_speed: 1.0,
            voice_rules: null,
            openai_api_key: null,
        },
    });
}

function decryptStoredApiKey(value: string | null | undefined): string {
    if (!value) return '';
    return isEncrypted(value) ? decrypt(value) : value;
}

export async function getTtsConfig() {
    await verifyAdmin();
    const config = await ensureTtsConfigRecord();
    const decryptedApiKey = decryptStoredApiKey(config.openai_api_key);

    return {
        ...config,
        openai_api_key: null,
        has_api_key: Boolean(decryptedApiKey),
        api_key_masked: decryptedApiKey ? maskApiKey(decryptedApiKey) : '',
    };
}

export async function updateTtsConfig(data: {
    model?: string;
    default_speed?: number;
    voice_rules?: string;
    openai_api_key?: string;
    apiKeyAction?: ApiKeyAction;
}) {
    await verifyAdmin();
    const current = await ensureTtsConfigRecord();

    const updateData: Prisma.TtsConfigUpdateInput = {};

    if (data.model !== undefined) {
        const normalizedModel = data.model.trim();
        if (!normalizedModel) {
            throw new Error('TTS model is required');
        }
        updateData.model = normalizedModel;
    }

    if (data.default_speed !== undefined) {
        const speed = Number(data.default_speed);
        if (!Number.isFinite(speed) || speed < 0.25 || speed > 4) {
            throw new Error('TTS speed must be between 0.25 and 4.0');
        }
        updateData.default_speed = speed;
    }

    if (data.voice_rules !== undefined) {
        const trimmedRules = data.voice_rules.trim();
        updateData.voice_rules = trimmedRules || null;
    }

    const resolvedApiKeyAction: ApiKeyAction = data.apiKeyAction || (
        data.openai_api_key === undefined
            ? 'keep'
            : (data.openai_api_key.trim() ? 'set' : 'clear')
    );

    if (resolvedApiKeyAction === 'clear') {
        updateData.openai_api_key = null;
    } else if (resolvedApiKeyAction === 'set') {
        const normalizedApiKey = (data.openai_api_key || '').trim();
        if (!normalizedApiKey) {
            throw new Error('TTS API key is required when replacing the key.');
        }
        updateData.openai_api_key = encrypt(normalizedApiKey);
    }

    await prisma.ttsConfig.update({
        where: { id: current.id },
        data: updateData
    });

    revalidatePath('/admin/voice-settings');
    revalidatePath('/admin'); // may affect other parts
    return { success: true };
}
