import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { normalizeRagConfig } from '@/lib/rag-config';
import { lintFlowConfig } from '@/lib/flow-linter';
import type { BotConfig } from '@/lib/schemas/bot-config';

type BotRow = {
    id: string;
    name: string;
    bot_type: string;
    published: boolean;
    openai_vector_store_id: string | null;
    config: unknown;
};

type PhraseFallbackStats = {
    totalPhraseListTriggers: number;
    ambiguousOnlyCount: number;
    offCount: number;
    unspecifiedCount: number;
};

function toRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return input as Record<string, unknown>;
}

function toConfig(input: unknown): BotConfig {
    return toRecord(input) as unknown as BotConfig;
}

function collectPhraseFallbackStats(config: BotConfig): PhraseFallbackStats {
    const steps = [
        ...(Array.isArray(config.flow_steps) ? config.flow_steps : []),
        ...(Array.isArray(config.global_triggers) ? config.global_triggers : []),
    ];

    const stats: PhraseFallbackStats = {
        totalPhraseListTriggers: 0,
        ambiguousOnlyCount: 0,
        offCount: 0,
        unspecifiedCount: 0,
    };

    for (const step of steps) {
        const triggers = Array.isArray(step?.triggers) ? step.triggers : [];
        for (const trigger of triggers) {
            if (trigger?.type !== 'PHRASE_LIST') continue;
            stats.totalPhraseListTriggers += 1;
            const mode = trigger?.phrase_list?.model_fallback?.mode;
            if (mode === 'ambiguous_only') {
                stats.ambiguousOnlyCount += 1;
            } else if (mode === 'off') {
                stats.offCount += 1;
            } else {
                stats.unspecifiedCount += 1;
            }
        }
    }

    return stats;
}

function countDetectorCommaKeywords(config: BotConfig): number {
    const steps = Array.isArray(config.detection_steps) ? config.detection_steps : [];
    let total = 0;

    for (const step of steps) {
        if (step?.type !== 'text') continue;
        const keywords = Array.isArray(step.keywords) ? step.keywords : [];
        for (const keyword of keywords) {
            if (typeof keyword === 'string' && keyword.includes(',')) {
                total += 1;
            }
        }
    }

    return total;
}

function compactIssue(issue: { severity: 'critical' | 'warning'; code: string; message: string; path?: string }) {
    return {
        severity: issue.severity,
        code: issue.code,
        path: issue.path || '',
        message: issue.message,
    };
}

function resolveConnectionString(): string {
    const raw = process.env.DATABASE_URL || process.env.DIRECT_URL || '';
    if (!raw) throw new Error('Missing DATABASE_URL or DIRECT_URL');
    return raw.startsWith('postgres://')
        ? `postgresql://${raw.slice('postgres://'.length)}`
        : raw;
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
            select: {
                id: true,
                name: true,
                bot_type: true,
                published: true,
                openai_vector_store_id: true,
                config: true,
            },
            orderBy: { created_at: 'asc' },
        }) as BotRow[];

        const report = {
            generated_at: new Date().toISOString(),
            totals: {
                bots: bots.length,
                published: bots.filter((b) => b.published).length,
                unpublished: bots.filter((b) => !b.published).length,
                blockers: 0,
                warnings: 0,
            },
            by_type: {} as Record<string, number>,
            bots: [] as Array<Record<string, unknown>>,
        };

        for (const bot of bots) {
            report.by_type[bot.bot_type] = (report.by_type[bot.bot_type] || 0) + 1;

            const config = toConfig(bot.config);
            const llmModel = typeof config.llm_model === 'string' ? config.llm_model.trim() : '';
            const rag = normalizeRagConfig(config.rag_config || {}, bot.openai_vector_store_id);
            const lint = lintFlowConfig(config);
            const phraseFallback = collectPhraseFallbackStats(config);
            const detectorCommaKeywords = countDetectorCommaKeywords(config);

            const blockers: string[] = [];
            const warnings: string[] = [];

            if (!llmModel) {
                blockers.push('llm_model ausente o vacío.');
            }
            if (rag.mode !== 'never' && rag.vector_store_ids.length === 0) {
                blockers.push(`RAG activo (${rag.mode}) sin vector_store_ids.`);
            }
            if (lint.critical_count > 0) {
                blockers.push(`Flow lint crítico: ${lint.critical_count} issue(s).`);
            }

            if (rag.wrapper.fallback !== 'none') {
                warnings.push(`RAG wrapper fallback explícito: ${rag.wrapper.fallback}.`);
            }
            if (lint.warning_count > 0) {
                warnings.push(`Flow lint warnings: ${lint.warning_count}.`);
            }
            if (phraseFallback.ambiguousOnlyCount > 0) {
                warnings.push(`Triggers con model_fallback=ambiguous_only: ${phraseFallback.ambiguousOnlyCount}.`);
            }
            if (detectorCommaKeywords > 0) {
                warnings.push(`Keywords detector en formato CSV legacy: ${detectorCommaKeywords}.`);
            }

            if (blockers.length > 0) report.totals.blockers += 1;
            if (warnings.length > 0) report.totals.warnings += 1;

            report.bots.push({
                id: bot.id,
                name: bot.name,
                bot_type: bot.bot_type,
                published: bot.published,
                llm_model: llmModel || null,
                rag: {
                    mode: rag.mode,
                    owner: rag.owner,
                    strict_mode: rag.strict_mode,
                    vector_store_ids: rag.vector_store_ids.length,
                    fallback: rag.wrapper.fallback,
                },
                phrase_fallback: phraseFallback,
                flow_lint: {
                    critical: lint.critical_count,
                    warning: lint.warning_count,
                    sample_issues: lint.issues.slice(0, 4).map(compactIssue),
                },
                blockers,
                warnings,
            });
        }

        console.log(JSON.stringify(report, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('[inspect-demo-readiness] failed', error);
    process.exit(1);
});
