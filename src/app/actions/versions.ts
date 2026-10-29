'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { verifyAdmin } from '@/lib/auth-utils';
import { BotConfigSchema } from '@/lib/schemas/bot-config';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { normalizeRagConfig } from '@/lib/rag-config';
import { lintFlowConfig, formatCriticalFlowLintError, type FlowLintReport } from '@/lib/flow-linter';
import type { Bot, Prisma } from '@prisma/client';
import { appendVersion, ensurePublishedVersion, lockBot } from '@/lib/runtime-bot';
import { readVersionSnapshot } from '@/lib/runtime-snapshot';
import { createOpenAIClient } from '@/lib/ai-client';
import { PricingService } from '@/lib/pricing';
import { collectRuntimePricingModels } from '@/lib/pricing-models';
import { collectBotConfigCompatibilityWarningMessages } from '@/lib/bot-config-compat';

function normalizeAndValidateConfig(rawConfig: unknown, context = 'config'): BotConfig {
    const compatibilityWarnings = collectBotConfigCompatibilityWarningMessages(rawConfig);
    const enforceWarnings = process.env.BOT_CONFIG_WARNINGS_AS_ERRORS === 'true';
    if (compatibilityWarnings.length > 0) {
        if (enforceWarnings) {
            throw new Error(
                `Config con warnings bloqueada en ${context}: ${compatibilityWarnings.slice(0, 5).join(' | ')}`
            );
        }
        console.warn(
            `[bot-config] compatibility warnings context=${context} warnings=${compatibilityWarnings.slice(0, 20).join(' | ')}`
        );
    }
    const parsed = BotConfigSchema.safeParse(rawConfig || {});
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue?.path?.join('.') || 'config';
        throw new Error(`Config inválida: ${path} - ${issue?.message || 'Error de validación'}`);
    }
    return parsed.data;
}

type BotRagContext = {
    api_key: string | null;
    openai_vector_store_id: string | null;
};

async function assertVectorStoresReadyForProd(bot: BotRagContext, config: BotConfig) {
    const rag = normalizeRagConfig(config?.rag_config || {}, bot.openai_vector_store_id);
    if (rag.mode === 'never') return;

    const vectorStoreIds = rag.vector_store_ids;
    if (vectorStoreIds.length === 0) {
        throw new Error('RAG activo pero no hay Vector Store ID configurado.');
    }

    const encryptedApiKey = bot.api_key;
    if (!encryptedApiKey) {
        throw new Error('No se puede promover a PROD sin API key del bot.');
    }

    const apiKey = isEncrypted(encryptedApiKey) ? decrypt(encryptedApiKey) : encryptedApiKey;
    if (!apiKey) {
        throw new Error('La API key del bot no es válida. Reconfigúrala antes de promover a PROD.');
    }
    const openai = createOpenAIClient(apiKey);

    for (const vsId of vectorStoreIds) {
        const store = await openai.vectorStores.retrieve(vsId);
        if (store.status !== 'completed') {
            throw new Error(`Vector Store ${vsId} no está listo (status=${store.status}).`);
        }
        if ((store.file_counts?.completed || 0) === 0) {
            throw new Error(`Vector Store ${vsId} no tiene archivos listos para búsqueda.`);
        }
    }
}

async function collectPricingModelsForRelease(params: {
    botType: string;
    config: BotConfig;
    openaiPromptId: string;
}): Promise<string[]> {
    const { botType, config, openaiPromptId } = params;
    const modelSet = new Set<string>(
        collectRuntimePricingModels({
            botType,
            config,
            openaiPromptId,
        })
    );

    const evaluatorBotId = typeof config.evaluator_bot_id === 'string' ? config.evaluator_bot_id.trim() : '';
    if (!evaluatorBotId) return Array.from(modelSet);

    const evaluatorBot = await prisma.bot.findUnique({
        where: { id: evaluatorBotId },
        select: {
            bot_type: true,
            openai_prompt_id: true,
            config: true,
            deleted_at: true,
        },
    });
    if (!evaluatorBot || evaluatorBot.deleted_at) return Array.from(modelSet);

    let evaluatorConfig: BotConfig;
    try {
        evaluatorConfig = normalizeAndValidateConfig(evaluatorBot.config);
    } catch (error) {
        const detail = error instanceof Error ? error.message : 'Config inválida';
        throw new Error(`No se puede validar pricing del evaluador asignado (${evaluatorBotId}): ${detail}`);
    }

    for (const model of collectRuntimePricingModels({
        botType: evaluatorBot.bot_type,
        config: evaluatorConfig,
        openaiPromptId: evaluatorBot.openai_prompt_id,
    })) {
        modelSet.add(model);
    }

    return Array.from(modelSet);
}

async function assertPricingReadyForRelease(params: {
    botId: string;
    botType: string;
    openaiPromptId: string;
    config: BotConfig;
    stage: 'STAGING' | 'PROD';
}) {
    const models = await collectPricingModelsForRelease({
        botType: params.botType,
        config: params.config,
        openaiPromptId: params.openaiPromptId,
    });
    await PricingService.assertDatabasePricingForModels(
        models,
        `bot=${params.botId} stage=${params.stage}`
    );
}

async function validatedDraft(botId: string): Promise<Bot> {
    const bot = await prisma.bot.findFirst({ where: { id: botId, deleted_at: null } });
    if (!bot) throw new Error('Bot not found');
    return { ...bot, config: normalizeAndValidateConfig(bot.config) } as Bot;
}

