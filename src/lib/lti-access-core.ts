import { SignJWT, jwtVerify } from 'jose'
import { getAppJwtSecretKey } from '@/lib/jwt-secret'
import type { LtiAgsEndpoint } from '@/lib/lti-claims'

const secretKey = getAppJwtSecretKey()
const LTI_ACCESS_SCOPE_COOKIE = 'lti-access-scope'

export type LtiAccessScope = {
    userId: string
    sessionId: string
    botId: string
    organizationId: string
    mappingId: string
    issuer: string
    deploymentId: string | null
    contextId: string
    resourceLinkId: string
    ags: LtiAgsEndpoint | null
    strict: boolean
}

function normalizeString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null
}

function parseScopePayload(payload: Record<string, unknown>): LtiAccessScope | null {
    const userId = normalizeString(payload.userId)
    const sessionId = normalizeString(payload.sessionId)
    const botId = normalizeString(payload.botId)
    const organizationId = normalizeString(payload.organizationId)
    const mappingId = normalizeString(payload.mappingId)
    const issuer = normalizeString(payload.issuer)
    const deploymentId = typeof payload.deploymentId === 'string' && payload.deploymentId.trim()
        ? payload.deploymentId.trim()
        : null
    const contextId = typeof payload.contextId === 'string' ? payload.contextId.trim() : ''
    const resourceLinkId = normalizeString(payload.resourceLinkId)
    const agsRaw = payload.ags
    const strict = payload.strict === true

    if (!userId || !sessionId || !botId || !organizationId || !mappingId || !issuer || !resourceLinkId) {
        return null
    }

    return {
        userId,
        sessionId,
        botId,
        organizationId,
        mappingId,
        issuer,
        deploymentId,
        contextId,
        resourceLinkId,
        ags: parseAgsPayload(agsRaw),
        strict,
    }
}

function parseAgsPayload(value: unknown): LtiAgsEndpoint | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }

    const source = value as Record<string, unknown>
    const lineitem = normalizeString(source.lineitem)
    const lineitems = normalizeString(source.lineitems)
    const scope = Array.isArray(source.scope)
        ? source.scope
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => entry.trim())
        : []

    if (!lineitem && !lineitems && scope.length === 0) {
        return null
    }

    return {
        lineitem,
        lineitems,
        scope: [...new Set(scope)],
    }
}

export function getLtiAccessScopeCookieName() {
    return LTI_ACCESS_SCOPE_COOKIE
}

export async function createLtiAccessScopeToken(params: {
    scope: LtiAccessScope
    expiresAt: Date
}): Promise<string> {
    return await new SignJWT(params.scope)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(Math.floor(params.expiresAt.getTime() / 1000))
        .sign(secretKey)
}

export async function verifyLtiAccessScopeToken(token: string): Promise<LtiAccessScope | null> {
    try {
        const { payload } = await jwtVerify(token, secretKey)
        return parseScopePayload(payload as Record<string, unknown>)
    } catch {
        return null
    }
}
