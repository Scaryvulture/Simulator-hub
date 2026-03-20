import { normalizeLtiUrl } from '@/lib/lti-normalization'

export type LtiLoginInitiationParams = {
    issuer: string
    loginHint: string
    targetLinkUri: string
    clientId: string
    ltiMessageHint?: string
}

export function parseLtiLoginInitiationParams(
    source: URLSearchParams,
    fallbackClientId?: string
): LtiLoginInitiationParams | null {
    const issuer = source.get('iss')?.trim()
    const loginHint = source.get('login_hint')?.trim()
    const targetLinkUri = source.get('target_link_uri')?.trim()
    const clientId = source.get('client_id')?.trim() || fallbackClientId?.trim()
    const ltiMessageHint = source.get('lti_message_hint')?.trim() || undefined

    if (!issuer || !loginHint || !targetLinkUri || !clientId) {
        return null
    }

    try {
        const parsedTarget = new URL(targetLinkUri)
        if (parsedTarget.protocol !== 'https:') return null
    } catch {
        return null
    }

    return {
        issuer: normalizeLtiUrl(issuer),
        loginHint,
        targetLinkUri,
        clientId,
        ltiMessageHint,
    }
}
