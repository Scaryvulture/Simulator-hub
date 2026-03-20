import crypto from 'crypto'

const LTI_MESSAGE_TYPE_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/message_type'
const LTI_VERSION_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/version'
const LTI_DEPLOYMENT_ID_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id'
const LTI_ROLES_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/roles'
const LTI_CUSTOM_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/custom'
const LTI_CONTEXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/context'
const LTI_RESOURCE_LINK_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/resource_link'
const LTI_EXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/ext'
const LTI_AGS_CLAIM = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'

const DEFAULT_LTI_ORG_NAME_CLAIM_KEYS = [
    'organization_name',
    'org_name',
    'organisation_name',
    'tenant_name',
    'tenant_label',
]

const ACCEPTED_LTI_VERSION_CLAIMS = new Set(['LTI-1p3', '1.3.0'])

type LtiContextClaim = {
    id?: unknown
    label?: unknown
    title?: unknown
}

type LtiResourceLinkClaim = {
    id?: unknown
    title?: unknown
}

type LtiCustomClaim = Record<string, unknown>
type LtiAgsClaim = {
    lineitem?: unknown
    lineitems?: unknown
    scope?: unknown
}

export type LtiAgsEndpoint = {
    lineitem: string | null
    lineitems: string | null
    scope: string[]
}

export type LtiIdTokenPayload = {
    sub?: unknown
    email?: unknown
    name?: unknown
    given_name?: unknown
    family_name?: unknown
    nonce?: unknown
    [LTI_MESSAGE_TYPE_CLAIM]?: unknown
    [LTI_VERSION_CLAIM]?: unknown
    [LTI_DEPLOYMENT_ID_CLAIM]?: unknown
    [LTI_ROLES_CLAIM]?: unknown
    [LTI_CUSTOM_CLAIM]?: unknown
    [LTI_CONTEXT_CLAIM]?: unknown
    [LTI_RESOURCE_LINK_CLAIM]?: unknown
    [LTI_EXT_CLAIM]?: unknown
    [LTI_AGS_CLAIM]?: unknown
}

export type LtiResolvedIdentity = {
    messageType: 'LtiResourceLinkRequest' | 'LtiDeepLinkingRequest'
    externalUsername: string
    ltiUsername: string | null
    email: string | null
    orgSsoId: string | null
    orgName: string | null
    deploymentId: string | null
    contextId: string
    contextTitle: string | null
    contextLabel: string | null
    resourceLinkId: string
    resourceLinkTitle: string | null
    issuer: string
    subject: string
    ags: LtiAgsEndpoint | null
}

export type LtiPlatformConfig = {
    issuer: string
    clientId: string
    authLoginUrl: string
    jwksUrl: string
    deploymentId?: string
    orgClaimKeys: string[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function resolveNormalizedCustomClaims(customClaim: LtiCustomClaim | null): Record<string, string> {
    if (!customClaim) return {}

    const result: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(customClaim)) {
        const key = rawKey.trim().toLowerCase()
        if (!key) continue

        if (typeof rawValue === 'string' && rawValue.trim()) {
            result[key] = rawValue.trim()
            continue
        }
        if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
            result[key] = String(rawValue)
            continue
        }
        if (typeof rawValue === 'boolean') {
            result[key] = rawValue ? 'true' : 'false'
        }
    }

    return result
}

function normalizeEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim().toLowerCase()
    if (!normalized || !normalized.includes('@')) return null
    return normalized
}

function resolveLtiUsername(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const normalized = value.trim()
    return normalized || null
}

function deriveExternalUsername(issuer: string, subject: string): string {
    const hash = crypto
        .createHash('sha256')
        .update(`${issuer}::${subject}`)
        .digest('hex')
        .slice(0, 24)

    return `lti_${hash}`
}

function resolveOrgSsoId(
    normalizedCustomClaims: Record<string, string>,
    claimKeys: string[]
): string | null {
    for (const key of claimKeys) {
        const value = normalizedCustomClaims[key]
        if (value) return value
    }

    return null
}

