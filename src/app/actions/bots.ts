'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { verifyAdmin, getCurrentUser } from '@/lib/auth-utils';
import { encrypt, decrypt, isEncrypted, maskApiKey } from '@/lib/crypto';
import { BotConfigSchema } from '@/lib/schemas/bot-config';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { normalizeRagConfig } from '@/lib/rag-config';
import { lintFlowConfig, type FlowLintReport } from '@/lib/flow-linter';
import { sanitizeImageTriggersForSave } from '@/lib/image-trigger-utils';
import { toPublicBotResponse, type PublicBot } from '@/lib/public-bot-contract';
import { collectBotConfigCompatibilityWarningMessages } from '@/lib/bot-config-compat';
import { actionFailure, actionSuccess, resolveActionErrorMessage, type ActionResult } from '@/lib/action-result';
import type { Prisma } from '@prisma/client';

export interface BotFilters {
    page?: number;
    search?: string;
    excludeType?: string;
}

function normalizePage(page: number | undefined): number {
    if (!Number.isFinite(page)) return 1;
    return Math.max(1, Math.trunc(page as number));
}

function normalizeDetectorKeywordList(rawKeywords: unknown): string[] {
    if (!Array.isArray(rawKeywords)) return [];

    const flattened: string[] = [];
    for (const keyword of rawKeywords) {
        if (typeof keyword !== 'string') continue;
        const parts = keyword.split(',');
        for (const part of parts) {
            const trimmed = part.trim();
            if (trimmed) flattened.push(trimmed);
        }
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const keyword of flattened) {
        const key = keyword
            .toLocaleLowerCase('es')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        deduped.push(keyword);
    }

    return deduped;
}

function normalizeDetectorKeywordsInConfig(config: BotConfig): BotConfig {
    const steps = Array.isArray(config.detection_steps) ? config.detection_steps : [];
    if (steps.length === 0) return config;

    let changed = false;
    const normalizedSteps = steps.map((step) => {
        if (step.type !== 'text' || !Array.isArray(step.keywords)) return step;

        const rawKeywords = step.keywords
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean);
        const normalizedKeywords = normalizeDetectorKeywordList(step.keywords);
        const hasCommaKeyword = rawKeywords.some((value) => value.includes(','));
        const sameLength = rawKeywords.length === normalizedKeywords.length;
        const sameOrder = sameLength && rawKeywords.every((value, index) => value === normalizedKeywords[index]);
        if (!hasCommaKeyword && sameOrder) return step;

        changed = true;
        return {
            ...step,
            keywords: normalizedKeywords,
        };
    });

    if (!changed) return config;

    return {
        ...config,
        detection_steps: normalizedSteps,
    };
}

