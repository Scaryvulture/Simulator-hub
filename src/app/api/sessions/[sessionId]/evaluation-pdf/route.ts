import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionActor, getViewerRole } from '@/lib/auth-utils';
import { assertCanAccessSession, AccessError } from '@/lib/chat-access';
import { isValidUuid } from '@/lib/request-validation';
import { buildSimplePdf, type SimplePdfLine } from '@/lib/simple-pdf';
import { APP_USER_AUDIT_IDENTITY_SELECT, toAppUserAuditIdentity } from '@/lib/user-audit-identity';

type EvaluationResult = {
    score: number;
    max_score: number;
    percentage: number;
    results: {
        boolean: Array<{ id: string; title: string; passed: boolean; reason: string }>;
        qualitative: Array<{ id: string; title: string; feedback: string }>;
    };
    timestamp: string;
};

type PdfLang = 'es' | 'en';

function isEvaluationResult(value: unknown): value is EvaluationResult {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const source = value as Record<string, unknown>;
    if (typeof source.score !== 'number') return false;
    if (typeof source.max_score !== 'number') return false;
    if (typeof source.percentage !== 'number') return false;
    if (!source.results || typeof source.results !== 'object' || Array.isArray(source.results)) return false;
    const results = source.results as Record<string, unknown>;
    return Array.isArray(results.boolean) && Array.isArray(results.qualitative) && typeof source.timestamp === 'string';
}

function safeText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function getPdfLang(req: NextRequest): PdfLang {
    const queryLang = req.nextUrl.searchParams.get('lang');
    if (queryLang === 'es' || queryLang === 'en') return queryLang;

    const acceptLanguage = req.headers.get('accept-language')?.toLowerCase() || '';
    return acceptLanguage.includes('es') ? 'es' : 'en';
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        if (!isValidUuid(sessionId)) {
            return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
        }

        const actor = await getSessionActor();
        await assertCanAccessSession({ sessionId, user: actor });

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: {
                id: true,
                external_user_id: true,
                created_at: true,
                metadata: true,
                bot: {
                    select: {
                        name: true,
                    },
                },
            },
        });

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const metadata = (session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata))
            ? session.metadata as Record<string, unknown>
            : {};
        const evaluationRaw = metadata.evaluation;
        if (!isEvaluationResult(evaluationRaw)) {
            return NextResponse.json({ error: 'Evaluation not found for this session.' }, { status: 404 });
        }

        const evaluation = evaluationRaw;
        const lang = getPdfLang(req);
        const locale = lang === 'es' ? 'es-AR' : 'en-US';
        const viewerRole = getViewerRole(actor)
        const userIdentity = session.external_user_id
            ? await prisma.appUser.findUnique({
                where: { id: session.external_user_id },
                select: APP_USER_AUDIT_IDENTITY_SELECT,
            }).then((u) => (u ? toAppUserAuditIdentity(u) : null))
            : null;

        const evaluationDate = new Date(evaluation.timestamp || session.created_at || new Date());
        const dateTime = evaluationDate.toLocaleString(locale, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
        const anonymousLabel = lang === 'es' ? 'Anonimo' : 'Anonymous';
        const userLabel = safeText(
            viewerRole === 'ADMIN'
                ? (userIdentity?.totaraUserId || userIdentity?.appUsername || anonymousLabel)
                : viewerRole === 'ORG_ADMIN'
                    ? (userIdentity?.totaraUserId || 'n/a')
                    : (userIdentity?.appUsername || userIdentity?.totaraUserId || anonymousLabel)
        );
        const botLabel = safeText(session.bot?.name || (lang === 'es' ? 'Desconocido' : 'Unknown'));
        const passThreshold = 70;
        const isPass = evaluation.percentage >= passThreshold;
        const narrativeText = lang === 'es'
            ? `El usuario ${userLabel} hizo la practica en el bot "${botLabel}" en fecha ${dateTime}, obteniendo el siguiente resultado:`
            : `User ${userLabel} completed the practice on bot "${botLabel}" on ${dateTime}, obtaining the following result:`;

        const copy = lang === 'es'
            ? {
                title: 'Reporte de evaluacion',
                generated: 'Fecha del reporte',
                summary: 'Resumen',
                status: 'Estado',
                statusPass: 'Aprobado',
                statusFail: 'Necesita mejora',
                score: 'Puntaje',
                percentage: 'Porcentaje',
                sessionId: 'Session ID',
                userRef: 'Totara User ID',
                appUserRef: 'Usuario app',
                keyObjectives: 'Objetivos clave',
                passFlag: 'SI',
                failFlag: 'NO',
                reason: 'Motivo',
                feedback: 'Feedback cualitativo',
                noFeedback: 'Sin feedback cualitativo.',
            }
            : {
                title: 'Evaluation report',
                generated: 'Report date',
                summary: 'Summary',
                status: 'Status',
                statusPass: 'Passed',
                statusFail: 'Needs improvement',
                score: 'Score',
                percentage: 'Percentage',
                sessionId: 'Session ID',
                userRef: 'Totara User ID',
                appUserRef: 'App username',
                keyObjectives: 'Key objectives',
                passFlag: 'YES',
                failFlag: 'NO',
                reason: 'Reason',
                feedback: 'Qualitative feedback',
                noFeedback: 'No qualitative feedback.',
            };

        const lines: SimplePdfLine[] = [
            { kind: 'title', text: copy.title },
            { kind: 'meta', text: `${copy.generated}: ${dateTime}` },
            { kind: 'spacer' },
            { kind: 'body', text: narrativeText },
            { kind: 'spacer' },
            { kind: 'section', text: copy.summary },
            { kind: 'body', text: `${copy.status}: ${isPass ? copy.statusPass : copy.statusFail}` },
            { kind: 'body', text: `${copy.score}: ${evaluation.score} / ${evaluation.max_score}` },
            { kind: 'body', text: `${copy.percentage}: ${evaluation.percentage}%` },
            { kind: 'meta', text: `${copy.sessionId}: ${session.id}` },
            { kind: 'meta', text: `${copy.userRef}: ${safeText(userIdentity?.totaraUserId || 'n/a')}` },
            ...(viewerRole === 'ADMIN' && userIdentity?.appUsername
                ? [{ kind: 'meta' as const, text: `${copy.appUserRef}: ${safeText(userIdentity.appUsername)}` }]
                : []),
            { kind: 'spacer' },
            { kind: 'section', text: copy.keyObjectives },
            ...evaluation.results.boolean.flatMap((row) => ([
                {
                    kind: 'bullet' as const,
                    text: `${safeText(row.title)} (${row.passed ? copy.passFlag : copy.failFlag})`,
                },
                {
                    kind: 'body' as const,
                    text: `${copy.reason}: ${safeText(row.reason)}`,
                },
            ])),
            { kind: 'spacer' },
            { kind: 'section', text: copy.feedback },
            ...(evaluation.results.qualitative.length > 0
                ? evaluation.results.qualitative.map((row) => ({
                    kind: 'bullet' as const,
                    text: `${safeText(row.title)}: ${safeText(row.feedback)}`,
                }))
                : [{ kind: 'body' as const, text: copy.noFeedback }]),
        ];

        const pdfBuffer = buildSimplePdf(lines);
        const fileName = `evaluation-${session.id.slice(0, 8)}.pdf`;

        return new NextResponse(new Uint8Array(pdfBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${fileName}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (error: unknown) {
        if (error instanceof AccessError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('Evaluation PDF error:', error);
        return NextResponse.json({ error: 'Failed to generate evaluation PDF.' }, { status: 500 });
    }
}
