import { jwtVerify } from 'jose'
import prisma from '@/lib/prisma'
import { getAppJwtSecretKey } from '@/lib/jwt-secret'
import { isValidUuid } from '@/lib/request-validation'
import { getAuthSessionConfig } from '@/lib/auth-session-config'
import { normalizePlatformRole, type PlatformRole } from '@/lib/platform-role'

const secretKey = getAppJwtSecretKey()

export type VerifiedAuthToken = {
    userId: string
    sessionId: string
}

export type ValidatedAuthSession = {
    userId: string
    sessionId: string
    username: string
    role: PlatformRole
    orgAdminOrganizationIds: string[]
    hasOrgAdminAccess: boolean
}

function parseAuthenticatedPayload(payload: Record<string, unknown>): VerifiedAuthToken | null {
    const userId = typeof payload.userId === 'string' ? payload.userId : null
    const sessionId = typeof payload.sid === 'string' ? payload.sid : null
    if (!userId || !sessionId || !isValidUuid(userId) || !isValidUuid(sessionId)) return null
    return { userId, sessionId }
}

export async function verifyAuthenticatedToken(token: string): Promise<VerifiedAuthToken | null> {
    try {
        const { payload } = await jwtVerify(token, secretKey)
        return parseAuthenticatedPayload(payload as Record<string, unknown>)
    } catch {
        return null
    }
}

export async function revokeAuthSession(sessionId: string, reason: string): Promise<void> {
    await prisma.authSession.updateMany({
        where: {
            id: sessionId,
            revoked_at: null,
        },
        data: {
            revoked_at: new Date(),
            revoke_reason: reason,
        },
    })
}

export async function getOrgAdminOrganizationIds(userId: string): Promise<string[]> {
    const memberships = await prisma.organizationMember.findMany({
        where: { user_id: userId, role: 'ORG_ADMIN' },
        select: { organization_id: true },
        orderBy: { organization_id: 'asc' },
    })
    return memberships.map((membership) => membership.organization_id)
}

export async function validateAuthenticatedSession(
    tokenPayload: VerifiedAuthToken
): Promise<ValidatedAuthSession | null> {
    const now = new Date()
    const authSessionConfig = getAuthSessionConfig()
    const session = await prisma.authSession.findUnique({
        where: { id: tokenPayload.sessionId },
        include: {
            user: {
                select: { id: true, username: true, role: true },
            },
        },
    })

    if (!session || session.user_id !== tokenPayload.userId || !session.user || session.revoked_at) return null

    if (session.expires_at.getTime() <= now.getTime()) {
        await revokeAuthSession(session.id, 'SESSION_EXPIRED')
        return null
    }

    if ((session.last_seen_at.getTime() + authSessionConfig.idleTimeoutMs) <= now.getTime()) {
        await revokeAuthSession(session.id, 'IDLE_TIMEOUT')
        return null
    }

    const touchBefore = new Date(now.getTime() - authSessionConfig.touchIntervalMs)
    if (session.last_seen_at < touchBefore) {
        await prisma.authSession.updateMany({
            where: {
                id: session.id,
                revoked_at: null,
                last_seen_at: {
                    lt: touchBefore,
                },
            },
            data: {
                last_seen_at: now,
            },
        })
    }

    const role = normalizePlatformRole(session.user.role)
    const orgAdminOrganizationIds = role === 'ADMIN'
        ? []
        : await getOrgAdminOrganizationIds(session.user.id)

    return {
        userId: session.user.id,
        sessionId: session.id,
        username: session.user.username,
        role,
        orgAdminOrganizationIds,
        hasOrgAdminAccess: orgAdminOrganizationIds.length > 0,
    }
}
