import * as dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { BotConfigSchema } from '@/lib/schemas/bot-config';
import { collectRuntimePricingModels } from '@/lib/pricing-models';

dotenv.config();

function resolveConnectionString(): string {
    const candidates = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(
        (value): value is string => Boolean(value)
    );

    const normalize = (raw: string) =>
        raw.startsWith('postgres://')
            ? `postgresql://${raw.slice('postgres://'.length)}`
            : raw;

    for (const raw of candidates) {
        const normalized = normalize(raw);
        try {
            new URL(normalized);
            return normalized;
        } catch {
            continue;
        }
    }

    if (candidates.length > 0) {
        return normalize(candidates[0]);
    }

    throw new Error(
        'A valid DATABASE_URL or DIRECT_URL is required. Check URL format and escape special characters in password.'
    );
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveConnectionString() }),
});

async function findMissingPricingModels(models: string[]): Promise<string[]> {
    if (models.length === 0) return [];

    const rows = await prisma.pricingConfig.findMany({
        where: { model_name: { in: models } },
        select: { model_name: true },
    });

    const configured = new Set(rows.map((row) => row.model_name));
    return models.filter((model) => !configured.has(model));
}

async function main() {
    const bots = await prisma.bot.findMany({
        select: {
            id: true,
            name: true,
            bot_type: true,
            openai_prompt_id: true,
            config: true,
            published: true,
        },
        orderBy: { created_at: 'asc' },
    });

    const invalidConfigs: string[] = [];
    const models = new Set<string>();

    for (const bot of bots) {
        const parsed = BotConfigSchema.safeParse(bot.config || {});
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            const path = issue?.path?.join('.') || 'config';
            invalidConfigs.push(`${bot.id} (${bot.name}): ${path} - ${issue?.message || 'validation_error'}`);
            continue;
        }

        for (const model of collectRuntimePricingModels({
            botType: bot.bot_type,
            config: parsed.data,
            openaiPromptId: bot.openai_prompt_id,
        })) {
            models.add(model);
        }
    }

    const ttsConfig = await prisma.ttsConfig.findFirst({
        select: { model: true },
        orderBy: { updated_at: 'desc' },
    });
    if (typeof ttsConfig?.model === 'string' && ttsConfig.model.trim()) {
        models.add(ttsConfig.model.trim());
    }

    const modelList = Array.from(models).sort((a, b) => a.localeCompare(b));
    const missing = await findMissingPricingModels(modelList);

    console.log('[pricing:check] models detected:', modelList.join(', ') || '(none)');

    if (invalidConfigs.length > 0) {
        console.error('\n[pricing:check] invalid bot configs detected:');
        for (const line of invalidConfigs) {
            console.error(`- ${line}`);
        }
    }

    if (missing.length > 0) {
        console.error('\n[pricing:check] missing pricing entries:');
        for (const model of missing) {
            console.error(`- ${model}`);
        }
    }

    if (invalidConfigs.length > 0 || missing.length > 0) {
        process.exitCode = 1;
        return;
    }

    console.log('[pricing:check] OK: all required models have DB pricing.');
}

main()
    .catch((error) => {
        console.error('[pricing:check] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
