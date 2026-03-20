import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanCreateSession, assertCanAccessSession, AccessError } from '@/lib/chat-access';
import { checkRateLimit, getRequestIp } from '@/lib/rate-limit';
import {
    isContentLengthOverLimit,
    isValidEntityId,
    isValidUuid,
    sanitizeSessionMetadata,
    parseJsonBodyWithLimit,
    PayloadTooLargeError,
} from '@/lib/request-validation';
import { toPublicSessionResponse } from '@/lib/public-response-contract';
import type { Prisma } from '@prisma/client';
import { toPositiveInteger } from '@/lib/number-utils';

async function resolveOrganizationForSession(params: {
    botId: string;
    requestedOrgId?: string | null;
    user: {
        userId: string;
        role: string;
        hasOrgAdminAccess?: boolean;
        ltiAccessScope?: { botId: string; organizationId: string } | null;
    } | null;
}): Promise<string | null> {
    const { botId, requestedOrgId, user } = params;
    if (!user) return null;

    if (user.role !== 'ADMIN' && user.ltiAccessScope) {
        if (user.ltiAccessScope.botId !== botId) {
            throw new AccessError('Unauthorized bot access for this LTI launch', 403);
        }
        if (requestedOrgId && requestedOrgId !== user.ltiAccessScope.organizationId) {
            throw new AccessError('Organization does not match the active LTI launch', 403);
        }
        return user.ltiAccessScope.organizationId;
    }

    if (user.role === 'ADMIN') {
        if (!requestedOrgId) return null;
        const orgBot = await prisma.organizationBot.findUnique({
            where: {
                organization_id_bot_id: {
                    organization_id: requestedOrgId,
                    bot_id: botId,
                },
            },
            select: { bot_id: true },
        });
        if (!orgBot) throw new AccessError('Organization is not linked to this bot', 403);
        return requestedOrgId;
    }

    const [directAssignment, orgMemberships] = await Promise.all([
        prisma.botAssignment.findFirst({
            where: { user_id: user.userId, bot_id: botId },
            select: { user_id: true },
        }),
        prisma.organizationMember.findMany({
            where: {
                user_id: user.userId,
                organization: { bots: { some: { bot_id: botId } } },
            },
            select: { organization_id: true },
        }),
    ]);

    if (requestedOrgId) {
        const belongsToRequestedOrg = orgMemberships.some(
            (membership) => membership.organization_id === requestedOrgId
        );
        if (!belongsToRequestedOrg) {
            throw new AccessError('Unauthorized organization scope for this bot', 403);
        }
        return requestedOrgId;
    }

    if (orgMemberships.length === 1) {
        return orgMemberships[0].organization_id;
    }

    if (orgMemberships.length > 1) {
        if (user.hasOrgAdminAccess) {
            throw new AccessError('organizationId is required when org admin access spans multiple organizations', 400);
        }
        if (!directAssignment) {
            throw new AccessError('organizationId is required when user belongs to multiple organizations', 400);
        }
    }

    return null;
}

/**
 * POST /api/sessions
 * Create a new session in the database
 */
export async function POST(req: NextRequest) {
    try {
        const maxRequestBytes = toPositiveInteger(process.env.SESSION_MAX_REQUEST_BYTES, 256_000);
        if (isContentLengthOverLimit(req.headers.get('content-length'), maxRequestBytes)) {
            return NextResponse.json(
                { error: `Request body too large. Max ${maxRequestBytes} bytes.` },
                { status: 413 }
            );
        }

        const payload = await parseJsonBodyWithLimit(req, maxRequestBytes);
        const sessionId = payload?.sessionId;
        const botId = payload?.botId;
        const metadata = payload?.metadata;
        const organizationId = payload?.organizationId;
        const sessionActor = await getSessionActor();
        const ip = getRequestIp(req);

        if (!sessionActor) {
            return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
        }

        if (!isValidUuid(sessionId) || !isValidEntityId(botId)) {
            return NextResponse.json(
                { error: 'Invalid sessionId or botId' },
                { status: 400 }
            );
        }
        if (organizationId !== undefined && organizationId !== null && organizationId !== '' && !isValidUuid(organizationId)) {
            return NextResponse.json(
                { error: 'Invalid organizationId' },
                { status: 400 }
            );
        }

        let sanitizedMetadata: Record<string, unknown> = {};
        try {
            sanitizedMetadata = sanitizeSessionMetadata(metadata);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid metadata';
            return NextResponse.json(
                { error: errorMessage },
                { status: 400 }
            );
        }

        const createSessionLimit = toPositiveInteger(process.env.SESSION_RATE_LIMIT_MAX, 20);
        const createSessionWindowMs = toPositiveInteger(process.env.SESSION_RATE_LIMIT_WINDOW_MS, 60_000);
        const actorKey = sessionActor.userId || ip;
        const limiter = await checkRateLimit({
            key: `sessions:${actorKey}:${botId}`,
            limit: createSessionLimit,
            windowMs: createSessionWindowMs,
        });
        if (!limiter.allowed) {
            return NextResponse.json(
                {
                    error: 'Too many session creations. Retry shortly.',
                    retry_after_ms: limiter.retryAfterMs,
                },
                { status: 429 }
            );
        }

        await assertCanCreateSession(botId, sessionActor);

        const resolvedOrganizationId = await resolveOrganizationForSession({
            botId,
            requestedOrgId: organizationId || null,
            user: sessionActor,
        });
        const internalMetadata = sessionActor?.ltiAccessScope
            ? {
                lti_launch: {
                    mapping_id: sessionActor.ltiAccessScope.mappingId,
                    issuer: sessionActor.ltiAccessScope.issuer,
                    deployment_id: sessionActor.ltiAccessScope.deploymentId,
                    context_id: sessionActor.ltiAccessScope.contextId,
                    resource_link_id: sessionActor.ltiAccessScope.resourceLinkId,
                    organization_id: sessionActor.ltiAccessScope.organizationId,
                    bot_id: sessionActor.ltiAccessScope.botId,
                    ags: sessionActor.ltiAccessScope.ags,
                    strict: sessionActor.ltiAccessScope.strict,
                },
            }
            : {};
        const persistedMetadata = {
            ...sanitizedMetadata,
            ...internalMetadata,
        };

        // Check if session already exists
        const existing = await prisma.session.findUnique({
            where: { id: sessionId },
        });

        if (existing) {
            try {
                await assertCanAccessSession({ sessionId: existing.id, botId, user: sessionActor });
            } catch (error) {
                if (error instanceof AccessError) {
                    return NextResponse.json({ error: error.message }, { status: error.status });
                }
                throw error;
            }
            if (resolvedOrganizationId && existing.organization_id !== resolvedOrganizationId) {
                return NextResponse.json(
                    { error: 'Session organization does not match requested organization' },
                    { status: 403 }
                );
            }
            const safeExistingSession = toPublicSessionResponse(existing, sessionActor?.role === 'ADMIN');
            return NextResponse.json({ session: safeExistingSession, created: false });
        }

        // Create new session
        const session = await prisma.session.create({
            data: {
                id: sessionId,
                bot_id: botId,
                organization_id: resolvedOrganizationId,
                external_user_id: sessionActor.userId,
                metadata: persistedMetadata as Prisma.InputJsonValue,
            },
        });

        const safeCreatedSession = toPublicSessionResponse(session, sessionActor?.role === 'ADMIN');
        return NextResponse.json({ session: safeCreatedSession, created: true });
    } catch (error: unknown) {
        if (error instanceof AccessError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: error.message }, { status: 413 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        console.error('Sessions API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
