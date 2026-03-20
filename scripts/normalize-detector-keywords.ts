import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type BotRow = {
    id: string;
    name: string;
    config: unknown;
};

function resolveConnectionString(): string {
    const raw = process.env.DATABASE_URL || process.env.DIRECT_URL || '';
    if (!raw) {
        throw new Error('Missing DATABASE_URL or DIRECT_URL');
    }
    return raw.startsWith('postgres://')
        ? `postgresql://${raw.slice('postgres://'.length)}`
        : raw;
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function normalizeKeywordList(rawKeywords: unknown): string[] {
    if (!Array.isArray(rawKeywords)) return [];

    const out: string[] = [];
    for (const keyword of rawKeywords) {
        if (typeof keyword !== 'string') continue;
        for (const token of keyword.split(',')) {
            const trimmed = token.trim();
            if (trimmed) out.push(trimmed);
        }
    }

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const keyword of out) {
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

function normalizeConfig(config: unknown): { config: Record<string, unknown>; changed: boolean; changedSteps: number } {
    const base = toRecord(config);
    const rawSteps = Array.isArray(base.detection_steps) ? base.detection_steps : [];
    if (rawSteps.length === 0) {
        return { config: base, changed: false, changedSteps: 0 };
    }

    let changed = false;
    let changedSteps = 0;

    const nextSteps = rawSteps.map((step) => {
        if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
        const stepRecord = step as Record<string, unknown>;
        if (stepRecord.type !== 'text' || !Array.isArray(stepRecord.keywords)) return step;

        const rawKeywords = stepRecord.keywords
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean);
        const normalized = normalizeKeywordList(stepRecord.keywords);
        const hasCommaKeyword = rawKeywords.some((value) => value.includes(','));
        const sameLength = rawKeywords.length === normalized.length;
        const sameOrder = sameLength && rawKeywords.every((value, index) => value === normalized[index]);
        if (!hasCommaKeyword && sameOrder) return step;

        changed = true;
        changedSteps += 1;
        return {
            ...stepRecord,
            keywords: normalized,
        };
    });

    if (!changed) {
        return { config: base, changed: false, changedSteps: 0 };
    }

    return {
        config: {
            ...base,
            detection_steps: nextSteps,
        },
        changed: true,
        changedSteps,
    };
}

async function main() {
    const prisma = new PrismaClient({
        adapter: new PrismaPg({
            connectionString: resolveConnectionString(),
            max: 3,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 10_000,
        }),
    });

    try {
        const bots = await prisma.bot.findMany({
            select: { id: true, name: true, config: true },
        }) as BotRow[];

        let changedBots = 0;
        let changedStepsTotal = 0;
        const changedNames: string[] = [];

        for (const bot of bots) {
            const normalized = normalizeConfig(bot.config);
            if (!normalized.changed) continue;

            await prisma.bot.update({
                where: { id: bot.id },
                data: {
                    config: normalized.config as unknown as import('@prisma/client').Prisma.InputJsonValue,
                },
            });

            changedBots += 1;
            changedStepsTotal += normalized.changedSteps;
            changedNames.push(bot.name);
        }

        console.log(JSON.stringify({
            changed_bots: changedBots,
            changed_steps_total: changedStepsTotal,
            bots: changedNames,
        }, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('[normalize-detector-keywords] failed', error);
    process.exit(1);
});
