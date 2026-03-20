'use server';

import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/auth-utils';
import { revalidatePath } from 'next/cache';
import {
    buildQaRunSnapshot,
    generateTemplateCases,
    normalizeGateConfig,
    normalizeRunConfig,
    processQaRunBatch,
    qaDefaults,
} from '@/lib/qa-lab';
import { syncQaRunToOpenAIEvals } from '@/lib/qa-lab-evals';
import {
    getQaLabEvalsUiConfig,
    updateQaLabEvalsUiConfig,
} from '@/lib/qa-lab-config';
import type { Prisma, QaCaseCategory, QaJudgeMode, QaRunStatus, QaSeverity } from '@prisma/client';

type DashboardFilters = {
    suiteId?: string;
    botId?: string;
    status?: QaRunStatus | 'ALL';
    limit?: number;
};

function toIso(value: Date | null): string | null {
    return value ? value.toISOString() : null;
}

function safeJson(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
}

type EvalSyncRunArtifactPayload = {
    eval_id?: unknown;
    eval_run_id?: unknown;
    report_url?: unknown;
    synced_at?: unknown;
};

type EvalSyncErrorArtifactPayload = {
    error?: unknown;
    failed_at?: unknown;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function parseEvalSyncRunPayload(payload: string): {
    eval_id?: string;
    eval_run_id?: string;
    report_url?: string;
    synced_at?: string;
} | null {
    const parsed = parseJsonObject(payload) as EvalSyncRunArtifactPayload | null;
    if (!parsed) return null;

    const evalId = typeof parsed.eval_id === 'string' && parsed.eval_id.trim() ? parsed.eval_id.trim() : '';
    const evalRunId = typeof parsed.eval_run_id === 'string' && parsed.eval_run_id.trim() ? parsed.eval_run_id.trim() : '';
    if (!evalId || !evalRunId) return null;

    const reportUrl = typeof parsed.report_url === 'string' && parsed.report_url.trim()
        ? parsed.report_url.trim()
        : undefined;
    const syncedAt = typeof parsed.synced_at === 'string' && parsed.synced_at.trim()
        ? parsed.synced_at.trim()
        : undefined;

    return {
        eval_id: evalId,
        eval_run_id: evalRunId,
        ...(reportUrl ? { report_url: reportUrl } : {}),
        ...(syncedAt ? { synced_at: syncedAt } : {}),
    };
}

function parseEvalSyncErrorPayload(payload: string): {
    error: string;
    failed_at?: string;
} | null {
    const parsed = parseJsonObject(payload) as EvalSyncErrorArtifactPayload | null;
    if (!parsed) return null;

    const error = typeof parsed.error === 'string' && parsed.error.trim() ? parsed.error.trim() : '';
    if (!error) return null;
    const failedAt = typeof parsed.failed_at === 'string' && parsed.failed_at.trim()
        ? parsed.failed_at.trim()
        : undefined;

    return {
        error,
        ...(failedAt ? { failed_at: failedAt } : {}),
    };
}

export async function getQaLabEvalsConfig() {
    await verifyAdmin();
    return getQaLabEvalsUiConfig();
}

export async function updateQaLabEvalsConfig(params: {
    enabled: boolean;
    autoCreate: boolean;
    namePrefix: string;
    evalId?: string | null;
    apiKey?: string;
    apiKeyAction: 'keep' | 'set' | 'clear';
}) {
    await verifyAdmin();
    const updated = await updateQaLabEvalsUiConfig(params);
    revalidatePath('/admin/qa-lab');
    return updated;
}

async function markQaRunFailed(runId: string, message: string) {
    await prisma.qaRun.updateMany({
        where: {
            id: runId,
            status: {
                in: ['PENDING', 'RUNNING'],
            },
        },
        data: {
            status: 'FAILED',
            gate_status: 'FAILED',
            error_message: message,
            completed_at: new Date(),
        },
    });
}

export async function getQaLabDashboard(filters: DashboardFilters = {}) {
    await verifyAdmin();
    const limit = Math.max(10, Math.min(filters.limit || 30, 100));

    const runWhere: Prisma.QaRunWhereInput = {};
    if (filters.suiteId) runWhere.suite_id = filters.suiteId;
    if (filters.botId) runWhere.bot_id = filters.botId;
    if (filters.status && filters.status !== 'ALL') runWhere.status = filters.status;

    const [bots, suites, runs] = await Promise.all([
        prisma.bot.findMany({
            where: { deleted_at: null },
            select: {
                id: true,
                name: true,
                bot_type: true,
                published: true,
            },
            orderBy: { name: 'asc' },
        }),
        prisma.qaSuite.findMany({
            include: {
                _count: {
                    select: {
                        cases: true,
                        runs: true,
                    },
                },
            },
            orderBy: { updated_at: 'desc' },
        }),
        prisma.qaRun.findMany({
            where: runWhere,
            include: {
                suite: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                bot: {
                    select: {
                        id: true,
                        name: true,
                        bot_type: true,
                    },
                },
                creator: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
                _count: {
                    select: {
                        results: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
            take: limit,
        }),
    ]);

    return {
        bots,
        suites: suites.map((suite) => ({
            ...suite,
            gate_config: normalizeGateConfig(safeJson(suite.gate_config)),
            run_config: normalizeRunConfig(safeJson(suite.run_config), normalizeGateConfig(safeJson(suite.gate_config))),
            created_at: toIso(suite.created_at),
            updated_at: toIso(suite.updated_at),
        })),
        runs: runs.map((run) => ({
            ...run,
            created_at: toIso(run.created_at),
            updated_at: toIso(run.updated_at),
            started_at: toIso(run.started_at),
            completed_at: toIso(run.completed_at),
        })),
    };
}

export async function getQaSuiteDetail(suiteId: string) {
    await verifyAdmin();
    const suite = await prisma.qaSuite.findUnique({
        where: { id: suiteId },
        include: {
            cases: {
                orderBy: [
                    { category: 'asc' },
                    { severity: 'desc' },
                    { created_at: 'asc' },
                ],
            },
            _count: {
                select: {
                    runs: true,
                },
            },
        },
    });
    if (!suite) return null;

    return {
        ...suite,
        gate_config: normalizeGateConfig(safeJson(suite.gate_config)),
        run_config: normalizeRunConfig(safeJson(suite.run_config), normalizeGateConfig(safeJson(suite.gate_config))),
        created_at: toIso(suite.created_at),
        updated_at: toIso(suite.updated_at),
        cases: suite.cases.map((qaCase) => ({
            ...qaCase,
            created_at: toIso(qaCase.created_at),
            updated_at: toIso(qaCase.updated_at),
        })),
    };
}

export async function createQaSuite(params?: {
    name?: string;
    description?: string;
    botTypeScope?: string;
}) {
    const currentUser = await verifyAdmin();
    const suite = await prisma.qaSuite.create({
        data: {
            name: params?.name?.trim() || `QA Suite ${new Date().toLocaleDateString('en-CA')}`,
            description: params?.description?.trim() || 'Suite base para validación funcional, seguridad y regresión.',
            bot_type_scope: params?.botTypeScope?.trim() || null,
            gate_config: toJsonInput(qaDefaults.gateConfig),
            run_config: toJsonInput(qaDefaults.runConfig),
            created_by: currentUser.userId,
        },
    });
    revalidatePath('/admin/qa-lab');
    return suite;
}

export async function createQaTemplateSuite150(params?: {
    name?: string;
    description?: string;
    botTypeScope?: string;
    caseCount?: number;
}) {
    const currentUser = await verifyAdmin();
    const normalizedCount = Math.max(1, Math.min(params?.caseCount ?? 150, 1000));
    const cases = generateTemplateCases(normalizedCount);

    const suite = await prisma.$transaction(async (tx) => {
        const createdSuite = await tx.qaSuite.create({
            data: {
                name: params?.name?.trim() || `Suite ${normalizedCount} tests ${new Date().toLocaleDateString('en-CA')}`,
                description: params?.description?.trim() || `Plantilla con ${normalizedCount} casos (funcional, borde, seguridad, regresión).`,
                bot_type_scope: params?.botTypeScope?.trim() || null,
                gate_config: toJsonInput(qaDefaults.gateConfig),
                run_config: toJsonInput(qaDefaults.runConfig),
                created_by: currentUser.userId,
            },
        });

        await tx.qaCase.createMany({
            data: cases.map((qaCase) => ({
                suite_id: createdSuite.id,
                name: qaCase.name,
                description: qaCase.description || null,
                category: qaCase.category,
                severity: qaCase.severity,
                enabled: qaCase.enabled,
                input_messages: toJsonInput(qaCase.input_messages),
                expected_rules: toJsonInput(qaCase.expected_rules),
                judge_mode: qaCase.judge_mode,
                judge_prompt: qaCase.judge_prompt,
                repeat_count: qaCase.repeat_count,
                max_retries: qaCase.max_retries,
                tags: toJsonInput(qaCase.tags || []),
            })),
        });

        return createdSuite;
    });

    revalidatePath('/admin/qa-lab');
    return suite;
}

export async function updateQaSuite(params: {
    suiteId: string;
    name?: string;
    description?: string;
    botTypeScope?: string | null;
    enabled?: boolean;
    gateConfig?: Record<string, unknown>;
    runConfig?: Record<string, unknown>;
}) {
    await verifyAdmin();
    const suite = await prisma.qaSuite.findUnique({
        where: { id: params.suiteId },
    });
    if (!suite) throw new Error('QA suite not found.');

    const gateConfig = normalizeGateConfig(params.gateConfig || suite.gate_config);
    const runConfig = normalizeRunConfig(params.runConfig || suite.run_config, gateConfig);

    const updated = await prisma.qaSuite.update({
        where: { id: params.suiteId },
        data: {
            name: params.name?.trim() || suite.name,
            description: params.description?.trim() || suite.description,
            bot_type_scope: params.botTypeScope === undefined ? suite.bot_type_scope : (params.botTypeScope || null),
            enabled: params.enabled === undefined ? suite.enabled : Boolean(params.enabled),
            gate_config: toJsonInput(gateConfig),
            run_config: toJsonInput(runConfig),
        },
    });

    revalidatePath('/admin/qa-lab');
    return updated;
}

export async function deleteQaSuite(suiteId: string) {
    await verifyAdmin();
    await prisma.qaSuite.delete({
        where: { id: suiteId },
    });
    revalidatePath('/admin/qa-lab');
}

export async function createQaCase(params: {
    suiteId: string;
    name?: string;
    description?: string;
    category?: QaCaseCategory;
    severity?: QaSeverity;
    inputMessages?: string[];
    expectedRules?: Record<string, unknown>;
    judgeMode?: QaJudgeMode;
    judgePrompt?: string;
    repeatCount?: number;
    maxRetries?: number;
    enabled?: boolean;
    tags?: string[];
}) {
    await verifyAdmin();
    const suite = await prisma.qaSuite.findUnique({
        where: { id: params.suiteId },
    });
    if (!suite) throw new Error('QA suite not found.');

    const qaCase = await prisma.qaCase.create({
        data: {
            suite_id: params.suiteId,
            name: params.name?.trim() || `Case ${new Date().toISOString()}`,
            description: params.description?.trim() || null,
            category: params.category || 'FUNCTIONAL',
            severity: params.severity || 'MEDIUM',
            enabled: params.enabled === undefined ? true : Boolean(params.enabled),
            input_messages: params.inputMessages && params.inputMessages.length > 0
                ? params.inputMessages
                : ['Describe una solución clara y segura para este caso.'],
            expected_rules: toJsonInput(params.expectedRules || {
                required_substrings: [],
                forbidden_substrings: [],
                max_latency_ms: 12_000,
                max_response_chars: 6_000,
                security_checks: {
                    detect_prompt_leak: true,
                    detect_secret_leak: true,
                    blocklist_patterns: [],
                },
            }),
            judge_mode: params.judgeMode || 'DETERMINISTIC',
            judge_prompt: params.judgePrompt?.trim() || null,
            repeat_count: Math.max(1, Math.min(params.repeatCount || 1, 5)),
            max_retries: Math.max(0, Math.min(params.maxRetries || 2, 6)),
            tags: params.tags || [],
        },
    });

    revalidatePath('/admin/qa-lab');
    return qaCase;
}

export async function updateQaCase(params: {
    caseId: string;
    name?: string;
    description?: string | null;
    category?: QaCaseCategory;
    severity?: QaSeverity;
    inputMessages?: string[];
    expectedRules?: Record<string, unknown>;
    judgeMode?: QaJudgeMode;
    judgePrompt?: string | null;
    repeatCount?: number;
    maxRetries?: number;
    enabled?: boolean;
    tags?: string[];
}) {
    await verifyAdmin();
    const existing = await prisma.qaCase.findUnique({
        where: { id: params.caseId },
    });
    if (!existing) throw new Error('QA case not found.');

    const updated = await prisma.qaCase.update({
        where: { id: params.caseId },
        data: {
            name: params.name?.trim() || existing.name,
            description: params.description === undefined ? existing.description : (params.description || null),
            category: params.category || existing.category,
            severity: params.severity || existing.severity,
            enabled: params.enabled === undefined ? existing.enabled : Boolean(params.enabled),
            input_messages: toJsonInput(params.inputMessages && params.inputMessages.length > 0 ? params.inputMessages : (existing.input_messages || [])),
            expected_rules: toJsonInput(params.expectedRules || existing.expected_rules || {}),
            judge_mode: params.judgeMode || existing.judge_mode,
            judge_prompt: params.judgePrompt === undefined ? existing.judge_prompt : (params.judgePrompt || null),
            repeat_count: params.repeatCount === undefined ? existing.repeat_count : Math.max(1, Math.min(params.repeatCount, 5)),
            max_retries: params.maxRetries === undefined ? existing.max_retries : Math.max(0, Math.min(params.maxRetries, 6)),
            tags: params.tags || existing.tags || [],
        },
    });

    revalidatePath('/admin/qa-lab');
    return updated;
}

export async function deleteQaCase(caseId: string) {
    await verifyAdmin();
    await prisma.qaCase.delete({
        where: { id: caseId },
    });
    revalidatePath('/admin/qa-lab');
}

export async function startQaRun(params: {
    suiteId: string;
    botId: string;
}) {
    const currentUser = await verifyAdmin();

    const [suite, bot] = await Promise.all([
        prisma.qaSuite.findUnique({
            where: { id: params.suiteId },
            include: {
                cases: {
                    where: { enabled: true },
                },
            },
        }),
        prisma.bot.findUnique({
            where: { id: params.botId },
            select: {
                id: true,
                name: true,
                bot_type: true,
                published: true,
                api_key: true,
                deleted_at: true,
            },
        }),
    ]);

    if (!suite) throw new Error('QA suite not found.');
    if (!bot || bot.deleted_at) throw new Error('Bot not found.');
    if (!bot.api_key) throw new Error('The selected bot has no API key configured.');
    if (suite.cases.length === 0) throw new Error('The suite has no enabled test cases.');
    if (suite.bot_type_scope && suite.bot_type_scope !== bot.bot_type) {
        throw new Error(`Suite scoped to ${suite.bot_type_scope}, but bot is ${bot.bot_type}.`);
    }

    const snapshot = await buildQaRunSnapshot({
        botId: bot.id,
        suiteId: suite.id,
        cases: suite.cases.map((qaCase) => ({
            id: qaCase.id,
            name: qaCase.name,
            category: qaCase.category,
            severity: qaCase.severity,
            input_messages: qaCase.input_messages,
            expected_rules: qaCase.expected_rules,
            judge_mode: qaCase.judge_mode,
            judge_prompt: qaCase.judge_prompt,
            repeat_count: qaCase.repeat_count,
            max_retries: qaCase.max_retries,
        })),
    });

    const run = await prisma.$transaction(async (tx) => {
        const createdRun = await tx.qaRun.create({
            data: {
                suite_id: suite.id,
                bot_id: bot.id,
                created_by: currentUser.userId,
                status: 'PENDING',
                gate_status: 'PENDING',
                config_snapshot: toJsonInput(snapshot),
                summary: toJsonInput({
                    total_cases: suite.cases.length,
                    processed_cases: 0,
                    pass_count: 0,
                    fail_count: 0,
                    error_count: 0,
                    skipped_count: 0,
                    pass_rate: 0,
                    critical_failures: 0,
                    security_findings: 0,
                    avg_latency_ms: 0,
                    total_cost_usd: 0,
                }),
            },
        });

        await tx.qaResult.createMany({
            data: suite.cases.map((qaCase) => ({
                run_id: createdRun.id,
                case_id: qaCase.id,
                status: 'PENDING',
            })),
        });

        return createdRun;
    });

    revalidatePath('/admin/qa-lab');
    return {
        runId: run.id,
        status: run.status,
    };
}

export async function processQaRun(params: {
    runId: string;
}) {
    await verifyAdmin();
    try {
        const result = await processQaRunBatch({
            runId: params.runId,
        });

        const isTerminal = result.status === 'COMPLETED' || result.status === 'FAILED' || result.status === 'CANCELLED';
        const evalSync = isTerminal ? await syncQaRunToOpenAIEvals(params.runId) : null;

        revalidatePath('/admin/qa-lab');
        return {
            ...result,
            eval_sync: evalSync,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unhandled QA run processing error';
        await markQaRunFailed(params.runId, message);
        revalidatePath('/admin/qa-lab');
        throw error;
    }
}

export async function processQaRunToCompletion(params: {
    runId: string;
    maxBatches?: number;
}) {
    await verifyAdmin();
    const maxBatches = Math.max(1, Math.min(params.maxBatches ?? 200, 1000));

    try {
        let iterations = 0;
        let lastResult = await processQaRunBatch({ runId: params.runId });
        iterations += 1;
        let stoppedByBatchCap = false;

        for (; iterations < maxBatches; iterations++) {
            const isTerminal = lastResult.status === 'COMPLETED' || lastResult.status === 'FAILED' || lastResult.status === 'CANCELLED';
            const noProgress = lastResult.remaining <= 0 && lastResult.processedNow === 0;
            if (isTerminal || noProgress) break;
            lastResult = await processQaRunBatch({ runId: params.runId });
        }

        if (iterations >= maxBatches) {
            const isTerminal = lastResult.status === 'COMPLETED' || lastResult.status === 'FAILED' || lastResult.status === 'CANCELLED';
            const noProgress = lastResult.remaining <= 0 && lastResult.processedNow === 0;
            stoppedByBatchCap = !isTerminal && !noProgress;
        }

        const isTerminal = lastResult.status === 'COMPLETED' || lastResult.status === 'FAILED' || lastResult.status === 'CANCELLED';
        const evalSync = isTerminal ? await syncQaRunToOpenAIEvals(params.runId) : null;

        revalidatePath('/admin/qa-lab');
        return {
            ...lastResult,
            iterations,
            exhausted_max_batches: stoppedByBatchCap,
            eval_sync: evalSync,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unhandled QA run processing error';
        await markQaRunFailed(params.runId, message);
        revalidatePath('/admin/qa-lab');
        throw error;
    }
}

export async function cancelQaRun(runId: string) {
    await verifyAdmin();
    const run = await prisma.qaRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error('Run not found.');
    if (run.status === 'COMPLETED' || run.status === 'FAILED' || run.status === 'CANCELLED') {
        return run;
    }

    await prisma.$transaction(async (tx) => {
        await tx.qaResult.updateMany({
            where: {
                run_id: run.id,
                OR: [{ status: 'PENDING' }, { status: 'RUNNING' }],
            },
            data: {
                status: 'SKIPPED',
                error_message: 'Run cancelled by admin.',
            },
        });

        await tx.qaRun.update({
            where: { id: run.id },
            data: {
                status: 'CANCELLED',
                gate_status: 'FAILED',
                completed_at: new Date(),
                error_message: 'Run cancelled by admin.',
            },
        });
    });

    revalidatePath('/admin/qa-lab');
}

export async function getQaRunDetail(runId: string) {
    await verifyAdmin();
    const run = await prisma.qaRun.findUnique({
        where: { id: runId },
        include: {
            suite: {
                select: {
                    id: true,
                    name: true,
                },
            },
            bot: {
                select: {
                    id: true,
                    name: true,
                    bot_type: true,
                },
            },
            creator: {
                select: {
                    id: true,
                    username: true,
                },
            },
            results: {
                select: {
                    id: true,
                    status: true,
                    passed: true,
                    score: true,
                    latency_ms: true,
                    tokens_in: true,
                    tokens_out: true,
                    cost_usd: true,
                    response_excerpt: true,
                    error_message: true,
                    security_findings: true,
                    eval_details: true,
                    created_at: true,
                    updated_at: true,
                    case: {
                        select: {
                            id: true,
                            name: true,
                            category: true,
                            severity: true,
                            created_at: true,
                            updated_at: true,
                        },
                    },
                },
                orderBy: [{ status: 'asc' }, { updated_at: 'desc' }],
            },
            artifacts: {
                select: {
                    id: true,
                    format: true,
                    created_at: true,
                },
                orderBy: { created_at: 'desc' },
                take: 20,
            },
        },
    });
    if (!run) return null;

    const evalArtifacts = await prisma.qaArtifact.findMany({
        where: {
            run_id: run.id,
            format: {
                in: ['openai-evals-run', 'openai-evals-sync-error'],
            },
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: {
            format: true,
            payload: true,
            created_at: true,
        },
    });

    let evalSync: Record<string, unknown> = { status: 'none' };
    for (const artifact of evalArtifacts) {
        if (artifact.format === 'openai-evals-run') {
            const parsed = parseEvalSyncRunPayload(artifact.payload);
            if (!parsed) continue;
            evalSync = {
                status: 'synced',
                ...parsed,
                updated_at: toIso(artifact.created_at),
            };
            break;
        }

        if (artifact.format === 'openai-evals-sync-error') {
            const parsed = parseEvalSyncErrorPayload(artifact.payload);
            if (!parsed) continue;
            evalSync = {
                status: 'error',
                ...parsed,
                updated_at: toIso(artifact.created_at),
            };
            break;
        }
    }

    return {
        ...run,
        created_at: toIso(run.created_at),
        updated_at: toIso(run.updated_at),
        started_at: toIso(run.started_at),
        completed_at: toIso(run.completed_at),
        results: run.results.map((result) => ({
            ...result,
            created_at: toIso(result.created_at),
            updated_at: toIso(result.updated_at),
            case: {
                ...result.case,
                created_at: toIso(result.case.created_at),
                updated_at: toIso(result.case.updated_at),
            },
        })),
        artifacts: run.artifacts.map((artifact) => ({
            ...artifact,
            created_at: toIso(artifact.created_at),
        })),
        eval_sync: evalSync,
    };
}
