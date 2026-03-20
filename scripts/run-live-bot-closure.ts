import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

import prisma from '@/lib/prisma';
import { Director } from '@/lib/director';
import type { SessionCostScope } from '@prisma/client';

type BotType = 'SIMULATOR' | 'EXAMINER' | 'EVALUATOR' | 'GENERIC' | 'DETECTOR' | string;

type BotRow = {
    id: string;
    name: string;
    bot_type: BotType;
    config: unknown;
};

type TurnTrace = {
    turn: number;
    user: string;
    assistant_preview: string;
    ended: boolean;
    model_used: string | null;
};

type RunReport = {
    bot_id: string;
    bot_name: string;
    bot_type: BotType;
    session_id: string;
    ended: boolean;
    stopped_reason: 'ended' | 'turn_cap' | 'budget_guard' | 'error';
    turn_count: number;
    intro_present: boolean;
    tokens_in: number;
    tokens_out: number;
    message_cost_usd: number;
    audit_total_cost_usd: number;
    audit_scopes: Array<{ scope: SessionCostScope; model: string; provider: string | null; cost_usd: number }>;
    duration_ms: number;
    turn_trace: TurnTrace[];
    error: string | null;
};

type Totals = {
    runs: number;
    success: number;
    errors: number;
    ended: number;
    tokens_in: number;
    tokens_out: number;
    message_cost_usd: number;
    audit_cost_usd: number;
};

const MAX_TOTAL_TOKENS_IN = Number(process.env.CLOSURE_MAX_TOTAL_TOKENS_IN || 100_000);
const MAX_TOTAL_COST_USD = Number(process.env.CLOSURE_MAX_TOTAL_COST_USD || 2);
const MAX_TURNS_PER_BOT = Number(process.env.CLOSURE_MAX_TURNS_PER_BOT || 12);
const DELETE_TEMP_SESSIONS = process.env.CLOSURE_KEEP_SESSIONS === 'true' ? false : true;
const SKIP_DETECTOR = true;

const GENERIC_SIM_OPENERS = [
    'Sí, iniciemos la práctica.',
    'Dale, empecemos ahora.',
];

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

function extractTopicsFromConfig(config: unknown): string[] {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return [];
    const cfg = config as Record<string, unknown>;
    const qb = (cfg.question_bank && typeof cfg.question_bank === 'object' && !Array.isArray(cfg.question_bank))
        ? cfg.question_bank as Record<string, unknown>
        : null;
    const topics = Array.isArray(qb?.topics) ? qb?.topics : [];

    return topics
        .map((item) => typeof item === 'string'
            ? item.trim()
            : (item && typeof item === 'object' && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === 'string')
                ? ((item as Record<string, unknown>).id as string).trim()
                : '')
        .filter(Boolean);
}

function pickExaminerTaskPhrase(botName: string, topics: string[]): string {
    const normalizedName = normalizeText(botName);
    const normalizedTopics = topics.map((topic) => normalizeText(topic));

    if (normalizedTopics.includes('movil')) {
        return 'voy a pintar un techo en una planta usando andamio movil';
    }
    if (normalizedTopics.includes('fijo')) {
        return 'voy a pintar un techo en una planta usando andamio fijo';
    }
    if (normalizedTopics.includes('1/2 oficial civil')) {
        return 'voy a cortar un caño en profundidad en una Estación de servicio como 1/2 Oficial Civil';
    }
    if (normalizedName.includes('logistica')) {
        return 'voy a cortar un caño en profundidad en una Estación de servicio';
    }

    if (topics.length > 0) {
        return `la tarea es ${topics[0]} en una planta`;
    }
    return 'voy a cortar un caño en profundidad en una Estación de servicio';
}

function nextMessageForExaminer(params: {
    bot: BotRow;
    topics: string[];
    turn: number;
    lastAssistant: string;
}): string {
    const { bot, topics, turn, lastAssistant } = params;
    const normalizedAssistant = normalizeText(lastAssistant);
    const topicPhrase = pickExaminerTaskPhrase(bot.name, topics);

    if (turn === 1) return 'sí';
    if (normalizedAssistant.includes('que tarea') || normalizedAssistant.includes('que tipo de andamio') || normalizedAssistant.includes('tema')) {
        return topicPhrase;
    }
    if (normalizedAssistant.includes('es correcto') || normalizedAssistant.includes('confirmas')) {
        return 'sí';
    }
    if (
        normalizedAssistant.includes('seguimos') ||
        normalizedAssistant.includes('continuar') ||
        normalizedAssistant.includes('continuamos') ||
        normalizedAssistant.includes('si o por no') ||
        normalizedAssistant.includes('si o no')
    ) {
        return 'no';
    }
    if (normalizedAssistant.includes('alguna duda') || normalizedAssistant.includes('queres preguntar algo mas')) {
        return 'no';
    }

    // Try to provide a concise answer to move state forward, then request close on next turn.
    if (turn <= 4) {
        return 'Reviso EPP, permisos, estado del andamio y condiciones del terreno antes de empezar.';
    }
    return 'no, quiero finalizar el examen';
}

