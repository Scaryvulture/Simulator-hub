import * as dotenv from 'dotenv';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

type ChatRow = {
    scope: 'CHAT';
    model: string;
    provider: string | null;
    tokens_in: number;
    tokens_out: number;
    estimated_tokens: number;
    messages: number;
    events: number;
    cost_usd: number;
};

type TtsRow = {
    scope: 'TTS';
    model: string;
    provider: string | null;
    tokens_in: number;
    tokens_out: number;
    estimated_tokens: number;
    messages: number;
    events: number;
    cost_usd: number;
};

type EvaluationRow = {
    scope: 'EVALUATION';
    model: string;
    provider: string | null;
    tokens_in: number;
    tokens_out: number;
    estimated_tokens: number;
    messages: number;
    events: number;
    cost_usd: number;
};

type AuditRow = ChatRow | TtsRow | EvaluationRow;

type BackfillSession = {
    id: string;
    metadata: Prisma.JsonValue | null;
    bot: {
        openai_prompt_id: string;
        config: Prisma.JsonValue;
    } | null;
    messages: Array<{ tokens_in: number | null; tokens_out: number | null; cost_usd: number | null }>;
};

function resolveDatabaseUrl(): string {
    const candidates = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(
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

    throw new Error('A valid DATABASE_URL or DIRECT_URL is required.');
}

function toObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function toNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeModel(value: unknown, fallback = 'unknown'): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function resolveSessionChatModel(sessionBot: BackfillSession['bot']): string {
    if (!sessionBot) return 'unknown';
    const configObject = toObject(sessionBot.config) || {};
    const configModel = typeof configObject.llm_model === 'string' ? configObject.llm_model.trim() : '';
    const rawPromptValue = typeof sessionBot.openai_prompt_id === 'string' ? sessionBot.openai_prompt_id.trim() : '';
    const legacyModel = rawPromptValue && !rawPromptValue.startsWith('pmpt_') ? rawPromptValue : '';
    return configModel || legacyModel || 'gpt-4o';
}

function resolveChatModelLabel(rawModelName: string, inferredModel: string): string {
    const normalized = normalizeModel(rawModelName);
    if (normalized.toLowerCase() === 'unknown') {
        return inferredModel;
    }
    return normalized;
}

function parseChatRowsFromMetadata(metadata: Record<string, unknown>, inferredModel: string): ChatRow[] {
    const source = toObject(metadata.chat_cost_by_model);
    if (!source) return [];

    const rows: ChatRow[] = [];
    for (const [modelName, rawEntry] of Object.entries(source)) {
        const entry = toObject(rawEntry);
        if (!entry) continue;
        const tokensIn = toNumber(entry.tokens_in);
        const tokensOut = toNumber(entry.tokens_out);
        const cost = toNumber(entry.cost_usd);
        const messages = toNumber(entry.messages);
        if (tokensIn === 0 && tokensOut === 0 && cost === 0 && messages === 0) continue;

        rows.push({
            scope: 'CHAT',
            model: resolveChatModelLabel(modelName, inferredModel),
            provider: null,
            tokens_in: Math.max(0, Math.trunc(tokensIn)),
            tokens_out: Math.max(0, Math.trunc(tokensOut)),
            estimated_tokens: 0,
            messages: Math.max(0, Math.trunc(messages)),
            events: 0,
            cost_usd: Number(Math.max(0, cost).toFixed(6)),
        });
    }
    return rows;
}

function parseTtsRowsFromMetadata(metadata: Record<string, unknown>): TtsRow[] {
    const rowsByModel = new Map<string, TtsRow>();
    const rawEvents = Array.isArray(metadata.voice_audit_events) ? metadata.voice_audit_events : [];

    for (const rawEvent of rawEvents) {
        const event = toObject(rawEvent);
        if (!event) continue;
        const channel = typeof event.channel === 'string' ? event.channel : '';
        if (!channel.includes('tts')) continue;

        const model = normalizeModel(event.model);
        const current = rowsByModel.get(model) || {
            scope: 'TTS',
            model,
            provider: null,
            tokens_in: 0,
            tokens_out: 0,
            estimated_tokens: 0,
            messages: 0,
            events: 0,
            cost_usd: 0,
        };
        current.estimated_tokens += Math.max(0, Math.trunc(toNumber(event.estimated_tokens)));
        current.events += 1;
        current.cost_usd = Number((current.cost_usd + Math.max(0, toNumber(event.cost_usd))).toFixed(6));
        rowsByModel.set(model, current);
    }

    const rows = Array.from(rowsByModel.values());
    if (rows.length > 0) return rows;

    const totals = toObject(metadata.voice_audit_totals);
    if (!totals) return [];
    const totalCost = Math.max(0, toNumber(totals.total_cost_usd));
    const totalTokens = Math.max(0, Math.trunc(toNumber(totals.total_estimated_tokens)));
    const totalEvents = Math.max(0, Math.trunc(toNumber(totals.events)));
    if (totalCost === 0 && totalTokens === 0 && totalEvents === 0) return [];

    return [{
        scope: 'TTS',
        model: 'voice-mixed',
        provider: null,
        tokens_in: 0,
        tokens_out: 0,
        estimated_tokens: totalTokens,
        messages: 0,
        events: totalEvents,
        cost_usd: Number(totalCost.toFixed(6)),
    }];
}

function parseEvaluationRowsFromMetadata(metadata: Record<string, unknown>): EvaluationRow[] {
    const row = toObject(metadata.evaluation_audit);
    if (!row) return [];

    const model = normalizeModel(row.model, '');
    if (!model) return [];

    const provider = typeof row.provider === 'string' && row.provider.trim()
        ? row.provider.trim()
        : null;
    const tokensIn = Math.max(0, Math.trunc(toNumber(row.tokens_in)));
    const tokensOut = Math.max(0, Math.trunc(toNumber(row.tokens_out)));
    const cost = Math.max(0, toNumber(row.cost_usd));

    if (tokensIn === 0 && tokensOut === 0 && cost === 0) return [];

    return [{
        scope: 'EVALUATION',
        model,
        provider,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        estimated_tokens: 0,
        messages: 0,
        events: 1,
        cost_usd: Number(cost.toFixed(6)),
    }];
}

function buildRowsForSession(session: BackfillSession): AuditRow[] {
    const metadata = toObject(session.metadata) || {};
    const rows: AuditRow[] = [];
    const inferredChatModel = resolveSessionChatModel(session.bot);

    const chatRows = parseChatRowsFromMetadata(metadata, inferredChatModel);
    if (chatRows.length > 0) {
        rows.push(...chatRows);
    } else {
        const aggregate = session.messages.reduce((acc, msg) => ({
            tokensIn: acc.tokensIn + (msg.tokens_in || 0),
            tokensOut: acc.tokensOut + (msg.tokens_out || 0),
            costUsd: acc.costUsd + (msg.cost_usd || 0),
            messages: acc.messages + 1,
        }), { tokensIn: 0, tokensOut: 0, costUsd: 0, messages: 0 });

        if (aggregate.tokensIn > 0 || aggregate.tokensOut > 0 || aggregate.costUsd > 0 || aggregate.messages > 0) {
            rows.push({
                scope: 'CHAT',
                model: inferredChatModel,
                provider: null,
                tokens_in: aggregate.tokensIn,
                tokens_out: aggregate.tokensOut,
                estimated_tokens: 0,
                messages: aggregate.messages,
                events: 0,
                cost_usd: Number(aggregate.costUsd.toFixed(6)),
            });
        }
    }

    rows.push(...parseTtsRowsFromMetadata(metadata));
    rows.push(...parseEvaluationRowsFromMetadata(metadata));

    return rows;
}

async function main() {
    const connectionString = resolveDatabaseUrl();
    const adapter = new PrismaPg({ connectionString });
    const prisma = new PrismaClient({ adapter });
    const batchSize = Number(process.env.BACKFILL_BATCH_SIZE || 200);

    let cursor: string | null = null;
    let processed = 0;
    let withRows = 0;
    let writtenRows = 0;

    console.log(`[backfill] starting with batch size=${batchSize}`);

    try {
        while (true) {
            const sessions: BackfillSession[] = await prisma.session.findMany({
                take: batchSize,
                ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
                orderBy: { id: 'asc' },
                select: {
                    id: true,
                    metadata: true,
                    bot: {
                        select: {
                            openai_prompt_id: true,
                            config: true,
                        },
                    },
                    messages: {
                        select: {
                            tokens_in: true,
                            tokens_out: true,
                            cost_usd: true,
                        },
                    },
                },
            });

            if (sessions.length === 0) break;

            for (const session of sessions) {
                const rows = buildRowsForSession(session);
                const chatAndTtsRows = rows.filter((row) => row.scope === 'CHAT' || row.scope === 'TTS');
                const evaluationRows = rows.filter((row) => row.scope === 'EVALUATION');
                await prisma.$transaction(async (tx) => {
                    await tx.sessionCostAudit.deleteMany({
                        where: {
                            session_id: session.id,
                            scope: { in: ['CHAT', 'TTS'] },
                        },
                    });
                    if (chatAndTtsRows.length > 0) {
                        await tx.sessionCostAudit.createMany({
                            data: chatAndTtsRows.map((row) => ({
                                session_id: session.id,
                                ...row,
                            })),
                        });
                    }
                    for (const row of evaluationRows) {
                        await tx.sessionCostAudit.upsert({
                            where: {
                                session_id_scope_model: {
                                    session_id: session.id,
                                    scope: row.scope,
                                    model: row.model,
                                },
                            },
                            create: {
                                session_id: session.id,
                                ...row,
                            },
                            update: {
                                provider: row.provider,
                                tokens_in: row.tokens_in,
                                tokens_out: row.tokens_out,
                                estimated_tokens: row.estimated_tokens,
                                messages: row.messages,
                                events: row.events,
                                cost_usd: row.cost_usd,
                            },
                        });
                    }
                });

                processed += 1;
                if (rows.length > 0) {
                    withRows += 1;
                    writtenRows += rows.length;
                }
            }

            cursor = sessions[sessions.length - 1]?.id || null;
            console.log(`[backfill] processed=${processed} sessions, rows=${writtenRows}`);
        }

        console.log('[backfill] done');
        console.log(`[backfill] sessions processed: ${processed}`);
        console.log(`[backfill] sessions with audit rows: ${withRows}`);
        console.log(`[backfill] total rows written: ${writtenRows}`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('[backfill] failed:', error);
    process.exit(1);
});
