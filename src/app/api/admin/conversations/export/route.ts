import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { isAuthorizationError, verifyAdminOrOrgAdmin } from '@/lib/auth-utils';
import { buildSimpleXlsx } from '@/lib/simple-xlsx';
import { sanitizeSpreadsheetCell } from '@/lib/spreadsheet-sanitizer';
import {
    APP_USER_AUDIT_IDENTITY_SELECT,
    buildAppUserIdentitySearchWhere,
    createAppUserAuditIdentityMap,
} from '@/lib/user-audit-identity';

type EvaluationSnapshot = {
    score: number;
    max_score: number;
    percentage: number;
};

function parseEvaluationSnapshot(value: unknown): EvaluationSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    if (typeof source.score !== 'number') return null;
    if (typeof source.max_score !== 'number') return null;
    if (typeof source.percentage !== 'number') return null;
    return {
        score: source.score,
        max_score: source.max_score,
        percentage: source.percentage,
    };
}

function toDateOnly(value: Date | null): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(value);
}

function toTimeOnly(value: Date | null): string {
    if (!value) return '';
    return new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(value);
}

function toNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function parseDateFilter(value: string | undefined, options?: { endOfDay?: boolean }): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    if (options?.endOfDay) {
        parsed.setHours(23, 59, 59, 999);
    }
    return parsed;
}

// Helper to calculate totals from cost_audits (similar to page.tsx logic but simplified for export)
function calculateSessionCosts(costAudits: unknown) {
    const result = {
        models: new Set<string>(),
        tokensIn: 0,
        tokensOut: 0,
        chatCost: 0,
        voiceCost: 0,
        evalCost: 0,
        totalCost: 0
    };

    if (!Array.isArray(costAudits)) return result;

    for (const item of costAudits) {
        const source = toObject(item);
        if (!source) continue;

        const scope = source.scope as string;
        const model = typeof source.model === 'string' ? source.model.trim() : '';
        const tIn = toNumber(source.tokens_in);
        const tOut = toNumber(source.tokens_out);
        const cost = toNumber(source.cost_usd);

        if (model) result.models.add(model);

        // Accumulate tokens (only reasonable for CHAT/EVAL usually, but we sum all for simplicity or just CHAT?)
        // Requirement says "Tokens de entrada", usually implies Text tokens. Let's sum CHAT + EVAL. 
        // TTS tokens are "estimated characters" usually mapped to tokens? 
        // Let's sum all IN/OUT available.
        result.tokensIn += tIn;
        result.tokensOut += tOut;

        if (scope === 'CHAT') {
            result.chatCost += cost;
        } else if (scope === 'TTS') {
            result.voiceCost += cost;
        } else if (scope === 'EVALUATION') {
            result.evalCost += cost;
        }

        result.totalCost += cost;
    }

    return result;
}

