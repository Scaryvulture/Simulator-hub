'use server';

import prisma from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import {
    createAuthSession,
} from '@/lib/auth-utils'
import { getAppJwtSecretKey } from '@/lib/app-jwt'
import {
    getOrgAdminOrganizationIds,
    revokeAuthSession,
    verifyAuthenticatedToken,
} from '@/lib/auth-session-core'
import { checkRateLimit } from '@/lib/rate-limit'
import { getRoleHomePath } from '@/lib/auth-routing'
import { resolveClientIpOrUnknown, UNKNOWN_IP } from '@/lib/request-ip'
import { actionFailure, type ActionResult } from '@/lib/action-result'
import { getLtiAccessScopeCookieName } from '@/lib/lti-access'
import { toPositiveInteger } from '@/lib/number-utils'

const secretKey = getAppJwtSecretKey()

async function getClientIpForRateLimit() {
    const headerStore = await headers()
    return resolveClientIpOrUnknown(headerStore)
}

async function getRequestContext() {
    const headerStore = await headers()
    const ip = resolveClientIpOrUnknown(headerStore)
    const userAgent = headerStore.get('user-agent')?.trim() || null
    return {
        ip: ip === UNKNOWN_IP ? null : ip,
        userAgent,
    }
}

async function canUseManualLogin(userId: string): Promise<boolean> {
    const memberships: Array<{ organization: { allow_manual_login: boolean } }> = await prisma.organizationMember.findMany({
        where: { user_id: userId },
        select: {
            organization: {
                select: { allow_manual_login: true },
            },
        },
    });

    if (memberships.length === 0) return true;
    return memberships.every((membership) => membership.organization.allow_manual_login);
}

function isNextRedirectSignal(error: unknown): boolean {
    const maybeDigest = typeof error === 'object' && error !== null && 'digest' in error
        ? String((error as { digest?: unknown }).digest ?? '')
        : ''
    const maybeMessage = error instanceof Error ? error.message : ''
    return maybeDigest.includes('NEXT_REDIRECT') || maybeMessage.includes('NEXT_REDIRECT')
}

export async function login(formData: FormData): Promise<ActionResult<null>> {
    try {
        const username = typeof formData.get('username') === 'string'
            ? String(formData.get('username')).trim()
            : ''
        const password = typeof formData.get('password') === 'string'
            ? String(formData.get('password'))
            : ''

        if (!username || !password) {
            return actionFailure('Username and password are required')
        }

        const legacyLoginLimit = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_MAX, 8)
        const legacyLoginWindowMs = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 300_000)
        const loginUserLimit = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_USER_MAX, legacyLoginLimit)
        const loginUserWindowMs = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_USER_WINDOW_MS, legacyLoginWindowMs)
        const loginUserIpLimit = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_USER_IP_MAX, legacyLoginLimit)
        const loginUserIpWindowMs = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_USER_IP_WINDOW_MS, legacyLoginWindowMs)
        const loginIpLimit = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_IP_MAX, 20)
        const loginIpWindowMs = toPositiveInteger(process.env.LOGIN_RATE_LIMIT_IP_WINDOW_MS, legacyLoginWindowMs)
        const actorIp = await getClientIpForRateLimit()
        const normalizedUsername = username.toLowerCase()

        const userLimiter = await checkRateLimit({
            key: `login-user:${normalizedUsername}`,
            limit: loginUserLimit,
            windowMs: loginUserWindowMs,
        })
        if (!userLimiter.allowed) {
            return actionFailure('Too many login attempts. Try again in a few minutes.')
        }

        if (actorIp !== UNKNOWN_IP) {
            const ipLimiter = await checkRateLimit({
                key: `login-ip:${actorIp}`,
                limit: loginIpLimit,
                windowMs: loginIpWindowMs,
            })
            if (!ipLimiter.allowed) {
                return actionFailure('Too many login attempts. Try again in a few minutes.')
            }

            const userIpLimiter = await checkRateLimit({
                key: `login-user-ip:${normalizedUsername}:${actorIp}`,
                limit: loginUserIpLimit,
                windowMs: loginUserIpWindowMs,
            })
            if (!userIpLimiter.allowed) {
                return actionFailure('Too many login attempts. Try again in a few minutes.')
            }
        }

        const user = await prisma.appUser.findUnique({
            where: { username },
        })

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return actionFailure('Invalid username or password')
        }

        if (user.role !== 'ADMIN') {
            const manualLoginAllowed = await canUseManualLogin(user.id)
            if (!manualLoginAllowed) {
                return actionFailure('Manual login is disabled for your organization. Access via LMS/LTI is required.')
            }
        }

        const normalizedRole = user.role === 'ADMIN' ? 'ADMIN' : 'USER'
        const hasOrgAdminAccess = normalizedRole === 'ADMIN'
            ? false
            : (await getOrgAdminOrganizationIds(user.id)).length > 0

        const requestContext = await getRequestContext()
        const authSession = await createAuthSession({
            userId: user.id,
            ipAddress: requestContext.ip,
            userAgent: requestContext.userAgent,
        })

        const token = await new SignJWT({
            userId: user.id,
            username: user.username,
            role: normalizedRole,
            sid: authSession.id,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime(Math.floor(authSession.expiresAt.getTime() / 1000))
            .sign(secretKey)

        const cookieStore = await cookies()
        cookieStore.set('session-token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            expires: authSession.expiresAt,
        })
        cookieStore.delete('anon-session-token')
        cookieStore.delete(getLtiAccessScopeCookieName())

        redirect(getRoleHomePath(normalizedRole, hasOrgAdminAccess))
    } catch (error: unknown) {
        if (isNextRedirectSignal(error)) {
            throw error
        }
        console.error('Login action failed:', error)
        return actionFailure('Unable to sign in right now. Please try again.')
    }
}

export async function logout() {
    const cookieStore = await cookies()
    const token = cookieStore.get('session-token')?.value
    if (token) {
        const parsed = await verifyAuthenticatedToken(token)
        if (parsed) {
            await revokeAuthSession(parsed.sessionId, 'LOGOUT')
        }
    }
    cookieStore.delete('session-token')
    cookieStore.delete('anon-session-token')
    cookieStore.delete(getLtiAccessScopeCookieName())
    redirect('/login')
}
