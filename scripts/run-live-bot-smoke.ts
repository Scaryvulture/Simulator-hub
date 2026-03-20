import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

import prisma from '@/lib/prisma';
import { Director } from '@/lib/director';
import type { SessionCostScope } from '@prisma/client';

type BotRecord = {
    id: string;
    name: string;
    bot_type: string;
};

type TurnRecord = {
    turn: number;
    user: string;
    assistant_preview: string;
    ended: boolean;
    model_used: string | null;
};

type RunReport = {
    bot_id: string;
    bot_name: string;
    bot_type: string;
    run_index: number;
    plan_name: string;
    session_id: string;
    ended: boolean;
    truncated_by_turn_cap: boolean;
    turn_count: number;
    intro_present: boolean;
    tokens_in: number;
    tokens_out: number;
    message_cost_usd: number;
    audit_total_cost_usd: number;
    audit_scopes: Array<{ scope: SessionCostScope; cost_usd: number; model: string; provider: string | null }>;
    duration_ms: number;
    turn_trace: TurnRecord[];
    error: string | null;
};

type Plan = {
    name: string;
    prompts: string[];
};

const MAX_TURNS_PER_RUN = Number(process.env.SMOKE_MAX_TURNS || 4);
const DELETE_TEMP_SESSIONS = process.env.SMOKE_KEEP_SESSIONS === 'true' ? false : true;

const DEFAULT_FALLBACK_PROMPTS = [
    'Continuemos con una respuesta breve.',
    'Perfecto, seguí con el siguiente paso.',
    'Gracias, cerramos esta prueba.',
];

function plansForBotType(botType: string): Plan[] {
    const normalized = (botType || '').toUpperCase();

    if (normalized === 'DETECTOR') {
        return [
            {
                name: 'detector-mobile',
                prompts: ['comencemos', 'movil', 'con ruedas', 'finalizar'],
            },
            {
                name: 'detector-fixed',
                prompts: ['comencemos', 'fijo', 'anclado', 'finalizar'],
            },
        ];
    }

    if (normalized === 'EXAMINER') {
        return [
            {
                name: 'examiner-decline',
                prompts: ['comencemos', 'no'],
            },
            {
                name: 'examiner-short',
                prompts: ['comencemos', 'si', 'respuesta corta de prueba', 'no'],
            },
        ];
    }

    if (normalized === 'SIMULATOR') {
        return [
            {
                name: 'simulator-brief-a',
                prompts: ['Hola, iniciemos una practica breve.', 'Gracias, cerramos esta corrida.'],
            },
            {
                name: 'simulator-brief-b',
                prompts: ['Empecemos una interaccion de prueba.', 'Perfecto, finalicemos aqui.'],
            },
        ];
    }

    if (normalized === 'EVALUATOR') {
        return [
            {
                name: 'evaluator-chat-a',
                prompts: ['Hola, prueba de disponibilidad.', 'Gracias, fin de prueba.'],
            },
            {
                name: 'evaluator-chat-b',
                prompts: ['Inicia una corrida controlada.', 'Cerramos este test.'],
            },
        ];
    }

    return [
        {
            name: 'generic-a',
            prompts: ['Hola, prueba corta.', 'Gracias, cerramos esta corrida.'],
        },
        {
            name: 'generic-b',
            prompts: ['Iniciemos una validacion basica.', 'Finalicemos este test.'],
        },
    ];
}

function toErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

