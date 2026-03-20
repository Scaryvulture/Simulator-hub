import 'server-only';

import OpenAI from 'openai';
import { createOpenAIClient } from './ai-client';
import prisma from '@/lib/prisma';
import { getQaLabEvalsRuntimeConfig, type QaLabEvalsRuntimeConfig } from '@/lib/qa-lab-config';
import type { QaRunStatus } from '@prisma/client';

const EVAL_RUN_ARTIFACT_FORMAT = 'openai-evals-run';
const EVAL_ERROR_ARTIFACT_FORMAT = 'openai-evals-sync-error';
const MAX_ARTIFACTS_PER_RUN_FORMAT = 10;
const MAX_ARTIFACT_PAYLOAD_CHARS = 100_000;

type TerminalRunStatus = Extract<QaRunStatus, 'COMPLETED' | 'FAILED' | 'CANCELLED'>;

type EvalIdSource = 'env' | 'suite-artifact' | 'created';

type SyncRunArtifactPayload = {
    version: number;
    provider: 'openai-evals';
    synced_at: string;
    eval_id: string;
    eval_run_id: string;
    eval_run_status: string;
    report_url: string | null;
    eval_id_source: EvalIdSource;
    local_run: {
        run_id: string;
        suite_id: string;
        bot_id: string;
        status: string;
        gate_status: string;
        total_results: number;
    };
};

type SyncErrorArtifactPayload = {
    version: number;
    provider: 'openai-evals';
    failed_at: string;
    error: string;
    run_id: string;
};

export type QaRunEvalsSyncResult = {
    status: 'synced' | 'skipped' | 'error';
    reason?: string;
    evalId?: string;
    evalRunId?: string;
    reportUrl?: string;
};