export async function GET(req: NextRequest) {
    try {
        const currentUser = await verifyAdminOrOrgAdmin();
        const includeAuditColumns = currentUser.role === 'ADMIN';
        const params = req.nextUrl.searchParams;
        const fromRaw = params.get('from');
        const toRaw = params.get('to');
        const userRaw = params.get('user');
        const botIdRaw = params.get('botId');
        const from = fromRaw?.trim() || undefined;
        const to = toRaw?.trim() || undefined;
        const user = userRaw?.trim() || undefined;
        const botId = botIdRaw?.trim() || undefined;
        const fromDate = parseDateFilter(from);
        const toDate = parseDateFilter(to, { endOfDay: true });

        if (from && !fromDate) {
            return NextResponse.json({ error: 'Invalid "from" date filter.' }, { status: 400 });
        }
        if (to && !toDate) {
            return NextResponse.json({ error: 'Invalid "to" date filter.' }, { status: 400 });
        }

        // Force at least one filter
        if (!from && !to && !user && (!botId || botId === 'all')) {
            return NextResponse.json({ error: 'Missing required filters (date, user or bot).' }, { status: 400 });
        }

        const where: Prisma.SessionWhereInput = {};
        const orgScopeIds = currentUser.orgAdminOrganizationIds;

        if (currentUser.role !== 'ADMIN') {
            if (orgScopeIds.length === 0) {
                return NextResponse.json({ error: 'No organizations available for export.' }, { status: 403 });
            }
            where.organization_id = { in: orgScopeIds };
        }

        if (from || to) {
            where.created_at = {};
            if (fromDate) where.created_at.gte = fromDate;
            if (toDate) where.created_at.lte = toDate;
        }

        if (botId && botId !== 'all') {
            where.bot_id = botId;
        }

        if (user) {
            const matchedUsers = await prisma.appUser.findMany({
                where: buildAppUserIdentitySearchWhere(user, {
                    includeAppUsername: currentUser.role === 'ADMIN',
                    includeTotaraUserId: true,
                    includeTotaraUsername: currentUser.role === 'ADMIN',
                }),
                select: { id: true },
                take: 100,
            });
            const matchedIds = matchedUsers.map((u) => u.id);
            const userScopeFilters: Prisma.SessionWhereInput[] = [
                ...(currentUser.role === 'ADMIN' ? [{ external_user_id: { contains: user } }] : []),
                ...(matchedIds.length > 0 ? [{ external_user_id: { in: matchedIds } }] : []),
            ];

            if (userScopeFilters.length === 0) {
                where.id = '__no_matching_session__';
            } else {
                where.OR = userScopeFilters;
            }
        }

        const sessions = await prisma.session.findMany({
            where,
            select: {
                id: true,
                organization_id: true,
                external_user_id: true,
                metadata: true,
                created_at: true,
                ended: true,
                cost_audits: includeAuditColumns,
                bot: {
                    select: {
                        id: true,
                        name: true,
                        bot_type: true,
                    },
                },
                organization: {
                    select: { name: true },
                },
                _count: {
                    select: { messages: true },
                },
                messages: {
                    orderBy: { created_at: 'asc' },
                    select: { role: true, content: true },
                },
            },
            orderBy: { created_at: 'desc' },
        });

        const userIds = sessions
            .map((s) => s.external_user_id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);

        const users = userIds.length > 0
            ? await prisma.appUser.findMany({
                where: { id: { in: userIds } },
                select: APP_USER_AUDIT_IDENTITY_SELECT,
            })
            : [];
        const userMap = createAppUserAuditIdentityMap(users);

        const headers = [
            'Fecha',
            'Hora',
            'Session ID',
            'Organización',
            'Totara User ID',
            'Nombre del bot',
            'Tipo de bot',
            'Mensajes',
            'Puntuación obtenida',
            'Max Score',
            'Porcentaje',
            'Detalles de la evaluación',
            'Historial del chat'
        ];

        // Admin-only columns
        if (currentUser.role === 'ADMIN') {
            headers.push(
                'Usuario app',
                'Modelo usado',
                'Tokens de entrada',
                'Tokens de salida',
                'Costo de la conversación',
                'Voice Cost',
                'Costo de la evaluación',
                'Costo total'
            );
        }

        const rows = sessions.map((session) => {
            const metadata = session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
                ? session.metadata as Record<string, unknown>
                : {};
            const evaluation = parseEvaluationSnapshot(metadata.evaluation);
            const identity = session.external_user_id ? userMap.get(session.external_user_id) || null : null;

            // Parse evaluation details
            let evalDetails = '';
            const rawEval = toObject(metadata.evaluation);
            const rawResults = rawEval ? toObject(rawEval.results) : null;
            const booleanResults = Array.isArray(rawResults?.boolean) ? rawResults.boolean : [];
            if (booleanResults.length > 0) {
                evalDetails = booleanResults
                    .map((item) => {
                        const entry = toObject(item);
                        const status = entry?.passed ? '✅' : '❌';
                        const title = typeof entry?.title === 'string' ? entry.title : '';
                        return `${status} ${title}`.trim();
                    })
                    .join('\n');
            }

            // Parse chat history
            const chatHistory = session.messages.map(m => {
                const role = m.role === 'user' ? '[User]' : '[Bot]';
                return `${role}: ${m.content}`;
            }).join('\n\n');

            const row = [
                toDateOnly(session.created_at),
                toTimeOnly(session.created_at),
                session.id,
                session.organization?.name || '',
                identity?.totaraUserId || 'n/a',
                session.bot?.name || '',
                session.bot?.bot_type || '', // Tipo de bot
                session._count.messages,
                evaluation?.score ?? '', // Puntuación obtenida
                evaluation?.max_score ?? '',
                evaluation?.percentage ?? '',
                evalDetails,
                chatHistory
            ];

            if (includeAuditColumns) {
                const costs = calculateSessionCosts((session as { cost_audits?: unknown }).cost_audits);
                // Fallback for voice cost if not in cost_audits (legacy)
                const voiceStats = toObject(metadata.voice_audit_totals);

                if (costs.voiceCost === 0 && voiceStats && typeof voiceStats.total_cost_usd === 'number') {
                    costs.voiceCost = voiceStats.total_cost_usd;
                    costs.totalCost += costs.voiceCost;
                }

                row.push(
                    identity?.appUsername || '',
                    Array.from(costs.models).join(', '), // Modelo usado
                    costs.tokensIn, // Tokens de entrada
                    costs.tokensOut, // Tokens de salida
                    Number(costs.chatCost).toFixed(6), // Costo de la conversación
                    Number(costs.voiceCost).toFixed(6), // Voice Cost
                    Number(costs.evalCost).toFixed(6), // Costo de la evaluación
                    Number(costs.totalCost).toFixed(6)  // Costo total
                );
            }
            return row.map(sanitizeSpreadsheetCell);
        });

        const fileBuffer = buildSimpleXlsx({
            headers,
            rows,
            sheetName: 'Practices',
        });

        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `practices-export-${stamp}.xlsx`;

        return new NextResponse(new Uint8Array(fileBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${fileName}"`,
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
        console.error('Conversations export error:', error);
        return NextResponse.json({ error: 'Export failed.' }, { status: 500 });
    }
}
