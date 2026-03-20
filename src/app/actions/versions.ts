'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { verifyAdmin } from '@/lib/auth-utils';
import { BotConfigSchema } from '@/lib/schemas/bot-config';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { decrypt, isEncrypted } from '@/lib/crypto';
import { normalizeRagConfig } from '@/lib/rag-config';
import { lintFlowConfig, formatCriticalFlowLintError, type FlowLintReport } from '@/lib/flow-linter';
import type { Prisma } from '@prisma/client';
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

async function nextVersionNumber(botId: string) {
    const latestVersion = await prisma.botVersion.findFirst({
        where: { bot_id: botId },
        orderBy: { version_number: 'desc' }
    });
    return (latestVersion?.version_number || 0) + 1;
}

type BotRagContext = {
    api_key: string | null;
    openai_vector_store_id: string | null;
};

function getPrimaryVectorStoreId(config: BotConfig): string | null {
    const rag = normalizeRagConfig(config?.rag_config || {}, null);
    return rag.vector_store_ids[0] || null;
}

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

export async function createBotVersion(botId: string, note?: string) {
    await verifyAdmin();

    const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: {
            config: true,
            prompt_version: true,
            deleted_at: true,
        },
    });
    if (!bot || bot.deleted_at) throw new Error('Bot not found');
    const validatedConfig = normalizeAndValidateConfig(bot.config, 'createBotVersion.current_bot');
    const resolvedConfig = validatedConfig;
    const nextVersion = await nextVersionNumber(botId);

    const version = await prisma.botVersion.create({
        data: {
            bot_id: botId,
            version_number: nextVersion,
            config: resolvedConfig as Prisma.InputJsonValue,
            prompt_version: bot.prompt_version || '1',
            environment: note || 'SNAPSHOT', // Using environment field as Label/Type for now
        }
    });

    revalidatePath(`/admin/bots/${botId}`);
    revalidatePath(`/admin/evaluators/${botId}`);
    revalidatePath('/admin/evaluators');
    return version;
}

export async function getBotVersions(botId: string) {
    await verifyAdmin();
    return prisma.botVersion.findMany({
        where: { bot_id: botId },
        orderBy: { created_at: 'desc' }
    });
}

export async function restoreBotVersion(botId: string, versionId: string) {
    await verifyAdmin();

    const version = await prisma.botVersion.findUnique({
        where: { id: versionId }
    });

    if (!version) throw new Error('Version not found');
    const validatedConfig = normalizeAndValidateConfig(version.config, 'restoreBotVersion.target_version');
    const resolvedConfig = validatedConfig;

    const restored = await prisma.bot.updateMany({
        where: { id: botId, deleted_at: null },
        data: {
            config: resolvedConfig as Prisma.InputJsonValue,
            prompt_version: version.prompt_version,
            openai_vector_store_id: getPrimaryVectorStoreId(resolvedConfig),
        }
    });
    if (restored.count === 0) throw new Error('Bot not found');

    revalidatePath(`/admin/bots/${botId}`);
    revalidatePath(`/admin/evaluators/${botId}`);
    revalidatePath('/admin/evaluators');
    return version;
}

export async function publishBotToStaging(botId: string) {
    await verifyAdmin();

    const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: {
            bot_type: true,
            openai_prompt_id: true,
            openai_vector_store_id: true,
            api_key: true,
            config: true,
            prompt_version: true,
            deleted_at: true,
        },
    });
    if (!bot || bot.deleted_at) throw new Error('Bot not found');

    const validatedConfig = normalizeAndValidateConfig(bot.config, 'publishBotToStaging.current_bot');
    const resolvedConfig = validatedConfig;
    const flowLint = lintFlowConfig(resolvedConfig);
    if (flowLint.critical_count > 0) {
        throw new Error(formatCriticalFlowLintError(
            flowLint,
            'No se puede publicar a STAGING: hay errores críticos de flujo.'
        ));
    }
    const rag = normalizeRagConfig(resolvedConfig.rag_config || {}, bot.openai_vector_store_id);
    if (rag.mode !== 'never' && rag.vector_store_ids.length === 0) {
        throw new Error('RAG activo requiere al menos un Vector Store ID.');
    }
    await assertPricingReadyForRelease({
        botId,
        botType: bot.bot_type,
        openaiPromptId: bot.openai_prompt_id,
        config: resolvedConfig,
        stage: 'STAGING',
    });

    const nextVersion = await nextVersionNumber(botId);
    const version = await prisma.botVersion.create({
        data: {
            bot_id: botId,
            version_number: nextVersion,
            config: resolvedConfig as Prisma.InputJsonValue,
            prompt_version: bot.prompt_version || '1',
            environment: 'STAGING',
        },
    });

    revalidatePath(`/admin/bots/${botId}`);
    revalidatePath(`/admin/evaluators/${botId}`);
    revalidatePath('/admin/evaluators');
    return {
        version,
        flow_lint: flowLint as FlowLintReport,
    };
}

