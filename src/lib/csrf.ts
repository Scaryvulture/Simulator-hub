const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const EXEMPT_PATH_PREFIXES = [
    '/api/auth/lti/',
]

const EXEMPT_EXACT_PATHS = new Set([
    '/api/admin/qa-runs/worker',
])

let warnedInvalidTrustedOrigins = false
let warnedMissingTrustedOriginsInProd = false

function normalizeOrigin(raw: string): string | null {
    try {
        return new URL(raw).origin
    } catch {
        return null
    }
}

function parseTrustedOriginsFromEnv(raw: string | undefined): string[] {
    if (!raw) return []
    const trusted: string[] = []
    let invalidCount = 0

    for (const chunk of raw.split(',')) {
        const normalized = normalizeOrigin(chunk.trim())
        if (!normalized) {
            invalidCount += 1
            continue
        }
        trusted.push(normalized)
    }

    if (invalidCount > 0 && !warnedInvalidTrustedOrigins) {
        warnedInvalidTrustedOrigins = true
        console.warn(`[csrf] Ignoring ${invalidCount} invalid CSRF_TRUSTED_ORIGINS entr${invalidCount === 1 ? 'y' : 'ies'}.`)
    }

    return trusted
}

export function isUnsafeHttpMethod(method: string): boolean {
    return UNSAFE_METHODS.has(method.toUpperCase())
}

export function isCsrfExemptPath(path: string): boolean {
    if (EXEMPT_EXACT_PATHS.has(path)) return true
    return EXEMPT_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
}

export function getRequestOriginFromHeaders(headers: Headers): string | null {
    const originHeader = headers.get('origin')?.trim()
    if (originHeader) {
        return normalizeOrigin(originHeader)
    }

    const refererHeader = headers.get('referer')?.trim()
    if (refererHeader) {
        return normalizeOrigin(refererHeader)
    }

    return null
}

export function resolveTrustedOrigins(requestOrigin: string): Set<string> {
    const trusted = new Set<string>([requestOrigin])
    const envOrigins = parseTrustedOriginsFromEnv(process.env.CSRF_TRUSTED_ORIGINS)
    if (process.env.NODE_ENV === 'production' && envOrigins.length === 0 && !warnedMissingTrustedOriginsInProd) {
        warnedMissingTrustedOriginsInProd = true
        console.warn('[csrf] CSRF_TRUSTED_ORIGINS is empty in production. Configure explicit origins if requests can come through multiple domains.')
    }
    for (const origin of envOrigins) {
        trusted.add(origin)
    }
    return trusted
}

export function isTrustedRequestOrigin(params: {
    candidateOrigin: string | null
    trustedOrigins: Set<string>
    allowMissingOrigin: boolean
}): boolean {
    if (!params.candidateOrigin) {
        return params.allowMissingOrigin
    }
    return params.trustedOrigins.has(params.candidateOrigin)
}