function nextMessageForSimulatorOrEvaluator(turn: number, lastAssistant: string): string {
    const normalizedAssistant = normalizeText(lastAssistant);

    if (turn === 1) {
        return GENERIC_SIM_OPENERS[turn % GENERIC_SIM_OPENERS.length];
    }
    if (turn === 2) {
        return 'Necesito una respuesta breve para cerrar esta práctica.';
    }
    if (
        normalizedAssistant.includes('deseas continuar') ||
        normalizedAssistant.includes('queres continuar') ||
        normalizedAssistant.includes('continuamos')
    ) {
        return 'no, finalicemos';
    }
    if (turn >= 3) {
        return 'no quiero continuar, finalicemos la sesión ahora';
    }
    return 'continuemos';
}

async function loadSessionTotals(sessionId: string): Promise<{
    tokensIn: number;
    tokensOut: number;
    messageCostUsd: number;
    auditTotalUsd: number;
    auditScopes: Array<{ scope: SessionCostScope; model: string; provider: string | null; cost_usd: number }>;
}> {
    const [messages, audits] = await Promise.all([
        prisma.message.findMany({
            where: { session_id: sessionId },
            select: { tokens_in: true, tokens_out: true, cost_usd: true },
        }),
        prisma.sessionCostAudit.findMany({
            where: { session_id: sessionId },
            select: { scope: true, model: true, provider: true, cost_usd: true },
        }),
    ]);

    const messageTotals = messages.reduce((acc, message) => {
        acc.tokensIn += message.tokens_in || 0;
        acc.tokensOut += message.tokens_out || 0;
        acc.costUsd = Number((acc.costUsd + (message.cost_usd || 0)).toFixed(6));
        return acc;
    }, { tokensIn: 0, tokensOut: 0, costUsd: 0 });

    const auditTotalUsd = Number(audits.reduce((acc, row) => acc + (row.cost_usd || 0), 0).toFixed(6));

    return {
        tokensIn: messageTotals.tokensIn,
        tokensOut: messageTotals.tokensOut,
        messageCostUsd: messageTotals.costUsd,
        auditTotalUsd,
        auditScopes: audits.map((row) => ({
            scope: row.scope,
            model: row.model,
            provider: row.provider,
            cost_usd: row.cost_usd || 0,
        })),
    };
}

async function runOneBot(bot: BotRow, globalTotals: Totals): Promise<RunReport> {
    const sessionId = crypto.randomUUID();
    const startedAt = Date.now();
    const trace: TurnTrace[] = [];
    let ended = false;
    let error: string | null = null;
    let introPresent = false;
    let stoppedReason: RunReport['stopped_reason'] = 'turn_cap';

    const topics = extractTopicsFromConfig(bot.config);

    await prisma.session.create({
        data: {
            id: sessionId,
            bot_id: bot.id,
            ended: false,
            metadata: {
                closure_smoke: {
                    generated_at: new Date().toISOString(),
                    script: 'run-live-bot-closure',
                },
            },
        },
    });

    try {
        const init = await Director.initSession(sessionId, bot.id);
        introPresent = Boolean(init.introMessage && init.introMessage.trim());

        let lastAssistant = init.introMessage || '';

        for (let turn = 1; turn <= MAX_TURNS_PER_BOT; turn++) {
            const currentProjectedCost = Number((globalTotals.audit_cost_usd).toFixed(6));
            const currentProjectedTokens = globalTotals.tokens_in;
            if (currentProjectedTokens >= MAX_TOTAL_TOKENS_IN || currentProjectedCost >= MAX_TOTAL_COST_USD) {
                stoppedReason = 'budget_guard';
                break;
            }

            let userMessage: string;
            if (bot.bot_type === 'EXAMINER') {
                userMessage = nextMessageForExaminer({ bot, topics, turn, lastAssistant });
            } else {
                userMessage = nextMessageForSimulatorOrEvaluator(turn, lastAssistant);
            }

            const response = await Director.processMessage(sessionId, bot.id, userMessage);
            lastAssistant = response.content || '';
            ended = Boolean(response.ended);

            trace.push({
                turn,
                user: userMessage,
                assistant_preview: lastAssistant.slice(0, 220),
                ended,
                model_used: response.modelUsed || null,
            });

            if (ended) {
                stoppedReason = 'ended';
                break;
            }
        }

        const totals = await loadSessionTotals(sessionId);

        return {
            bot_id: bot.id,
            bot_name: bot.name,
            bot_type: bot.bot_type,
            session_id: sessionId,
            ended,
            stopped_reason: stoppedReason,
            turn_count: trace.length,
            intro_present: introPresent,
            tokens_in: totals.tokensIn,
            tokens_out: totals.tokensOut,
            message_cost_usd: totals.messageCostUsd,
            audit_total_cost_usd: totals.auditTotalUsd,
            audit_scopes: totals.auditScopes,
            duration_ms: Date.now() - startedAt,
            turn_trace: trace,
            error,
        };
    } catch (caught) {
        error = toErrorMessage(caught);
        stoppedReason = 'error';
        const totals = await loadSessionTotals(sessionId);
        return {
            bot_id: bot.id,
            bot_name: bot.name,
            bot_type: bot.bot_type,
            session_id: sessionId,
            ended: false,
            stopped_reason: stoppedReason,
            turn_count: trace.length,
            intro_present: introPresent,
            tokens_in: totals.tokensIn,
            tokens_out: totals.tokensOut,
            message_cost_usd: totals.messageCostUsd,
            audit_total_cost_usd: totals.auditTotalUsd,
            audit_scopes: totals.auditScopes,
            duration_ms: Date.now() - startedAt,
            turn_trace: trace,
            error,
        };
    } finally {
        if (DELETE_TEMP_SESSIONS) {
            await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
        }
    }
}