export async function promoteBotToProd(botId: string, stagingVersionId?: string) {
    await verifyAdmin();

    const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: {
            bot_type: true,
            openai_prompt_id: true,
            openai_vector_store_id: true,
            api_key: true,
            config: true,
            prompt_version: true,
            deleted_at: true,
        },
    });
    if (!bot || bot.deleted_at) throw new Error('Bot not found');

    const currentConfig = normalizeAndValidateConfig(bot.config, 'promoteBotToProd.current_bot');
    const currentPromptVersion = bot.prompt_version || '1';

    let sourceConfig: BotConfig;
    let sourcePromptVersion = currentPromptVersion;
    let stagingSource: 'explicit' | 'latest' | 'auto';
    let resolvedStagingVersionId: string | null = null;

    if (stagingVersionId) {
        const explicitStaging = await prisma.botVersion.findUnique({ where: { id: stagingVersionId } });
        if (!explicitStaging) throw new Error('No existe la versión STAGING seleccionada.');
        if (explicitStaging.bot_id !== botId) {
            throw new Error('La versión STAGING seleccionada no pertenece a este bot.');
        }
        sourceConfig = normalizeAndValidateConfig(explicitStaging.config, 'promoteBotToProd.explicit_staging');
        sourcePromptVersion = explicitStaging.prompt_version || currentPromptVersion;
        stagingSource = 'explicit';
        resolvedStagingVersionId = explicitStaging.id;
    } else {
        const latestStaging = await prisma.botVersion.findFirst({
            where: { bot_id: botId, environment: 'STAGING' },
            orderBy: { created_at: 'desc' },
        });
        if (!latestStaging) {
            sourceConfig = currentConfig;
            stagingSource = 'auto';
        } else {
            const latestStagingConfig = normalizeAndValidateConfig(latestStaging.config, 'promoteBotToProd.latest_staging');
            const stagingMatchesCurrent = latestStaging.prompt_version === currentPromptVersion
                && JSON.stringify(latestStagingConfig) === JSON.stringify(currentConfig);
            if (stagingMatchesCurrent) {
                sourceConfig = latestStagingConfig;
                sourcePromptVersion = latestStaging.prompt_version || currentPromptVersion;
                stagingSource = 'latest';
                resolvedStagingVersionId = latestStaging.id;
            } else {
                sourceConfig = currentConfig;
                stagingSource = 'auto';
            }
        }
    }

    const flowLint = lintFlowConfig(sourceConfig);
    if (flowLint.critical_count > 0) {
        throw new Error(formatCriticalFlowLintError(
            flowLint,
            'No se puede promover a PROD: hay errores críticos de flujo.'
        ));
    }
    await assertPricingReadyForRelease({
        botId,
        botType: bot.bot_type,
        openaiPromptId: bot.openai_prompt_id,
        config: sourceConfig,
        stage: 'PROD',
    });
    await assertVectorStoresReadyForProd(bot, sourceConfig);

    if (stagingSource === 'auto') {
        const nextStagingVersion = await nextVersionNumber(botId);
        const autoStaging = await prisma.botVersion.create({
            data: {
                bot_id: botId,
                version_number: nextStagingVersion,
                config: sourceConfig as Prisma.InputJsonValue,
                prompt_version: sourcePromptVersion,
                environment: 'STAGING',
            },
        });
        resolvedStagingVersionId = autoStaging.id;
    }

    const nextVersion = await nextVersionNumber(botId);
    const prodVersion = await prisma.botVersion.create({
        data: {
            bot_id: botId,
            version_number: nextVersion,
            config: sourceConfig as Prisma.InputJsonValue,
            prompt_version: sourcePromptVersion,
            environment: 'PROD',
        },
    });

    await prisma.bot.update({
        where: { id: botId },
        data: {
            config: sourceConfig as Prisma.InputJsonValue,
            prompt_version: sourcePromptVersion,
            published: true,
            openai_vector_store_id: getPrimaryVectorStoreId(sourceConfig),
        },
    });

    revalidatePath(`/admin/bots/${botId}`);
    revalidatePath(`/admin/evaluators/${botId}`);
    revalidatePath('/admin/evaluators');
    revalidatePath('/admin');
    return {
        version: prodVersion,
        flow_lint: flowLint as FlowLintReport,
        staging_source: stagingSource,
        staging_version_id: resolvedStagingVersionId,
    };
}

export async function rollbackBotProd(botId: string, prodVersionId?: string) {
    await verifyAdmin();
    const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: { bot_type: true, openai_prompt_id: true, deleted_at: true },
    });
    if (!bot || bot.deleted_at) throw new Error('Bot not found');

    const targetVersion = prodVersionId
        ? await prisma.botVersion.findUnique({ where: { id: prodVersionId } })
        : await prisma.botVersion.findFirst({
            where: { bot_id: botId, environment: 'PROD' },
            orderBy: { created_at: 'desc' },
            skip: 1, // Previous PROD
        });

    if (!targetVersion) throw new Error('No hay versión PROD previa para rollback.');

    const validatedConfig = normalizeAndValidateConfig(targetVersion.config, 'rollbackBotProd.target_version');
    const resolvedConfig = validatedConfig;
    await assertPricingReadyForRelease({
        botId,
        botType: bot.bot_type,
        openaiPromptId: bot.openai_prompt_id,
        config: resolvedConfig,
        stage: 'PROD',
    });

    await prisma.bot.update({
        where: { id: botId },
        data: {
            config: resolvedConfig as Prisma.InputJsonValue,
            prompt_version: targetVersion.prompt_version,
            published: true,
            openai_vector_store_id: getPrimaryVectorStoreId(resolvedConfig),
        },
    });

    const nextVersion = await nextVersionNumber(botId);
    const rollbackVersion = await prisma.botVersion.create({
        data: {
            bot_id: botId,
            version_number: nextVersion,
            config: resolvedConfig as Prisma.InputJsonValue,
            prompt_version: targetVersion.prompt_version,
            environment: 'PROD',
        },
    });

    revalidatePath(`/admin/bots/${botId}`);
    revalidatePath(`/admin/evaluators/${botId}`);
    revalidatePath('/admin/evaluators');
    revalidatePath('/admin');
    return rollbackVersion;
}