function isTerminalStatus(status: QaRunStatus): status is TerminalRunStatus {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

function clampPayload(payload: string): string {
    if (payload.length <= MAX_ARTIFACT_PAYLOAD_CHARS) return payload;
    return `${payload.slice(0, MAX_ARTIFACT_PAYLOAD_CHARS)}\n...[truncated]`;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function extractEvalId(payload: string): string | null {
    const parsed = parseJsonObject(payload);
    const value = parsed?.eval_id;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractEvalRunId(payload: string): string | null {
    const parsed = parseJsonObject(payload);
    const value = parsed?.eval_run_id;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function extractReportUrl(payload: string): string | null {
    const parsed = parseJsonObject(payload);
    const value = parsed?.report_url;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toSecurityFindingsCount(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
}

function toSafeText(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
}

async function persistArtifact(runId: string, format: string, payload: Record<string, unknown>) {
    try {
        await prisma.$transaction(async (tx) => {
            await tx.qaArtifact.create({
                data: {
                    run_id: runId,
                    format,
                    payload: clampPayload(JSON.stringify(payload)),
                },
            });

            const stale = await tx.qaArtifact.findMany({
                where: { run_id: runId, format },
                orderBy: { created_at: 'desc' },
                skip: MAX_ARTIFACTS_PER_RUN_FORMAT,
                select: { id: true },
            });

            if (stale.length > 0) {
                await tx.qaArtifact.deleteMany({
                    where: { id: { in: stale.map((item) => item.id) } },
                });
            }
        });
    } catch (error: unknown) {
        console.error('QA Evals artifact persistence failed:', error);
    }
}

async function findExistingRunSync(runId: string): Promise<{
    evalId: string;
    evalRunId: string;
    reportUrl?: string;
} | null> {
    const artifacts = await prisma.qaArtifact.findMany({
        where: {
            run_id: runId,
            format: EVAL_RUN_ARTIFACT_FORMAT,
        },
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { payload: true },
    });

    for (const artifact of artifacts) {
        const evalId = extractEvalId(artifact.payload);
        const evalRunId = extractEvalRunId(artifact.payload);
        if (!evalId || !evalRunId) continue;
        const reportUrl = extractReportUrl(artifact.payload);
        return {
            evalId,
            evalRunId,
            ...(reportUrl ? { reportUrl } : {}),
        };
    }

    return null;
}

async function findSuiteEvalId(suiteId: string): Promise<string | null> {
    const recent = await prisma.qaArtifact.findMany({
        where: {
            format: EVAL_RUN_ARTIFACT_FORMAT,
            run: {
                suite_id: suiteId,
            },
        },
        orderBy: { created_at: 'desc' },
        take: 15,
        select: { payload: true },
    });

    for (const artifact of recent) {
        const evalId = extractEvalId(artifact.payload);
        if (evalId) return evalId;
    }
    return null;
}

function buildQaLabEvalItemSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            run_id: { type: 'string' },
            suite_id: { type: 'string' },
            suite_name: { type: 'string' },
            bot_id: { type: 'string' },
            bot_name: { type: 'string' },
            bot_type: { type: 'string' },
            case_id: { type: 'string' },
            case_name: { type: 'string' },
            category: { type: 'string' },
            severity: { type: 'string' },
            status: { type: 'string' },
            passed: { type: 'string' },
            score: { type: 'string' },
            latency_ms: { type: 'string' },
            cost_usd: { type: 'string' },
            security_findings_count: { type: 'string' },
            error_message: { type: 'string' },
        },
        required: [
            'run_id',
            'suite_id',
            'suite_name',
            'bot_id',
            'bot_name',
            'bot_type',
            'case_id',
            'case_name',
            'category',
            'severity',
            'status',
            'passed',
            'score',
            'latency_ms',
            'cost_usd',
            'security_findings_count',
            'error_message',
        ],
    };
}

async function createEvalForSuite(params: {
    client: OpenAI;
    suiteId: string;
    suiteName: string;
    namePrefix: string;
}): Promise<string> {
    const prefix = params.namePrefix || 'QA Lab';
    const suiteName = params.suiteName.trim() || params.suiteId;
    const name = `${prefix} :: ${suiteName}`.slice(0, 120);

    const evalCreated = await params.client.evals.create({
        name,
        data_source_config: {
            type: 'custom',
            item_schema: buildQaLabEvalItemSchema(),
        },
        testing_criteria: [
            {
                type: 'string_check',
                name: 'qa_status_pass',
                input: '{{item.status}}',
                operation: 'eq',
                reference: 'PASS',
            },
            {
                type: 'string_check',
                name: 'qa_zero_security_findings',
                input: '{{item.security_findings_count}}',
                operation: 'eq',
                reference: '0',
            },
        ],
        metadata: {
            source: 'qa_lab',
            suite_id: params.suiteId,
        },
    });

    return evalCreated.id;
}

async function resolveEvalId(params: {
    client: OpenAI;
    suiteId: string;
    suiteName: string;
    runtimeConfig: QaLabEvalsRuntimeConfig;
}): Promise<{ evalId: string; source: EvalIdSource } | null> {
    const fromConfig = params.runtimeConfig.evalId?.trim() || '';
    if (fromConfig) {
        return { evalId: fromConfig, source: 'env' };
    }

    const fromSuite = await findSuiteEvalId(params.suiteId);
    if (fromSuite) {
        return { evalId: fromSuite, source: 'suite-artifact' };
    }

    if (!params.runtimeConfig.autoCreate) {
        return null;
    }

    const created = await createEvalForSuite({
        client: params.client,
        suiteId: params.suiteId,
        suiteName: params.suiteName,
        namePrefix: params.runtimeConfig.namePrefix,
    });
    return { evalId: created, source: 'created' };
}

async function loadRunForSync(runId: string) {
    return prisma.qaRun.findUnique({
        where: { id: runId },
        select: {
            id: true,
            suite_id: true,
            bot_id: true,
            status: true,
            gate_status: true,
            created_at: true,
            completed_at: true,
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
            results: {
                orderBy: { created_at: 'asc' },
                select: {
                    case_id: true,
                    status: true,
                    passed: true,
                    score: true,
                    latency_ms: true,
                    cost_usd: true,
                    error_message: true,
                    security_findings: true,
                    case: {
                        select: {
                            id: true,
                            name: true,
                            category: true,
                            severity: true,
                        },
                    },
                },
            },
        },
    });
}

export async function syncQaRunToOpenAIEvals(runId: string): Promise<QaRunEvalsSyncResult> {
    try {
        const runtimeConfig = await getQaLabEvalsRuntimeConfig();
        if (!runtimeConfig.enabled) {
            return {
                status: 'skipped',
                reason: 'QA Evals sync is disabled.',
            };
        }

        const existing = await findExistingRunSync(runId);
        if (existing) {
            return {
                status: 'skipped',
                reason: 'Run already synced to OpenAI Evals.',
                evalId: existing.evalId,
                evalRunId: existing.evalRunId,
                reportUrl: existing.reportUrl,
            };
        }

        const apiKey = runtimeConfig.apiKey;
        if (!apiKey) {
            return {
                status: 'skipped',
                reason: 'Missing QA Lab OpenAI API key.',
            };
        }

        const run = await loadRunForSync(runId);
        if (!run) {
            return {
                status: 'error',
                reason: 'QA run not found.',
            };
        }

        if (!isTerminalStatus(run.status)) {
            return {
                status: 'skipped',
                reason: 'QA run is not terminal yet.',
            };
        }

        if (run.results.length === 0) {
            return {
                status: 'skipped',
                reason: 'Run has no results to sync.',
            };
        }

        const client = createOpenAIClient(apiKey);
        const evalRef = await resolveEvalId({
            client,
            suiteId: run.suite_id,
            suiteName: run.suite.name,
            runtimeConfig,
        });

        if (!evalRef) {
            return {
                status: 'skipped',
                reason: 'No eval id available. Configure one or enable auto-create.',
            };
        }

        const content = run.results.map((result) => {
            const securityFindingsCount = toSecurityFindingsCount(result.security_findings);
            return {
                item: {
                    run_id: run.id,
                    suite_id: run.suite_id,
                    suite_name: run.suite.name,
                    bot_id: run.bot_id,
                    bot_name: run.bot.name,
                    bot_type: run.bot.bot_type,
                    case_id: result.case_id,
                    case_name: result.case.name,
                    category: result.case.category,
                    severity: result.case.severity,
                    status: result.status,
                    passed: result.passed === null ? '' : String(result.passed),
                    score: result.score === null ? '' : toSafeText(result.score),
                    latency_ms: result.latency_ms === null ? '' : toSafeText(result.latency_ms),
                    cost_usd: result.cost_usd === null ? '' : toSafeText(result.cost_usd),
                    security_findings_count: String(securityFindingsCount),
                    error_message: result.error_message || '',
                },
            };
        });

        const runName = `QA Lab ${run.id.slice(0, 8)} ${run.suite.name}`.slice(0, 120);

        const evalRun = await client.evals.runs.create(evalRef.evalId, {
            name: runName,
            data_source: {
                type: 'jsonl',
                source: {
                    type: 'file_content',
                    content,
                },
            },
            metadata: {
                source: 'qa_lab',
                local_run_id: run.id,
                local_suite_id: run.suite_id,
                local_bot_id: run.bot_id,
                local_status: run.status,
                local_gate_status: run.gate_status,
            },
        });

        const artifactPayload: SyncRunArtifactPayload = {
            version: 1,
            provider: 'openai-evals',
            synced_at: new Date().toISOString(),
            eval_id: evalRef.evalId,
            eval_run_id: evalRun.id,
            eval_run_status: evalRun.status,
            report_url: evalRun.report_url || null,
            eval_id_source: evalRef.source,
            local_run: {
                run_id: run.id,
                suite_id: run.suite_id,
                bot_id: run.bot_id,
                status: run.status,
                gate_status: run.gate_status,
                total_results: run.results.length,
            },
        };
        await persistArtifact(run.id, EVAL_RUN_ARTIFACT_FORMAT, artifactPayload);

        return {
            status: 'synced',
            evalId: evalRef.evalId,
            evalRunId: evalRun.id,
            reportUrl: evalRun.report_url || undefined,
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'OpenAI Evals sync failed.';
        const errorPayload: SyncErrorArtifactPayload = {
            version: 1,
            provider: 'openai-evals',
            failed_at: new Date().toISOString(),
            error: message,
            run_id: runId,
        };
        await persistArtifact(runId, EVAL_ERROR_ARTIFACT_FORMAT, errorPayload);
        return {
            status: 'error',
            reason: message,
        };
    }
}
