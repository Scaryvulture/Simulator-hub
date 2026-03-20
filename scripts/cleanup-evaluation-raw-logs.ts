import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { shouldExpireEvaluationRawLog } from '@/lib/evaluation-log-policy';

const prisma = new PrismaClient();

type MetadataObject = Record<string, unknown>;

function toMetadataObject(value: unknown): MetadataObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return { ...(value as MetadataObject) };
}

function parseBatchSize(): number {
    const raw = Number(process.env.EVALUATION_LOG_CLEANUP_BATCH_SIZE || 250);
    if (!Number.isFinite(raw)) return 250;
    const normalized = Math.trunc(raw);
    if (normalized < 10) return 10;
    if (normalized > 1000) return 1000;
    return normalized;
}

function parseBoolean(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

async function main() {
    const batchSize = parseBatchSize();
    const dryRun = parseBoolean(process.env.DRY_RUN);

    let cursorId: string | undefined;
    let scanned = 0;
    let updated = 0;

    console.log(`[evaluation-log-cleanup] starting (batch=${batchSize}, dryRun=${dryRun})`);

    while (true) {
        const sessions = await prisma.session.findMany({
            ...(cursorId
                ? {
                    cursor: { id: cursorId },
                    skip: 1,
                }
                : {}),
            orderBy: { id: 'asc' },
            take: batchSize,
            select: {
                id: true,
                metadata: true,
            },
        });

        if (sessions.length === 0) break;
        scanned += sessions.length;

        for (const session of sessions) {
            const metadata = toMetadataObject(session.metadata);
            if (!metadata) continue;

            const evaluation = toMetadataObject(metadata.evaluation);
            if (!evaluation) continue;
            if (!shouldExpireEvaluationRawLog(evaluation)) continue;
            if (typeof evaluation.raw_log !== 'string' || !evaluation.raw_log.trim()) continue;

            if (!dryRun) {
                delete evaluation.raw_log;
                metadata.evaluation = evaluation;
                await prisma.session.update({
                    where: { id: session.id },
                    data: {
                        metadata: metadata as Prisma.InputJsonValue,
                    },
                });
            }

            updated += 1;
        }

        cursorId = sessions[sessions.length - 1]?.id;
        console.log(`[evaluation-log-cleanup] progress scanned=${scanned} updated=${updated}`);
    }

    console.log(`[evaluation-log-cleanup] done scanned=${scanned} updated=${updated}`);
}

main()
    .catch((error) => {
        console.error('[evaluation-log-cleanup] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
