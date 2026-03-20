import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthorizationError, verifyAdmin } from '@/lib/auth-utils';
import { processQaRunBatch } from '@/lib/qa-lab';
import { syncQaRunToOpenAIEvals } from '@/lib/qa-lab-evals';

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function isTerminalStatus(status: string): boolean {
    return status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED';
}

function readWorkerToken(req: NextRequest): string {
    const fromHeader = req.headers.get('x-qa-worker-token')?.trim();
    if (fromHeader) return fromHeader;
    const auth = req.headers.get('authorization') || '';
    const bearer = auth.match(/^Bearer\s+(.+)$/i);
    return bearer?.[1]?.trim() || '';
}

async function authorizeWorker(req: NextRequest): Promise<'token' | 'admin'> {
    const configuredToken = process.env.QA_RUN_WORKER_TOKEN?.trim() || '';
    const providedToken = readWorkerToken(req);

    if (configuredToken && providedToken && configuredToken === providedToken) {
        return 'token';
    }

    await verifyAdmin();
    return 'admin';
}

async function markRunFailed(runId: string, message: string) {
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

export async function POST(req: NextRequest) {
    try {
        const accessMode = await authorizeWorker(req);
        let body: Record<string, unknown> = {};
        try {
            body = await req.json() as Record<string, unknown>;
        } catch {
            body = {};
        }

        const params = req.nextUrl.searchParams;
        const maxRuns = clampInt(
            params.get('maxRuns') ?? body.maxRuns,
            5,
            1,
            50,
        );
        const maxBatchesPerRun = clampInt(
            params.get('maxBatchesPerRun') ?? body.maxBatchesPerRun,
            20,
            1,
            1000,
        );

        const activeRuns = await prisma.qaRun.findMany({
            where: {
                status: {
                    in: ['PENDING', 'RUNNING'],
                },
            },
            orderBy: { created_at: 'asc' },
            take: maxRuns,
            select: {
                id: true,
                status: true,
            },
        });

        const processed: Array<{
            run_id: string;
            initial_status: string;
            final_status: string;
            final_gate_status: string;
            processed_now: number;
            remaining: number;
            batches_executed: number;
            exhausted_batch_cap: boolean;
        }> = [];
        const failed: Array<{ run_id: string; error: string }> = [];

        for (const run of activeRuns) {
            try {
                let batchesExecuted = 0;
                let exhaustedBatchCap = false;
                let last = await processQaRunBatch({ runId: run.id });
                batchesExecuted += 1;

                for (; batchesExecuted < maxBatchesPerRun; batchesExecuted++) {
                    const noProgress = last.remaining <= 0 && last.processedNow === 0;
                    if (isTerminalStatus(last.status) || noProgress) {
                        break;
                    }
                    last = await processQaRunBatch({ runId: run.id });
                }

                if (batchesExecuted >= maxBatchesPerRun) {
                    const noProgress = last.remaining <= 0 && last.processedNow === 0;
                    exhaustedBatchCap = !isTerminalStatus(last.status) && !noProgress;
                }

                if (isTerminalStatus(last.status)) {
                    await syncQaRunToOpenAIEvals(run.id);
                }

                processed.push({
                    run_id: run.id,
                    initial_status: run.status,
                    final_status: last.status,
                    final_gate_status: last.gateStatus,
                    processed_now: last.processedNow,
                    remaining: last.remaining,
                    batches_executed: batchesExecuted,
                    exhausted_batch_cap: exhaustedBatchCap,
                });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unhandled worker error';
                await markRunFailed(run.id, message);
                failed.push({
                    run_id: run.id,
                    error: message,
                });
            }
        }

        return NextResponse.json({
            ok: true,
            access_mode: accessMode,
            max_runs: maxRuns,
            max_batches_per_run: maxBatchesPerRun,
            active_runs_found: activeRuns.length,
            processed,
            failed,
        });
    } catch (error: unknown) {
        if (isAuthorizationError(error)) {
            return NextResponse.json(
                { error: error.status === 401 ? 'Authentication required' : 'Forbidden' },
                { status: error.status },
            );
        }
        return NextResponse.json(
            { error: 'Worker execution failed' },
            { status: 500 },
        );
    }
}
