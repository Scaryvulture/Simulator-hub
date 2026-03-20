import 'server-only'
import crypto from 'crypto'
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { getAppJwtSecretKey } from '@/lib/app-jwt'
import { normalizeLtiUrl } from '@/lib/lti-normalization'
import {
    parseLtiLoginInitiationParams,
    type LtiLoginInitiationParams,
} from '@/lib/lti-login-core'
import {
    extractLtiIdentity,
    type LtiAgsEndpoint,
    type LtiIdTokenPayload,
    type LtiPlatformConfig,
    type LtiResolvedIdentity,
} from '@/lib/lti-claims'

const LTI_CONTEXT_COOKIE = 'lti-oidc-context'

type LtiLoginContextPayload = {
    state: string
    nonce: string
    issuer: string
    clientId: string
    targetLinkUri: string
    ltiMessageHint?: string
}

function readRequiredEnv(name: string): string | null {
    const value = process.env[name]?.trim()
    if (!value) return null
    return value
}

function parseCsv(value: string | undefined, fallback: string[]): string[] {
    const normalized = value?.trim()
    if (!normalized) return fallback
    return normalized
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
}

export function getLtiPlatformConfig(): LtiPlatformConfig | null {
    const enabled = (process.env.LTI_ENABLED ?? 'true').trim().toLowerCase()
    if (enabled === '0' || enabled === 'false' || enabled === 'no') {
        return null
    }

    const issuer = readRequiredEnv('LTI_ISSUER')
    const clientId = readRequiredEnv('LTI_CLIENT_ID')
    const authLoginUrl = readRequiredEnv('LTI_AUTH_LOGIN_URL')
    const jwksUrl = readRequiredEnv('LTI_JWKS_URL')

    if (!issuer || !clientId || !authLoginUrl || !jwksUrl) return null

    const deploymentId = process.env.LTI_DEPLOYMENT_ID?.trim() || undefined
    const orgClaimKeys = parseCsv(
        process.env.LTI_ORG_CLAIM_KEYS,
        ['organization_id', 'org_id', 'sso_id', 'tenant_id', 'organisation_id']
    ).map((item) => item.toLowerCase())
    return {
        issuer: normalizeLtiUrl(issuer),
        clientId,
        authLoginUrl: authLoginUrl.trim(),
        jwksUrl: jwksUrl.trim(),
        deploymentId,
        orgClaimKeys,
    }
}

function randomHex(size = 24) {
    return crypto.randomBytes(size).toString('hex')
}

export function isHttpsRequest(requestUrl: URL, forwardedProto: string | null): boolean {
    if (requestUrl.protocol === 'https:') return true
    const forwarded = forwardedProto?.toLowerCase() || ''
    return forwarded.includes('https')
}

export async function createLtiLoginContextToken(context: LtiLoginContextPayload): Promise<string> {
    return await new SignJWT(context)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(getAppJwtSecretKey())
}

export function createLtiLoginContext(params: LtiLoginInitiationParams): LtiLoginContextPayload {
    return {
        state: randomHex(24),
        nonce: randomHex(24),
        issuer: params.issuer,
        clientId: params.clientId,
        targetLinkUri: params.targetLinkUri,
        ltiMessageHint: params.ltiMessageHint,
    }
}

export async function verifyLtiLoginContextToken(token: string): Promise<LtiLoginContextPayload | null> {
    try {
        const { payload } = await jwtVerify(token, getAppJwtSecretKey())
        const state = typeof payload.state === 'string' ? payload.state : null
        const nonce = typeof payload.nonce === 'string' ? payload.nonce : null
        const issuer = typeof payload.issuer === 'string' ? payload.issuer : null
        const clientId = typeof payload.clientId === 'string' ? payload.clientId : null
        const targetLinkUri = typeof payload.targetLinkUri === 'string' ? payload.targetLinkUri : null
        const ltiMessageHint =
            typeof payload.ltiMessageHint === 'string' ? payload.ltiMessageHint : undefined

        if (!state || !nonce || !issuer || !clientId || !targetLinkUri) return null
        return {
            state,
            nonce,
            issuer: normalizeLtiUrl(issuer),
            clientId,
            targetLinkUri,
            ltiMessageHint,
        }
    } catch {
        return null
    }
}

export function getLtiContextCookieName() {
    return LTI_CONTEXT_COOKIE
}

export async function verifyAndDecodeLtiIdToken(
    idToken: string,
    config: LtiPlatformConfig
): Promise<LtiIdTokenPayload | null> {
    try {
        const jwks = createRemoteJWKSet(new URL(config.jwksUrl))
        const { payload } = await jwtVerify(idToken, jwks, {
            issuer: config.issuer,
            audience: config.clientId,
            maxTokenAge: '10m',
        })
        return payload as LtiIdTokenPayload
    } catch {
        return null
    }
}

export { extractLtiIdentity }
export { parseLtiLoginInitiationParams }
export type { LtiAgsEndpoint, LtiPlatformConfig, LtiResolvedIdentity }