function fingerprint(bot: Bot) {
    return JSON.stringify([bot.config, bot.bot_type, bot.openai_prompt_id, bot.openai_vector_store_id, bot.prompt_version]);
}

async function releaseChecks(bot: Bot, stage: 'STAGING' | 'PROD') {
    const config = normalizeAndValidateConfig(bot.config);
    const lint = lintFlowConfig(config);
    if (lint.critical_count) throw new Error(formatCriticalFlowLintError(lint, 'Hay errores críticos de flujo.'));
    await assertPricingReadyForRelease({ botId: bot.id, botType: bot.bot_type, openaiPromptId: bot.openai_prompt_id, config, stage });
    if (stage === 'PROD') await assertVectorStoresReadyForProd(bot, config);
    return lint;
}

export async function createBotVersion(botId: string, _note?: string) {
    await verifyAdmin();
    return prisma.$transaction(async (tx) => {
        const bot = await lockBot(tx, botId);
        normalizeAndValidateConfig(bot.config);
        // A free-form label must never create an active PROD version.
        return appendVersion(tx, bot, 'SNAPSHOT');
    });
}

export async function getBotVersions(botId: string) {
    await verifyAdmin();
    return prisma.botVersion.findMany({ where: { bot_id: botId }, orderBy: { version_number: 'desc' } });
}

export async function restoreBotVersion(botId: string, versionId: string) {
    await verifyAdmin();
    const result = await prisma.$transaction(async (tx) => {
        const bot = await lockBot(tx, botId);
        const version = await tx.botVersion.findFirst({ where: { id: versionId, bot_id: botId } });
        if (!version) throw new Error('La versión no pertenece a este bot.');
        if (bot.published) await ensurePublishedVersion(tx, bot);
        const snapshot = readVersionSnapshot(version, bot);
        const config = normalizeAndValidateConfig(snapshot.config);
        await tx.bot.update({ where: { id: botId }, data: {
            config: config as Prisma.InputJsonValue, prompt_version: snapshot.prompt_version, bot_type: snapshot.bot_type,
            openai_prompt_id: snapshot.openai_prompt_id, openai_vector_store_id: snapshot.openai_vector_store_id,
        } });
        return version;
    });
    revalidateBot(botId);
    return result;
}

function revalidateBot(botId: string) {
    revalidatePath(`/admin/bots/${botId}`);
    revalidatePath(`/admin/evaluators/${botId}`);
    revalidatePath('/admin/evaluators');
    revalidatePath('/admin');
}

export async function publishBotToStaging(botId: string) {
    await verifyAdmin();
    const draft = await validatedDraft(botId);
    const flow_lint = await releaseChecks(draft, 'STAGING');
    const version = await prisma.$transaction(async (tx) => {
        const current = await lockBot(tx, botId);
        const normalized = { ...current, config: normalizeAndValidateConfig(current.config) } as Bot;
        if (fingerprint(normalized) !== fingerprint(draft)) throw new Error('El borrador cambió durante la validación. Reintentá.');
        return appendVersion(tx, draft, 'STAGING');
    });
    revalidateBot(botId);
    return { version, flow_lint };
}

export async function promoteBotToProd(botId: string, stagingVersionId?: string) {
    await verifyAdmin();
    const draft = await validatedDraft(botId);
    const staging = stagingVersionId
        ? await prisma.botVersion.findFirst({ where: { id: stagingVersionId, bot_id: botId, environment: 'STAGING' } })
        : null;
    if (stagingVersionId && !staging) throw new Error('La versión STAGING no pertenece a este bot.');
    const source = staging ? { ...draft, ...readVersionSnapshot(staging, draft) } : draft;
    const flow_lint = await releaseChecks(source, 'PROD');
    const result = await prisma.$transaction(async (tx) => {
        const current = await lockBot(tx, botId);
        if (!staging && fingerprint({ ...current, config: normalizeAndValidateConfig(current.config) } as Bot) !== fingerprint(draft)) {
            throw new Error('El borrador cambió durante la validación. Reintentá.');
        }
        if (current.published) await ensurePublishedVersion(tx, current);
        const staged = staging || await appendVersion(tx, source, 'STAGING');
        const version = await appendVersion(tx, source, 'PROD');
        await tx.bot.update({ where: { id: botId }, data: { published: true } });
        return { version, staging_version_id: staged.id };
    });
    revalidateBot(botId);
    return { ...result, flow_lint, staging_source: staging ? 'explicit' as const : 'auto' as const };
}

export async function rollbackBotProd(botId: string, prodVersionId?: string) {
    await verifyAdmin();
    const draft = await validatedDraft(botId);
    const target = await prisma.botVersion.findFirst({
        where: { bot_id: botId, environment: 'PROD', ...(prodVersionId ? { id: prodVersionId } : {}) },
        orderBy: { version_number: 'desc' }, ...(prodVersionId ? {} : { skip: 1 }),
    });
    if (!target) throw new Error('No existe una versión PROD válida para este bot.');
    const source = { ...draft, ...readVersionSnapshot(target, draft) };
    await releaseChecks(source, 'PROD');
    const version = await prisma.$transaction(async (tx) => {
        await lockBot(tx, botId);
        const released = await appendVersion(tx, source, 'PROD');
        await tx.bot.update({ where: { id: botId }, data: { published: true } });
        return released;
    });
    revalidateBot(botId);
    return version;
}