function resolveOrgName(normalizedCustomClaims: Record<string, string>): string | null {
    for (const key of DEFAULT_LTI_ORG_NAME_CLAIM_KEYS) {
        const value = normalizedCustomClaims[key]
        if (value) return value
    }

    return null
}

function resolveLtiAgsEndpoint(value: LtiAgsClaim | null): LtiAgsEndpoint | null {
    if (!value) return null

    const lineitem = typeof value.lineitem === 'string' && value.lineitem.trim()
        ? value.lineitem.trim()
        : null
    const lineitems = typeof value.lineitems === 'string' && value.lineitems.trim()
        ? value.lineitems.trim()
        : null
    const scope = Array.isArray(value.scope)
        ? value.scope
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


export function extractLtiIdentity(
    payload: LtiIdTokenPayload,
    config: LtiPlatformConfig
): LtiResolvedIdentity | null {
    const subject = typeof payload.sub === 'string' ? payload.sub.trim() : ''
    if (!subject) return null

    const messageType = typeof payload[LTI_MESSAGE_TYPE_CLAIM] === 'string'
        ? payload[LTI_MESSAGE_TYPE_CLAIM]
        : null
    if (!messageType || (messageType !== 'LtiResourceLinkRequest' && messageType !== 'LtiDeepLinkingRequest')) {
        return null
    }

    const version = typeof payload[LTI_VERSION_CLAIM] === 'string'
        ? payload[LTI_VERSION_CLAIM]
        : null
    if (!version || !ACCEPTED_LTI_VERSION_CLAIMS.has(version)) return null

    const deploymentId = typeof payload[LTI_DEPLOYMENT_ID_CLAIM] === 'string'
        ? payload[LTI_DEPLOYMENT_ID_CLAIM].trim()
        : null

    if (config.deploymentId && deploymentId !== config.deploymentId) {
        return null
    }

    const customClaim = asRecord(payload[LTI_CUSTOM_CLAIM])
    const extClaim = asRecord(payload[LTI_EXT_CLAIM])
    const agsClaim = asRecord(payload[LTI_AGS_CLAIM]) as LtiAgsClaim | null
    const normalizedCustomClaims = resolveNormalizedCustomClaims(customClaim)
    const contextClaim = asRecord(payload[LTI_CONTEXT_CLAIM]) as LtiContextClaim | null
    const resourceLinkClaim = asRecord(payload[LTI_RESOURCE_LINK_CLAIM]) as LtiResourceLinkClaim | null
    const contextId = typeof contextClaim?.id === 'string' ? contextClaim.id.trim() : ''
    const contextTitle = typeof contextClaim?.title === 'string' && contextClaim.title.trim()
        ? contextClaim.title.trim()
        : null
    const contextLabel = typeof contextClaim?.label === 'string' && contextClaim.label.trim()
        ? contextClaim.label.trim()
        : null
    const resourceLinkId = typeof resourceLinkClaim?.id === 'string' ? resourceLinkClaim.id.trim() : ''
    const resourceLinkTitle = typeof resourceLinkClaim?.title === 'string' && resourceLinkClaim.title.trim()
        ? resourceLinkClaim.title.trim()
        : null

    if (!resourceLinkId) return null

    return {
        messageType,
        issuer: config.issuer,
        subject,
        externalUsername: deriveExternalUsername(config.issuer, subject),
        ltiUsername: resolveLtiUsername(extClaim?.user_username),
        email: normalizeEmail(payload.email),
        orgSsoId: resolveOrgSsoId(normalizedCustomClaims, config.orgClaimKeys),
        orgName: resolveOrgName(normalizedCustomClaims),
        deploymentId,
        contextId,
        contextTitle,
        contextLabel,
        resourceLinkId,
        resourceLinkTitle,
        ags: resolveLtiAgsEndpoint(agsClaim),
    }
}