function addToTotals(totals: Totals, run: RunReport): Totals {
    return {
        runs: totals.runs + 1,
        success: totals.success + (run.error ? 0 : 1),
        errors: totals.errors + (run.error ? 1 : 0),
        ended: totals.ended + (run.ended ? 1 : 0),
        tokens_in: totals.tokens_in + run.tokens_in,
        tokens_out: totals.tokens_out + run.tokens_out,
        message_cost_usd: Number((totals.message_cost_usd + run.message_cost_usd).toFixed(6)),
        audit_cost_usd: Number((totals.audit_cost_usd + run.audit_total_cost_usd).toFixed(6)),
    };
}

async function main() {
    const whereClause = SKIP_DETECTOR
        ? {
            published: true,
            api_key: { not: null as unknown as null },
            NOT: { bot_type: 'DETECTOR' },
        }
        : {
            published: true,
            api_key: { not: null as unknown as null },
        };

    const bots = await prisma.bot.findMany({
        where: whereClause,
        select: {
            id: true,
            name: true,
            bot_type: true,
            config: true,
        },
        orderBy: [{ bot_type: 'asc' }, { name: 'asc' }],
    }) as BotRow[];

    if (bots.length === 0) {
        console.log('No bots found for closure smoke run.');
        return;
    }

    const reports: RunReport[] = [];
    let totals: Totals = {
        runs: 0,
        success: 0,
        errors: 0,
        ended: 0,
        tokens_in: 0,
        tokens_out: 0,
        message_cost_usd: 0,
        audit_cost_usd: 0,
    };

    for (const bot of bots) {
        if (totals.tokens_in >= MAX_TOTAL_TOKENS_IN || totals.audit_cost_usd >= MAX_TOTAL_COST_USD) {
            console.log(`[STOP] Global budget reached before bot ${bot.name}.`);
            break;
        }

        const run = await runOneBot(bot, totals);
        reports.push(run);
        totals = addToTotals(totals, run);

        const status = run.error
            ? `ERROR: ${run.error}`
            : `${run.stopped_reason} | ended=${run.ended} | turns=${run.turn_count} | in=${run.tokens_in} | audit=$${run.audit_total_cost_usd.toFixed(6)}`;
        console.log(`[${bot.bot_type}] ${bot.name} -> ${status}`);
    }

    const payload = {
        generated_at: new Date().toISOString(),
        constraints: {
            max_total_tokens_in: MAX_TOTAL_TOKENS_IN,
            max_total_cost_usd: MAX_TOTAL_COST_USD,
            max_turns_per_bot: MAX_TURNS_PER_BOT,
            skip_detector: SKIP_DETECTOR,
            delete_temp_sessions: DELETE_TEMP_SESSIONS,
        },
        bot_count_targeted: bots.length,
        totals,
        reports,
    };

    await mkdir('.tmp', { recursive: true });
    const reportPath = '.tmp/live-bot-closure-report.json';
    await writeFile(reportPath, JSON.stringify(payload, null, 2), 'utf8');

    console.log('\n=== CLOSURE SUMMARY ===');
    console.log(JSON.stringify({
        bot_count_targeted: bots.length,
        runs: totals.runs,
        success: totals.success,
        errors: totals.errors,
        ended: totals.ended,
        tokens_in: totals.tokens_in,
        tokens_out: totals.tokens_out,
        message_cost_usd: totals.message_cost_usd,
        audit_cost_usd: totals.audit_cost_usd,
        report_path: reportPath,
    }, null, 2));
}

main()
    .catch((error) => {
        console.error('run-live-bot-closure failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