async function runSingleBotPlan(bot: BotRecord, runIndex: number, plan: Plan): Promise<RunReport> {
    const sessionId = crypto.randomUUID();
    const startedAt = Date.now();
    const turnTrace: TurnRecord[] = [];
    let ended = false;
    let error: string | null = null;
    let introPresent = false;

    await prisma.session.create({
        data: {
            id: sessionId,
            bot_id: bot.id,
            ended: false,
            metadata: {
                smoke_test: {
                    generated_at: new Date().toISOString(),
                    script: 'run-live-bot-smoke',
                    run_index: runIndex,
                    plan: plan.name,
                },
            },
        },
    });

    try {
        const init = await Director.initSession(sessionId, bot.id);
        introPresent = Boolean(init.introMessage && init.introMessage.trim());

        for (let turn = 0; turn < MAX_TURNS_PER_RUN; turn++) {
            if (ended) break;
            const userPrompt = plan.prompts[turn] || DEFAULT_FALLBACK_PROMPTS[turn % DEFAULT_FALLBACK_PROMPTS.length];
            const response = await Director.processMessage(sessionId, bot.id, userPrompt);
            ended = Boolean(response.ended);

            turnTrace.push({
                turn: turn + 1,
                user: userPrompt,
                assistant_preview: (response.content || '').slice(0, 220),
                ended,
                model_used: response.modelUsed || null,
            });
        }

        const [messages, audits] = await Promise.all([
            prisma.message.findMany({
                where: { session_id: sessionId },
                select: {
                    tokens_in: true,
                    tokens_out: true,
                    cost_usd: true,
                },
            }),
            prisma.sessionCostAudit.findMany({
                where: { session_id: sessionId },
                select: {
                    scope: true,
                    model: true,
                    provider: true,
                    cost_usd: true,
                },
            }),
        ]);

        const totals = messages.reduce((acc, message) => {
            return {
                tokensIn: acc.tokensIn + (message.tokens_in || 0),
                tokensOut: acc.tokensOut + (message.tokens_out || 0),
                costUsd: Number((acc.costUsd + (message.cost_usd || 0)).toFixed(6)),
            };
        }, { tokensIn: 0, tokensOut: 0, costUsd: 0 });

        const auditTotal = Number(audits.reduce((acc, row) => acc + (row.cost_usd || 0), 0).toFixed(6));

        return {
            bot_id: bot.id,
            bot_name: bot.name,
            bot_type: bot.bot_type,
            run_index: runIndex,
            plan_name: plan.name,
            session_id: sessionId,
            ended,
            truncated_by_turn_cap: !ended && turnTrace.length >= MAX_TURNS_PER_RUN,
            turn_count: turnTrace.length,
            intro_present: introPresent,
            tokens_in: totals.tokensIn,
            tokens_out: totals.tokensOut,
            message_cost_usd: totals.costUsd,
            audit_total_cost_usd: auditTotal,
            audit_scopes: audits.map((row) => ({
                scope: row.scope,
                cost_usd: row.cost_usd || 0,
                model: row.model,
                provider: row.provider,
            })),
            duration_ms: Date.now() - startedAt,
            turn_trace: turnTrace,
            error,
        };
    } catch (caught) {
        error = toErrorMessage(caught);
        return {
            bot_id: bot.id,
            bot_name: bot.name,
            bot_type: bot.bot_type,
            run_index: runIndex,
            plan_name: plan.name,
            session_id: sessionId,
            ended: false,
            truncated_by_turn_cap: false,
            turn_count: turnTrace.length,
            intro_present: introPresent,
            tokens_in: 0,
            tokens_out: 0,
            message_cost_usd: 0,
            audit_total_cost_usd: 0,
            audit_scopes: [],
            duration_ms: Date.now() - startedAt,
            turn_trace: turnTrace,
            error,
        };
    } finally {
        if (DELETE_TEMP_SESSIONS) {
            await prisma.session.delete({ where: { id: sessionId } }).catch(() => undefined);
        }
    }
}

async function main() {
    const bots = await prisma.bot.findMany({
        where: {
            published: true,
            api_key: { not: null },
        },
        select: {
            id: true,
            name: true,
            bot_type: true,
        },
        orderBy: [
            { bot_type: 'asc' },
            { name: 'asc' },
        ],
    });

    if (bots.length === 0) {
        console.log('No published bots with API key were found.');
        return;
    }

    const reports: RunReport[] = [];
    for (const bot of bots) {
        const plans = plansForBotType(bot.bot_type);
        for (let i = 0; i < 2; i++) {
            const plan = plans[i] || plans[plans.length - 1];
            const report = await runSingleBotPlan(bot, i + 1, plan);
            reports.push(report);
            const status = report.error
                ? `ERROR: ${report.error}`
                : `${report.ended ? 'ended' : 'open'} | turns=${report.turn_count} | msg_cost=$${report.message_cost_usd.toFixed(6)} | audit_cost=$${report.audit_total_cost_usd.toFixed(6)}`;
            console.log(`[${bot.bot_type}] ${bot.name} run ${i + 1} (${plan.name}) -> ${status}`);
        }
    }

    const totals = reports.reduce((acc, item) => {
        acc.runs += 1;
        if (!item.error) acc.success += 1;
        if (item.error) acc.errors += 1;
        if (item.ended) acc.ended += 1;
        if (item.truncated_by_turn_cap) acc.truncated += 1;
        acc.tokensIn += item.tokens_in;
        acc.tokensOut += item.tokens_out;
        acc.messageCostUsd = Number((acc.messageCostUsd + item.message_cost_usd).toFixed(6));
        acc.auditCostUsd = Number((acc.auditCostUsd + item.audit_total_cost_usd).toFixed(6));
        return acc;
    }, {
        runs: 0,
        success: 0,
        errors: 0,
        ended: 0,
        truncated: 0,
        tokensIn: 0,
        tokensOut: 0,
        messageCostUsd: 0,
        auditCostUsd: 0,
    });

    const reportPayload = {
        generated_at: new Date().toISOString(),
        max_turns_per_run: MAX_TURNS_PER_RUN,
        delete_temp_sessions: DELETE_TEMP_SESSIONS,
        bot_count: bots.length,
        totals,
        reports,
    };

    await mkdir('.tmp', { recursive: true });
    const outputPath = '.tmp/live-bot-smoke-report.json';
    await writeFile(outputPath, JSON.stringify(reportPayload, null, 2), 'utf8');

    console.log('\n=== SUMMARY ===');
    console.log(JSON.stringify({
        bot_count: bots.length,
        runs: totals.runs,
        success: totals.success,
        errors: totals.errors,
        ended: totals.ended,
        truncated: totals.truncated,
        tokens_in: totals.tokensIn,
        tokens_out: totals.tokensOut,
        message_cost_usd: totals.messageCostUsd,
        audit_cost_usd: totals.auditCostUsd,
        report_path: outputPath,
    }, null, 2));
}

main()
    .catch((error) => {
        console.error('run-live-bot-smoke failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
