import 'server-only';
import prisma from '@/lib/prisma';
import type { LtiAccessScope } from '@/lib/lti-access';

export class AccessError extends Error {
    status: number;

    constructor(message: string, status = 403) {
        super(message);
        this.status = status;
    }
}

type ScopedSessionUser = {
    userId: string;
    role: string;
    hasOrgAdminAccess?: boolean;
    ltiAccessScope?: LtiAccessScope | null;
} | null;

async function userHasBotAccess(userId: string, botId: string, ltiAccessScope?: LtiAccessScope | null): Promise<boolean> {
    if (ltiAccessScope && ltiAccessScope.userId === userId) {
        return ltiAccessScope.botId === botId;
    }

    const [assignment, orgAccess] = await Promise.all([
        prisma.botAssignment.findFirst({
            where: { user_id: userId, bot_id: botId },
            select: { user_id: true },
        }),
        prisma.organizationMember.findFirst({
            where: {
                user_id: userId,
                organization: { bots: { some: { bot_id: botId } } },
            },
            select: { id: true },
        }),
    ]);

    return Boolean(assignment || orgAccess);
}

export async function assertCanCreateSession(botId: string, user: ScopedSessionUser) {
    const bot = await prisma.bot.findFirst({
        where: { id: botId, deleted_at: null },
        select: { id: true, published: true },
    });

    if (!bot) throw new AccessError('Bot not found', 404);

    if (!user) {
        throw new AccessError('Authentication required', 401);
    }

    if (user.role === 'ADMIN') return bot;

    if (!bot.published) {
        throw new AccessError('Bot not available', 404);
    }

    if (user.ltiAccessScope && user.role !== 'ADMIN') {
        if (user.ltiAccessScope.botId !== botId) {
            throw new AccessError('Unauthorized bot access for this LTI launch', 403);
        }
        return bot;
    }

    const canAccess = await userHasBotAccess(user.userId, botId, user.ltiAccessScope);
    if (!canAccess) throw new AccessError('Unauthorized bot access', 403);

    return bot;
}

export async function assertCanAccessSession(params: {
    sessionId: string;
    botId?: string;
    user: ScopedSessionUser;
}) {
    const session = await prisma.session.findUnique({
        where: { id: params.sessionId },
        include: { bot: { select: { id: true, published: true } } },
    });

    if (!session) throw new AccessError('Session not found', 404);
    if (params.botId && session.bot_id !== params.botId) {
        throw new AccessError('Session does not match bot', 403);
    }

    const currentUser = params.user;
    if (!currentUser) {
        throw new AccessError('Authentication required', 401);
    }

    if (currentUser.role !== 'ADMIN' && currentUser.ltiAccessScope) {
        const scope = currentUser.ltiAccessScope;
        if (session.bot_id !== scope.botId) {
            throw new AccessError('Unauthorized bot access for this LTI launch', 403);
        }
        if (session.organization_id !== scope.organizationId) {
            throw new AccessError('Unauthorized organization scope for this LTI launch', 403);
        }
        if (!session.external_user_id || session.external_user_id !== currentUser.userId) {
            throw new AccessError('Unauthorized session access for this LTI launch', 403);
        }
        return session;
    }

    if (currentUser.role === 'ADMIN') return session;

    if (currentUser.hasOrgAdminAccess) {
        const sessionOrgId = session.organization_id;
        if (!sessionOrgId) {
            // Org admins can access personal/direct sessions they own,
            // but never sessions owned by other users.
            if (session.external_user_id && session.external_user_id === currentUser.userId) {
                return session;
            }
            throw new AccessError('Unauthorized organization scope for this session', 403);
        }

        const membership = await prisma.organizationMember.findUnique({
            where: {
                organization_id_user_id: {
                    organization_id: sessionOrgId,
                    user_id: currentUser.userId,
                },
            },
            select: { id: true, role: true },
        });

        if (!membership || membership.role !== 'ORG_ADMIN') {
            throw new AccessError('Unauthorized organization scope for this session', 403);
        }

        return session;
    }

    if (currentUser.role === 'USER') {
        if (!session.external_user_id || session.external_user_id !== currentUser.userId) {
            throw new AccessError('Unauthorized session access', 403);
        }
        return session;
    }

    throw new AccessError('Unauthorized session access', 403);
}

export async function assertCanUseSessionForLiveChat(params: {
    sessionId: string;
    botId?: string;
    user: ScopedSessionUser;
}) {
    const session = await assertCanAccessSession(params);

    if (!session.bot) {
        throw new AccessError('Bot not available', 404);
    }

    if (params.user?.role !== 'ADMIN' && !session.bot.published) {
        throw new AccessError('Bot not available', 404);
    }

    return session;
}
