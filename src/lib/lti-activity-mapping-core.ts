import { normalizeWhitespace } from '@/lib/text-normalization'

export function normalizeLtiDeploymentId(value: string | null | undefined): string {
    return typeof value === 'string' ? value.trim() : ''
}

export function getLtiPlatformLabel(issuer: string): string {
    try {
        const host = new URL(issuer).hostname.replace(/^www\./i, '')
        return host || 'lti'
    } catch {
        return 'lti'
    }
}

export function buildLtiWrapperOrganizationName(params: {
    issuer: string
    orgSsoId: string
    orgName?: string | null
}): string {
    const platformLabel = getLtiPlatformLabel(params.issuer)
    const normalizedOrgName = typeof params.orgName === 'string' ? normalizeWhitespace(params.orgName) : ''
    if (normalizedOrgName) {
        return `${platformLabel} | ${normalizedOrgName} | org:${params.orgSsoId}`
    }
    return `${platformLabel} | org:${params.orgSsoId}`
}

export function shouldAutoCreateLtiWrapperOrganizations(): boolean {
    const raw = (process.env.LTI_ORG_AUTO_CREATE_ENABLED ?? 'true').trim().toLowerCase()
    return !['0', 'false', 'no', 'off'].includes(raw)
}

export { normalizeWhitespace }
