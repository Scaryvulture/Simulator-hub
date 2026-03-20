'use server';

import prisma from '@/lib/prisma';
import { getCurrentUser, getViewerRole } from '@/lib/auth-utils';
import { sanitizeConversationMetadataForViewer } from '@/lib/metadata-visibility';
import type { Prisma } from '@prisma/client';
import {
    APP_USER_AUDIT_IDENTITY_SELECT,
    type AppUserAuditIdentity,
    buildAppUserIdentitySearchWhere,
    createAppUserAuditIdentityMap,
    toAppUserAuditIdentity,
} from '@/lib/user-audit-identity';

type CostAuditRow = {
    scope: 'CHAT' | 'TTS' | 'EVALUATION';
    model: string;
    provider: string | null;
    tokens_in: number;
    tokens_out: number;
    estimated_tokens: number;
    messages: number;
    events: number;
    cost_usd: number;
    updated_at: string | null;
};

export interface ConversationFilters {
    page?: number;
    from?: string;
    to?: string;
    user?: string;
    botId?: string;
}

function normalizePage(page: number | undefined): number {
    if (!Number.isFinite(page)) return 1;
    return Math.max(1, Math.trunc(page as number));
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

export async function getConversations(filters: ConversationFilters = {}) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        throw new Error('Unauthorized');
    }

    const pageSize = 25;
    const page = normalizePage(filters.page);
    const viewerRole = getViewerRole(currentUser);
    const isOrgAdminViewer = viewerRole === 'ORG_ADMIN';
    const orgScopeIds = currentUser.orgAdminOrganizationIds;
    const activeLtiScope = currentUser.role !== 'ADMIN' ? currentUser.ltiAccessScope : null;

    const where: Prisma.SessionWhereInput = {};

    if (activeLtiScope) {
        where.external_user_id = currentUser.userId;
        where.bot_id = activeLtiScope.botId;
        where.organization_id = activeLtiScope.organizationId;
    } else if (viewerRole === 'USER') {
        where.external_user_id = currentUser.userId;
    } else if (isOrgAdminViewer) {
        if (orgScopeIds.length === 0) {
            return {
                sessions: [],
                totalCount: 0,
                totalPages: 0,
                bots: [],
                page,
                viewer_role: viewerRole,
            };
        }

        where.organization_id = { in: orgScopeIds };
    }

    if (filters.from || filters.to) {
        const fromDate = parseDateFilter(filters.from?.trim() || undefined);
        const toDate = parseDateFilter(filters.to?.trim() || undefined, { endOfDay: true });
        if (filters.from && !fromDate) {
            throw new Error('Filtro "from" inválido.');
        }
        if (filters.to && !toDate) {
            throw new Error('Filtro "to" inválido.');
        }
        where.created_at = {};
        if (fromDate) where.created_at.gte = fromDate;
        if (toDate) where.created_at.lte = toDate;
    }

    const normalizedBotId = filters.botId?.trim();
    if (normalizedBotId && normalizedBotId !== 'all') {
        if (activeLtiScope && normalizedBotId !== activeLtiScope.botId) {
            return {
                sessions: [],
                totalCount: 0,
                totalPages: 0,
                bots: [],
                page,
                viewer_role: viewerRole,
            };
        }
        where.bot_id = normalizedBotId;
    }

    const normalizedUser = filters.user?.trim();
    if (normalizedUser) {
        const matchedUsers = await prisma.appUser.findMany({
            where: buildAppUserIdentitySearchWhere(normalizedUser, {
                includeAppUsername: viewerRole === 'ADMIN',
                includeTotaraUserId: true,
                includeTotaraUsername: viewerRole === 'ADMIN',
            }),
            select: { id: true },
            take: 100,
        });
        const matchedIds = matchedUsers.map((u) => u.id);
        const userScopeFilters: Prisma.SessionWhereInput[] = [
            ...(viewerRole === 'ADMIN' ? [{ external_user_id: { contains: normalizedUser } }] : []),
            ...(matchedIds.length > 0 ? [{ external_user_id: { in: matchedIds } }] : []),
        ];

        if (userScopeFilters.length === 0) {
            where.id = '__no_matching_session__';
        } else {
            where.OR = userScopeFilters;
        }
    }

    const resolveVisibleBotsForUser = async () => {
        if (activeLtiScope) {
            const scopedBot = await prisma.bot.findFirst({
                where: {
                    id: activeLtiScope.botId,
                    deleted_at: null,
                    published: true,
                },
                select: { id: true, name: true },
            });
            return scopedBot ? [scopedBot] : [];
        }

        const directAssignments = await prisma.botAssignment.findMany({
            where: { user_id: currentUser.userId },
            select: {
                bot: {
                    select: { id: true, name: true },
                },
            },
        });

        const orgAssignments = await prisma.organizationMember.findMany({
            where: { user_id: currentUser.userId },
            select: {
                organization: {
                    select: {
                        bots: {
                            select: {
                                bot: {
                                    select: { id: true, name: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        const map = new Map<string, { id: string; name: string }>();
        for (const row of directAssignments) {
            const bot = row.bot;
            if (bot) map.set(bot.id, bot);
        }
        for (const membership of orgAssignments) {
            for (const orgBot of membership.organization.bots) {
                const bot = orgBot.bot;
                if (bot) map.set(bot.id, bot);
            }
        }
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    };

    const [sessions, totalCount, bots] = await Promise.all([
        prisma.session.findMany({
            where,
            select: {
                id: true,
                bot_id: true,
                external_user_id: true,
                metadata: true,
                created_at: true,
                ended: true,
                bot: {
                    select: {
                        id: true,
                        name: true,
                        bot_type: true,
                        published: true,
                    },
                },
            },
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.session.count({ where }),
        currentUser.role === 'ADMIN'
            ? prisma.bot.findMany({
                where: { deleted_at: null },
                select: { id: true, name: true },
            })
            : activeLtiScope
                ? resolveVisibleBotsForUser()
            : isOrgAdminViewer
                ? prisma.organizationBot.findMany({
                    where: { organization_id: { in: orgScopeIds } },
                    select: {
                        bot: {
                            select: { id: true, name: true },
                        },
                    },
                    distinct: ['bot_id'],
                }).then((rows) => rows.map((row) => row.bot))
                : resolveVisibleBotsForUser()
    ]);

    // Look up audit identities for sessions that have external_user_id
    const userIds = sessions
        .map((s) => s.external_user_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const userMap = new Map<string, AppUserAuditIdentity>();
    if (userIds.length > 0) {
        const users = await prisma.appUser.findMany({
            where: { id: { in: userIds } },
            select: APP_USER_AUDIT_IDENTITY_SELECT,
        });
        const auditIdentityMap = createAppUserAuditIdentityMap(users);
        auditIdentityMap.forEach((value, key) => userMap.set(key, value));
    }

    const sessionsWithUsernames = sessions.map((s) => {
        const metadata = sanitizeConversationMetadataForViewer(
            s.metadata,
            currentUser.role === 'ADMIN'
        );
        const identity = s.external_user_id ? userMap.get(s.external_user_id) || null : null;
        const canExposeAppUsername = viewerRole !== 'ORG_ADMIN';
        const canExposeTotaraUsername = viewerRole === 'ADMIN';
        const { external_user_id, ...sessionData } = s;
        void external_user_id;

        return {
            ...sessionData,
            metadata,
            created_at: s.created_at?.toISOString() || null,
            app_username: canExposeAppUsername ? identity?.appUsername || null : null,
            totara_user_id: identity?.totaraUserId || null,
            totara_username: canExposeTotaraUsername ? identity?.totaraUsername || null : null,
        };
    });

    return {
        sessions: sessionsWithUsernames,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        bots,
        page,
        viewer_role: viewerRole,
    };
}

export async function getConversationDetail(sessionId: string) {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error('Unauthorized');
    const viewerRole = getViewerRole(currentUser);
    const isAdminViewer = currentUser.role === 'ADMIN';

    const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: {
            id: true,
            bot_id: true,
            organization_id: true,
            external_user_id: true,
            metadata: true,
            created_at: true,
            ended: true,
            bot: {
                select: {
                    id: true,
                    name: true,
                    bot_type: true,
                    published: true,
                },
            },
            messages: {
                select: {
                    id: true,
                    role: true,
                    content: true,
                    images: true,
                    tokens_in: true,
                    tokens_out: true,
                    cost_usd: true,
                    created_at: true,
                },
                orderBy: { created_at: 'asc' }
            },
        }
    });

    if (!session) return null;

    if (currentUser.role !== 'ADMIN' && currentUser.ltiAccessScope) {
        if (session.external_user_id !== currentUser.userId) {
            throw new Error('Unauthorized: conversation outside LTI user scope');
        }
        if (session.bot_id !== currentUser.ltiAccessScope.botId) {
            throw new Error('Unauthorized: conversation outside LTI bot scope');
        }
        if (session.organization_id !== currentUser.ltiAccessScope.organizationId) {
            throw new Error('Unauthorized: conversation outside LTI organization scope');
        }
    } else if (viewerRole === 'USER') {
        if (session.external_user_id !== currentUser.userId) {
            throw new Error('Unauthorized: conversation outside user scope');
        }
    } else if (viewerRole === 'ORG_ADMIN') {
        const sessionOrgId = session.organization_id;
        if (!sessionOrgId) {
            throw new Error('Unauthorized: conversation is not scoped to an organization');
        }

        if (!currentUser.orgAdminOrganizationIds.includes(sessionOrgId)) {
            throw new Error('Unauthorized: conversation outside organization scope');
        }
    }

    // Look up audit identity
    let userIdentity: AppUserAuditIdentity | null = null;
    if (session.external_user_id) {
        const user = await prisma.appUser.findUnique({
            where: { id: session.external_user_id },
            select: APP_USER_AUDIT_IDENTITY_SELECT,
        });
        userIdentity = user ? toAppUserAuditIdentity(user) : null;
    }
    const canExposeAppUsername = viewerRole !== 'ORG_ADMIN';
    const canExposeTotaraUsername = viewerRole === 'ADMIN';

    // Calculate stats
    type ConversationStats = {
        tokensIn: number;
        tokensOut: number;
        cost: number;
        count: number;
    };

    const stats = session.messages.reduce<ConversationStats>((acc, msg) => ({
        tokensIn: acc.tokensIn + (msg.tokens_in || 0),
        tokensOut: acc.tokensOut + (msg.tokens_out || 0),
        cost: acc.cost + (msg.cost_usd || 0),
        count: acc.count + 1
    }), { tokensIn: 0, tokensOut: 0, cost: 0, count: 0 });

    const metadataObject = sanitizeConversationMetadataForViewer(session.metadata, isAdminViewer);
    const voiceAuditTotals = (metadataObject.voice_audit_totals && typeof metadataObject.voice_audit_totals === 'object' && !Array.isArray(metadataObject.voice_audit_totals))
        ? metadataObject.voice_audit_totals as Record<string, unknown>
        : {};
    const voiceStats = {
        total_chars: typeof voiceAuditTotals.total_chars === 'number' ? voiceAuditTotals.total_chars : 0,
        total_estimated_tokens: typeof voiceAuditTotals.total_estimated_tokens === 'number' ? voiceAuditTotals.total_estimated_tokens : 0,
        total_cost_usd: typeof voiceAuditTotals.total_cost_usd === 'number' ? voiceAuditTotals.total_cost_usd : 0,
        events: typeof voiceAuditTotals.events === 'number' ? voiceAuditTotals.events : 0,
    };

    let costAudits: CostAuditRow[] | null = null;
    if (isAdminViewer) {
        try {
            const maybePrisma = prisma as unknown as {
                sessionCostAudit?: {
                    findMany: (args: {
                        where: { session_id: string };
                        select: {
                            scope: true;
                            model: true;
                            provider: true;
                            tokens_in: true;
                            tokens_out: true;
                            estimated_tokens: true;
                            messages: true;
                            events: true;
                            cost_usd: true;
                            updated_at: true;
                        };
                    }) => Promise<Array<{
                        scope: 'CHAT' | 'TTS' | 'EVALUATION';
                        model: string;
                        provider: string | null;
                        tokens_in: number;
                        tokens_out: number;
                        estimated_tokens: number;
                        messages: number;
                        events: number;
                        cost_usd: number;
                        updated_at: Date;
                    }>>;
                };
            };

            if (maybePrisma.sessionCostAudit && typeof maybePrisma.sessionCostAudit.findMany === 'function') {
                const rows = await maybePrisma.sessionCostAudit.findMany({
                    where: { session_id: sessionId },
                    select: {
                        scope: true,
                        model: true,
                        provider: true,
                        tokens_in: true,
                        tokens_out: true,
                        estimated_tokens: true,
                        messages: true,
                        events: true,
                        cost_usd: true,
                        updated_at: true,
                    },
                });
                costAudits = rows.map((row) => ({
                    scope: row.scope,
                    model: row.model,
                    provider: row.provider,
                    tokens_in: row.tokens_in || 0,
                    tokens_out: row.tokens_out || 0,
                    estimated_tokens: row.estimated_tokens || 0,
                    messages: row.messages || 0,
                    events: row.events || 0,
                    cost_usd: row.cost_usd || 0,
                    updated_at: row.updated_at?.toISOString() || null,
                }));
            } else {
                costAudits = [];
            }
        } catch (error: unknown) {
            console.warn('Unable to load session cost audits (falling back to metadata):', error);
            costAudits = [];
        }
    }

    const { external_user_id, ...sessionData } = session;
    void external_user_id;

    return {
        ...sessionData,
        viewer_role: viewerRole,
        created_at: session.created_at?.toISOString() || null,
        metadata: metadataObject,
        app_username: canExposeAppUsername ? userIdentity?.appUsername || null : null,
        totara_user_id: userIdentity?.totaraUserId || null,
        totara_username: canExposeTotaraUsername ? userIdentity?.totaraUsername || null : null,
        stats,
        voice_stats: isAdminViewer ? voiceStats : null,
        cost_audits: isAdminViewer ? costAudits : null,
        messages: session.messages.map((m) => {
            const rawImages = Array.isArray(m.images) ? m.images : [];
            const images = rawImages
                .map((item) => {
                    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
                    const source = item as Record<string, unknown>;
                    const mimeType = typeof source.mime_type === 'string' ? source.mime_type : '';
                    const dataUrl = typeof source.data_url === 'string' ? source.data_url : undefined;
                    return {
                        mime_type: mimeType,
                        ...(dataUrl ? { data_url: dataUrl } : {}),
                    };
                })
                .filter((item): item is { mime_type: string; data_url?: string } => Boolean(item));

            return {
                id: m.id,
                role: m.role,
                content: m.content,
                images,
                created_at: m.created_at?.toISOString() || null,
            };
        }),
    };
}