export async function getAllBots() {
    await verifyAdmin();
    return prisma.bot.findMany({
        where: { deleted_at: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
}

export async function getAllEvaluators() {
    await verifyAdmin();
    return prisma.bot.findMany({
        where: { bot_type: 'EVALUATOR', deleted_at: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
}

export async function getBots(filters: BotFilters = {}) {
    await verifyAdmin();
    const pageSize = 9;
    const page = normalizePage(filters.page);

    // Admin "Bots" view lists all bot strategies (including Examinador/EXAMINER).
    const where: Prisma.BotWhereInput = { deleted_at: null };
    if (filters.search) {
        where.name = { contains: filters.search };
    }
    if (filters.excludeType) {
        where.bot_type = { not: filters.excludeType };
    }

    const [bots, totalCount] = await Promise.all([
        prisma.bot.findMany({
            where,
            select: {
                id: true,
                name: true,
                bot_type: true,
                published: true,
                created_at: true,
                api_key: true,
            },
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.bot.count({ where }),
    ]);

    // Return bots with masked API keys for list view
    const safeBots = bots.map((bot) => {
        let displayKey: string | null = null;
        if (bot.api_key) {
            try {
                displayKey = isEncrypted(bot.api_key) ? decrypt(bot.api_key) : bot.api_key;
            } catch (error) {
                console.warn(`Failed to decrypt API key for bot ${bot.id} in list view:`, error);
                displayKey = null;
            }
        }

        return {
            ...bot,
            api_key_display: displayKey ? maskApiKey(displayKey) : '(Invalid or missing key)',
            api_key: undefined // Never send actual key in list
        };
    });

    return {
        bots: safeBots,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        page,
    };
}

export async function getBot(id: string) {
    await verifyAdmin();
    const bot = await prisma.bot.findUnique({
        where: { id },
    });

    if (!bot || bot.deleted_at) return null;

    let maskedKey = '';
    let hasApiKey = false;
    if (bot.api_key) {
        hasApiKey = true;
        try {
            const decryptedKey = isEncrypted(bot.api_key) ? decrypt(bot.api_key) : bot.api_key;
            maskedKey = decryptedKey ? maskApiKey(decryptedKey) : '********';
        } catch (e) {
            console.error('Failed to decrypt API key:', e);
            maskedKey = '(Invalid or missing key)';
        }
    }

    return {
        ...bot,
        logo: bot.logo ? `data:image/png;base64,${Buffer.from(bot.logo).toString('base64')}` : null,
        api_key: '',
        has_api_key: hasApiKey,
        api_key_display: maskedKey,
    };
}

/**
 * Public bot fetch for chat interface.
 * Strips sensitive data like API keys and system prompts.
 */
export async function getPublicBot(
    id: string,
    options: { includeUnpublished?: boolean } = {}
): Promise<PublicBot | null> {
    const bot = await prisma.bot.findFirst({
        where: { id, deleted_at: null },
        select: {
            id: true,
            name: true,
            bot_type: true,
            published: true,
            logo: true,
            config: true,
        },
    });

    if (!bot) return null;
    if (!options.includeUnpublished && !bot.published) return null;

    // Explicit allowlist projection: never expose API key/system prompt internals.
    return toPublicBotResponse(bot);
}

export async function getChatBot(id: string): Promise<PublicBot | null> {
    const user = await getCurrentUser();
    if (!user) return null;

    // Admins can see all bots
    if (user.role === 'ADMIN') {
        return getPublicBot(id, { includeUnpublished: true });
    }

    if (user.ltiAccessScope) {
        if (user.ltiAccessScope.botId !== id) return null;
        return getPublicBot(id);
    }

    // 1. Check direct user assignment
    const assignment = await prisma.botAssignment.findFirst({
        where: {
            user_id: user.userId,
            bot_id: id
        }
    });

    if (assignment) return getPublicBot(id);

    // 2. Check Organization Access
    // User must be a member of an organization that has this bot assigned
    const orgAccess = await prisma.organizationMember.findFirst({
        where: {
            user_id: user.userId,
            organization: {
                bots: {
                    some: { bot_id: id }
                }
            }
        }
    });

    if (orgAccess) return getPublicBot(id);

    return null;
}

export async function createBot(name: string): Promise<ActionResult<Awaited<ReturnType<typeof prisma.bot.create>>>> {
    try {
        await verifyAdmin();
        const bot = await prisma.bot.create({
            data: {
                name,
                openai_prompt_id: '',
                config: {
                    scenarios: ["The user is a customer looking for support."],
                    flow_rules: { default: "Be helpful and concise." },
                    bypass_logic: {},
                    instructions_prefix: "You are a simulator director.",
                    llm_model: "gpt-4o",
                    model_controls: {
                        text_format: 'text',
                        reasoning_effort: 'medium',
                        verbosity: 'medium',
                        summary: 'auto',
                        store_logs: true,
                    },
                    chat_features: {
                        allow_image_upload: false,
                        allow_voice_input: true,
                        allow_voice_output: true,
                        tts_settings: {
                            speed: 1.15,
                            voice: '',
                            accent: '',
                            gender: 'neutral',
                            style: '',
                            use_archetype: false,
                        },
                    },
                    rag_config: {
                        enabled: false,
                        mode: 'never',
                        owner: 'wrapper',
                        vector_store_ids: [],
                        strict_mode: false,
                        wrapper: {
                            strategy: 'similarity',
                            fallback: 'none',
                            top_k: 4,
                            cache_ttl: 120,
                            max_evidence_tokens: 1200,
                            metadata_filters: {},
                        },
                        platform: {
                            max_num_results: 6,
                            force_tool: false,
                        },
                        audit: {
                            store_results: true,
                            store_queries: true,
                            store_scores: true,
                        },
                        // Legacy mirror fields for backward compatibility
                        rag_owner: 'wrapper',
                        top_k: 4,
                        fallback_strategy: 'none',
                        cache_ttl_seconds: 120,
                        history_limit: 10,
                    }
                } as Prisma.InputJsonValue,
            },
        });
        revalidatePath('/admin');
        return actionSuccess(bot);
    } catch (error: unknown) {
        console.error('Failed to create bot:', error);
        return actionFailure(resolveActionErrorMessage(error, 'No se pudo crear el bot.'));
    }
}

type UpdateBotActionData = {
    bot: Awaited<ReturnType<typeof prisma.bot.update>>;
    flow_lint: FlowLintReport | null;
};

export async function updateBot(id: string, data: {
    name?: string,
    bot_type?: string,
    api_key?: string,
    openai_prompt_id?: string,
    openai_vector_store_id?: string,
    prompt_version?: string,
    config?: unknown,
    published?: boolean,
}): Promise<ActionResult<UpdateBotActionData>> {
    try {
        await verifyAdmin();
        const existingBot = await prisma.bot.findFirst({
            where: { id, deleted_at: null },
            select: {
                id: true,
            },
        });
        if (!existingBot) {
            return actionFailure('Bot not found');
        }

        const updateData: Prisma.BotUpdateInput = {};
        let flowLintReport: FlowLintReport | null = null;
        let inferredVectorStoreId: string | null | undefined;
        let expectedApiKeyForVerification: string | null | undefined;
        if (data.name) updateData.name = data.name;
        if (data.bot_type) updateData.bot_type = data.bot_type;

        // Encrypt API key before storing
        if (data.api_key !== undefined) {
            const apiKeyRaw = typeof data.api_key === 'string' ? data.api_key.replace(/\r/g, '') : '';
            if (apiKeyRaw.trim()) {
                updateData.api_key = encrypt(apiKeyRaw);
                expectedApiKeyForVerification = apiKeyRaw;
            } else {
                updateData.api_key = null; // Clear key if empty
                expectedApiKeyForVerification = null;
            }
        }

        if (data.openai_prompt_id !== undefined) {
            const promptId = data.openai_prompt_id.trim();
            if (promptId && !promptId.startsWith('pmpt_')) {
                throw new Error('openai_prompt_id inválido: debe comenzar con pmpt_ o estar vacío.');
            }
            updateData.openai_prompt_id = promptId;
        }
        if (data.openai_vector_store_id !== undefined) {
            const vsId = data.openai_vector_store_id.trim();
            if (vsId && !vsId.startsWith('vs_')) {
                throw new Error('openai_vector_store_id inválido: debe comenzar con vs_.');
            }
            updateData.openai_vector_store_id = vsId;
        }
        if (data.prompt_version !== undefined) updateData.prompt_version = data.prompt_version;
        if (data.config !== undefined) {
            const compatibilityWarnings = collectBotConfigCompatibilityWarningMessages(data.config);
            if (compatibilityWarnings.length > 0) {
                console.warn(
                    `[bot-config] save warnings bot=${id} warnings=${compatibilityWarnings.slice(0, 20).join(' | ')}`
                );
            }
            const parsed = BotConfigSchema.safeParse(data.config || {});
            if (!parsed.success) {
                const issue = parsed.error.issues[0];
                const issuePath = issue?.path?.join('.') || 'config';
                throw new Error(`Config inválida: ${issuePath} - ${issue?.message || 'Error de validación'}`);
            }
            const llmModel = typeof parsed.data.llm_model === 'string'
                ? parsed.data.llm_model.trim()
                : '';
            if (!llmModel) {
                throw new Error('Config inválida: llm_model es obligatorio.');
            }
            const validModel = llmModel.startsWith('gpt-')
                || llmModel.startsWith('o')
                || llmModel.startsWith('chatgpt-')
                || llmModel.startsWith('codex-');
            if (!validModel) {
                throw new Error('Config inválida: llm_model debe ser un modelo compatible (ej: gpt-4o-mini).');
            }
            const rag = normalizeRagConfig(parsed.data.rag_config || {}, data.openai_vector_store_id);
            for (const vectorStoreId of rag.vector_store_ids) {
                if (!vectorStoreId.startsWith('vs_')) {
                    throw new Error('Config inválida: todos los Vector Store IDs deben comenzar con vs_.');
                }
            }
            inferredVectorStoreId = rag.vector_store_ids[0] || null;
            let finalConfig = parsed.data;

            const triggerValidation = sanitizeImageTriggersForSave(finalConfig.image_triggers);
            if (triggerValidation.partialRow) {
                throw new Error(`Disparador de imagen incompleto en la fila ${triggerValidation.partialRow}. Completá patrón y URL, o eliminá la fila.`);
            }
            if (triggerValidation.invalidUrlRow) {
                throw new Error(`URL de imagen inválida en la fila ${triggerValidation.invalidUrlRow}.`);
            }
            if (triggerValidation.invalidHostRow) {
                throw new Error(
                    `Dominio no permitido en la fila ${triggerValidation.invalidHostRow}: ${triggerValidation.invalidHost || 'host desconocido'}.`
                );
            }
            if (Array.isArray(finalConfig.image_triggers)) {
                finalConfig = {
                    ...finalConfig,
                    image_triggers: triggerValidation.sanitized && triggerValidation.sanitized.length > 0
                        ? triggerValidation.sanitized
                        : undefined,
                };
            }

            finalConfig = normalizeDetectorKeywordsInConfig(finalConfig);

            flowLintReport = lintFlowConfig(finalConfig);
            updateData.config = finalConfig as Prisma.InputJsonValue;
        }
        if (data.openai_vector_store_id === undefined && inferredVectorStoreId !== undefined) {
            // Keep legacy top-level vector store field aligned with rag_config.
            updateData.openai_vector_store_id = inferredVectorStoreId;
        }
        if (data.published !== undefined) updateData.published = data.published;

        const bot = await prisma.$transaction(async (tx) => {
            const updated = await tx.bot.update({
                where: { id },
                data: updateData,
            });

            if (expectedApiKeyForVerification !== undefined) {
                const persistedApiKey = updated.api_key || '';
                const persistedPlain = persistedApiKey
                    ? (isEncrypted(persistedApiKey) ? decrypt(persistedApiKey) : persistedApiKey)
                    : '';

                const expectedPlain = expectedApiKeyForVerification ?? '';
                if (persistedPlain !== expectedPlain) {
                    throw new Error(
                        'La API key no se guardó completa. Verifica el tipo/longitud de columna en DB (bots.api_key) y vuelve a intentar.'
                    );
                }
            }

            return updated;
        });
        revalidatePath(`/admin/bots/${id}`);
        revalidatePath(`/admin/evaluators/${id}`);
        revalidatePath('/admin/evaluators');
        revalidatePath('/admin');
        return actionSuccess({
            bot,
            flow_lint: flowLintReport,
        });
    } catch (error: unknown) {
        console.error('Failed to update bot:', error);
        return actionFailure(resolveActionErrorMessage(error, 'No se pudo actualizar el bot.'));
    }
}

// Helper to determine max logo size
function resolveMaxLogoBytes() {
    const parsed = Number(process.env.BOT_LOGO_MAX_BYTES || 1_000_000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1_000_000;
}

export async function deleteBot(id: string): Promise<ActionResult<null>> {
    try {
        await verifyAdmin();
        const deleted = await prisma.bot.updateMany({
            where: { id, deleted_at: null },
            data: {
                deleted_at: new Date(),
                published: false,
            },
        });
        if (deleted.count === 0) {
            return actionFailure('Bot not found');
        }
        revalidatePath('/admin/bots');
        revalidatePath('/admin/evaluators');
        revalidatePath('/admin');
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('Failed to delete bot:', error);
        return actionFailure(resolveActionErrorMessage(error, 'No se pudo eliminar el bot.'));
    }
}

export async function uploadBotLogo(id: string, formData: FormData): Promise<ActionResult<null>> {
    try {
        await verifyAdmin();
        const logoFile = formData.get('logo') as File | null;

        if (!logoFile || logoFile.size === 0) {
            return actionFailure('No file provided');
        }

        if (logoFile.size > resolveMaxLogoBytes()) {
            return actionFailure('Logo file is too large (Max 1MB)');
        }

        if (!logoFile.type.startsWith('image/')) {
            return actionFailure('File must be an image');
        }

        let logoBytes: Uint8Array<ArrayBuffer>;
        try {
            const arrayBuffer = await logoFile.arrayBuffer();
            logoBytes = new Uint8Array(arrayBuffer) as Uint8Array<ArrayBuffer>;
        } catch (e) {
            console.error('Error processing logo file', e);
            return actionFailure('Failed to process logo file');
        }

        const updated = await prisma.bot.updateMany({
            where: { id, deleted_at: null },
            data: { logo: logoBytes }
        });
        if (updated.count === 0) {
            return actionFailure('Bot not found');
        }

        revalidatePath(`/admin/bots/${id}`);
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('Failed to upload bot logo:', error);
        return actionFailure(resolveActionErrorMessage(error, 'No se pudo actualizar el logo del bot.'));
    }
}

export async function deleteBotLogo(id: string): Promise<ActionResult<null>> {
    try {
        await verifyAdmin();
        const updated = await prisma.bot.updateMany({
            where: { id, deleted_at: null },
            data: { logo: null }
        });
        if (updated.count === 0) {
            return actionFailure('Bot not found');
        }
        revalidatePath(`/admin/bots/${id}`);
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('Failed to delete bot logo:', error);
        return actionFailure(resolveActionErrorMessage(error, 'No se pudo eliminar el logo del bot.'));
    }
}
