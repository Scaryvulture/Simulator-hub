import 'server-only'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { getCurrentLtiAccessScope, type LtiAccessScope } from '@/lib/lti-access'
import { getAuthSessionConfig as getSharedAuthSessionConfig } from '@/lib/auth-session-config'
import {
    validateAuthenticatedSession,
    verifyAuthenticatedToken,
} from '@/lib/auth-session-core'
import { type PlatformRole } from '@/lib/platform-role'

export type CurrentUser = {
    userId: string
    username: string
    role: PlatformRole
    sessionId: string
    ltiAccessScope: LtiAccessScope | null
    orgAdminOrganizationIds: string[]
    hasOrgAdminAccess: boolean
}

type SessionActor = CurrentUser
type AuthErrorStatus = 401 | 403
type AuthErrorCode = 'AUTH_REQUIRED' | 'FORBIDDEN'

export class AuthorizationError extends Error {
    status: AuthErrorStatus
    code: AuthErrorCode

    constructor(params: { status: AuthErrorStatus; code: AuthErrorCode; message: string }) {
        super(params.message)
        this.name = 'AuthorizationError'
        this.status = params.status
        this.code = params.code
    }
}

export function isAuthorizationError(error: unknown): error is AuthorizationError {
    if (error instanceof AuthorizationError) return true
    if (!error || typeof error !== 'object') return false

    const maybe = error as { status?: unknown; code?: unknown; message?: unknown }
    const status = maybe.status
    const code = maybe.code
    return (status === 401 || status === 403)
        && (code === 'AUTH_REQUIRED' || code === 'FORBIDDEN')
        && typeof maybe.message === 'string'
}

function authRequired(message = 'Authentication required'): AuthorizationError {
    return new AuthorizationError({
        status: 401,
        code: 'AUTH_REQUIRED',
        message,
    })
}

function forbidden(message = 'Forbidden'): AuthorizationError {
    return new AuthorizationError({
        status: 403,
        code: 'FORBIDDEN',
        message,
    })
}

export async function createAuthSession(params: {
    userId: string
    ipAddress?: string | null
    userAgent?: string | null
}): Promise<{ id: string; expiresAt: Date }> {
    const now = new Date()
    const authSessionConfig = getSharedAuthSessionConfig()
    const expiresAt = new Date(now.getTime() + authSessionConfig.maxSessionMs)
    const session = await prisma.authSession.create({
        data: {
            user_id: params.userId,
            expires_at: expiresAt,
            last_seen_at: now,
            ip_address: params.ipAddress?.slice(0, 128) || null,
            user_agent: params.userAgent?.slice(0, 512) || null,
        },
        select: {
            id: true,
        },
    })

    return { id: session.id, expiresAt }
}

export function getAuthSessionConfig() {
    return getSharedAuthSessionConfig()
}

export function getViewerRole(user: Pick<CurrentUser, 'role' | 'hasOrgAdminAccess'> | null | undefined): 'ADMIN' | 'ORG_ADMIN' | 'USER' {
    if (user?.role === 'ADMIN') return 'ADMIN'
    if (user?.hasOrgAdminAccess) return 'ORG_ADMIN'
    return 'USER'
}

export async function getSessionToken() {
    const cookieStore = await cookies()
    return cookieStore.get('session-token')?.value
}

export async function getCurrentUser() {
    const token = await getSessionToken()
    if (!token) return null

    const parsedToken = await verifyAuthenticatedToken(token)
    if (!parsedToken) return null

    const validatedSession = await validateAuthenticatedSession(parsedToken)
    if (!validatedSession) return null

    const ltiAccessScope = await getCurrentLtiAccessScope()
    const validatedLtiAccessScope =
        validatedSession.role !== 'ADMIN'
        && ltiAccessScope
        && ltiAccessScope.userId === validatedSession.userId
        && ltiAccessScope.sessionId === validatedSession.sessionId
            ? ltiAccessScope
            : null

    return {
        userId: validatedSession.userId,
        username: validatedSession.username,
        role: validatedSession.role,
        sessionId: validatedSession.sessionId,
        ltiAccessScope: validatedLtiAccessScope,
        orgAdminOrganizationIds: validatedSession.orgAdminOrganizationIds,
        hasOrgAdminAccess: validatedSession.hasOrgAdminAccess,
    }
}

export async function getSessionActor(): Promise<SessionActor | null> {
    return await getCurrentUser()
}

export async function verifyAdmin() {
    const user = await getCurrentUser()
    if (!user) throw authRequired('Authentication required')
    if (user.role !== 'ADMIN') throw forbidden('Admin access required')
    return user
}

export async function verifyAdminOrOrgAdmin() {
    const user = await getCurrentUser()
    if (!user) throw authRequired('Authentication required')
    if (user.role !== 'ADMIN' && !user.hasOrgAdminAccess) {
        throw forbidden('Admin or Org Admin access required')
    }
    return user
}

export async function verifyOrgAdmin(orgId: string) {
    const user = await getCurrentUser()
    if (!user) throw authRequired('Authentication required')

    // Global Admin has access to everything
    if (user.role === 'ADMIN') return true

    // Check Org Membership
    const membership = await prisma.organizationMember.findUnique({
        where: {
            organization_id_user_id: {
                organization_id: orgId,
                user_id: user.userId,
            },
        },
    })

    if (!membership || membership.role !== 'ORG_ADMIN') {
        throw forbidden('Org Admin access required')
    }

    return membership
}

export async function verifyOrgMember(orgId: string) {
    const user = await getCurrentUser()
    if (!user) throw authRequired('Authentication required')

    if (user.role === 'ADMIN') return true

    const membership = await prisma.organizationMember.findUnique({
        where: {
            organization_id_user_id: {
                organization_id: orgId,
                user_id: user.userId,
            },
        },
    })

    if (!membership) {
        throw forbidden('Org membership required')
    }

    return membership
}
