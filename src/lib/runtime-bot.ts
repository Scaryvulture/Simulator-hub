import 'server-only';
import type { Bot, Prisma } from '@prisma/client';
import prisma from './prisma';
import { mutateSessionMetadata, toSessionMetadataObject } from './session-metadata';
import { readRuntimeSession } from './session-operation';
import { hasRuntimeSnapshot, readVersionSnapshot, snapshotBot, versionConfig, type SessionRuntimeSnapshot } from './runtime-snapshot';

export async function lockBot(tx: Prisma.TransactionClient, botId: string) {
    await tx.$queryRaw`SELECT id FROM bots WHERE id = ${botId} FOR UPDATE`;
    const bot = await tx.bot.findUnique({ where: { id: botId } });
    if (!bot || bot.deleted_at) throw new Error('Bot not found');
    return bot;
}

export async function appendVersion(tx: Prisma.TransactionClient, bot: Bot, environment: string) {
    const latest = await tx.botVersion.findFirst({ where: { bot_id: bot.id }, orderBy: { version_number: 'desc' } });
    return tx.botVersion.create({ data: {
        bot_id: bot.id, version_number: (latest?.version_number || 0) + 1,
        environment, prompt_version: bot.prompt_version || '1',
        config: versionConfig(bot) as Prisma.InputJsonValue,
    } });
}

export async function ensurePublishedVersion(tx: Prisma.TransactionClient, bot: Bot) {
    const latest = await tx.botVersion.findFirst({ where: { bot_id: bot.id, environment: 'PROD' }, orderBy: { version_number: 'desc' } });
    if (latest && hasRuntimeSnapshot(latest.config)) return latest;
    // Freeze the actual legacy runtime before any draft edit. No schema migration.
    return appendVersion(tx, bot, 'PROD');
}

export async function getPublishedRuntimeBot(botId: string): Promise<Bot> {
    return prisma.$transaction(async (tx) => {
        const bot = await lockBot(tx, botId);
        if (!bot.published) return bot;
        const version = await ensurePublishedVersion(tx, bot);
        return { ...bot, ...readVersionSnapshot(version, bot) };
    });
}

export async function buildSessionRuntimeSnapshot(botId: string, options: { draft?: boolean } = {}): Promise<SessionRuntimeSnapshot> {
    const bot = options.draft ? await prisma.bot.findFirst({ where: { id: botId, deleted_at: null } }) : await getPublishedRuntimeBot(botId);
    if (!bot) throw new Error('Bot not found');
    const config = bot.config as Record<string, unknown>;
    const evaluatorId = typeof config.evaluator_bot_id === 'string' ? config.evaluator_bot_id : '';
    const evaluator = evaluatorId ? await getPublishedRuntimeBot(evaluatorId) : null;
    if (bot.published && !options.draft && evaluator && !evaluator.published) throw new Error('Publicá el evaluador antes de iniciar sesiones de este bot.');
    if (evaluator && evaluator.bot_type !== 'EVALUATOR') throw new Error('Assigned bot is not an evaluator');
    return { bot: snapshotBot(bot), evaluator: evaluator ? snapshotBot(evaluator) : null, captured_at: new Date().toISOString() };
}

export async function getSessionRuntimeSnapshot(sessionId: string, botId: string): Promise<SessionRuntimeSnapshot> {
    const session = await readRuntimeSession(sessionId);
    if (!session || session.bot_id !== botId) throw new Error('Session does not match bot');
    const metadata = toSessionMetadataObject(session.metadata);
    if (metadata.runtime_snapshot) return metadata.runtime_snapshot as SessionRuntimeSnapshot;
    const captured = { ...await buildSessionRuntimeSnapshot(botId), legacy: true };
    return (await mutateSessionMetadata<SessionRuntimeSnapshot>({ sessionId, mutate: (latest) => {
        const snapshot = (latest.runtime_snapshot || captured) as SessionRuntimeSnapshot;
        latest.runtime_snapshot = snapshot;
        return { metadata: latest, result: snapshot };
    } }))!;
}

export async function getRuntimeBot(botId: string, sessionId?: string): Promise<Bot> {
    if (!sessionId) return getPublishedRuntimeBot(botId);
    const current = await prisma.bot.findFirst({ where: { id: botId, deleted_at: null } });
    if (!current) throw new Error('Bot not found');
    const snapshot = await getSessionRuntimeSnapshot(sessionId, botId);
    return { ...current, ...snapshot.bot };
}
