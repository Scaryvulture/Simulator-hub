import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthorizationError, verifyAdmin } from '@/lib/auth-utils';

const MAX_ARTIFACT_PAYLOAD_CHARS = 1_000_000;
const MAX_ARTIFACTS_PER_RUN_FORMAT = 5;

function toSafeString(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
}

function neutralizeCsvFormulaInjection(value: string): string {
    // Prevent spreadsheet formula execution when opening exported CSV files.
    if (/^[=+\-@]/.test(value) || /^[\t\r]/.test(value)) {
        return `'${value}`;
    }
    return value;
}

function escapeCsv(value: unknown): string {
    const text = neutralizeCsvFormulaInjection(toSafeString(value).replace(/\r?\n/g, ' '));
    if (/[",]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

type RunExportData = NonNullable<Awaited<ReturnType<typeof getRunExportData>>>;

function shouldPersistArtifacts(): boolean {
    return process.env.QA_EXPORT_PERSIST_ARTIFACTS === 'true';
}

function clampArtifactPayload(payload: string): string {
    if (payload.length <= MAX_ARTIFACT_PAYLOAD_CHARS) return payload;
    return `${payload.slice(0, MAX_ARTIFACT_PAYLOAD_CHARS)}\n...[truncated]`;
}

async function persistArtifactIfEnabled(runId: string, format: string, payload: string) {
    if (!shouldPersistArtifacts()) return;

    await prisma.$transaction(async (tx) => {
        await tx.qaArtifact.create({
            data: {
                run_id: runId,
                format,
                payload: clampArtifactPayload(payload),
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
                where: { id: { in: stale.map((row) => row.id) } },
            });
        }
    });
}

function buildCsv(data: RunExportData) {
    const headers = [
        'run_id',
        'suite_name',
        'bot_name',
        'case_id',
        'case_name',
        'category',
        'severity',
        'status',
        'passed',
        'score',
        'latency_ms',
        'tokens_in',
        'tokens_out',
        'cost_usd',
        'security_findings_count',
        'error_message',
        'response_excerpt',
    ];

    const lines = [headers.join(',')];
    for (const result of data.results) {
        const row = [
            data.run.id,
            data.suite.name,
            data.bot.name,
            result.case.id,
            result.case.name,
            result.case.category,
            result.case.severity,
            result.status,
            result.passed,
            result.score,
            result.latency_ms,
            result.tokens_in,
            result.tokens_out,
            result.cost_usd,
            Array.isArray(result.security_findings) ? result.security_findings.length : 0,
            result.error_message || '',
            result.response_excerpt || '',
        ];
        lines.push(row.map(escapeCsv).join(','));
    }
    return lines.join('\n');
}

async function getRunExportData(runId: string) {
    const run = await prisma.qaRun.findUnique({
        where: { id: runId },
        include: {
            suite: {
                select: { id: true, name: true },
            },
            bot: {
                select: { id: true, name: true, bot_type: true },
            },
            results: {
                include: {
                    case: {
                        select: {
                            id: true,
                            name: true,
                            category: true,
                            severity: true,
                        },
                    },
                },
                orderBy: { created_at: 'asc' },
            },
        },
    });
    if (!run) return null;

    return {
        run: {
            id: run.id,
            status: run.status,
            gate_status: run.gate_status,
            created_at: run.created_at?.toISOString() || null,
            started_at: run.started_at?.toISOString() || null,
            completed_at: run.completed_at?.toISOString() || null,
            summary: run.summary || {},
            metrics: run.metrics || {},
            error_message: run.error_message,
        },
        suite: run.suite,
        bot: run.bot,
        results: run.results.map((result) => ({
            id: result.id,
            status: result.status,
            passed: result.passed,
            score: result.score,
            latency_ms: result.latency_ms,
            tokens_in: result.tokens_in,
            tokens_out: result.tokens_out,
            cost_usd: result.cost_usd,
            response_excerpt: result.response_excerpt,
            response_full: result.response_full,
            error_message: result.error_message,
            security_findings: result.security_findings,
            case: result.case,
            created_at: result.created_at?.toISOString() || null,
            updated_at: result.updated_at?.toISOString() || null,
        })),
    };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ runId: string }> }
) {
    try {
        await verifyAdmin();
        const { runId } = await params;
        const format = (req.nextUrl.searchParams.get('format') || 'csv').toLowerCase();

        if (format !== 'csv' && format !== 'json') {
            return NextResponse.json(
                { error: 'Invalid format. Use csv or json.' },
                { status: 400 }
            );
        }

        const data = await getRunExportData(runId);
        if (!data) {
            return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
        }

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `qa-run-${runId}-${stamp}`;

        if (format === 'json') {
            const body = JSON.stringify(data, null, 2);
            await persistArtifactIfEnabled(runId, 'json', body).catch(() => undefined);

            return new NextResponse(body, {
                status: 200,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Disposition': `attachment; filename="${baseName}.json"`,
                    'Cache-Control': 'no-store',
                },
            });
        }

        const csv = buildCsv(data);
        await persistArtifactIfEnabled(runId, 'csv', csv).catch(() => undefined);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${baseName}.csv"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error: unknown) {
        if (isAuthorizationError(error)) {
            return NextResponse.json(
                { error: error.status === 401 ? 'Authentication required' : 'Forbidden' },
                { status: error.status },
            );
        }
        console.error('QA export error:', error);
        return NextResponse.json(
            { error: 'Export failed.' },
            { status: 500 }
        );
    }
}
