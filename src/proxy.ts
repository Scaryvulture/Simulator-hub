import { NextResponse, type NextRequest } from 'next/server'
import { getAuthenticatedHomePath, getRoleHomePath } from '@/lib/auth-routing'
import {
    buildCspValue,
    getCspHeaderKey,
    shouldEnableCspNonce,
} from '@/lib/csp'
import {
    getRequestOriginFromHeaders,
    isCsrfExemptPath,
    isTrustedRequestOrigin,
    isUnsafeHttpMethod,
    resolveTrustedOrigins,
} from '@/lib/csrf'
import { type ValidatedAuthSession, validateAuthenticatedSession, verifyAuthenticatedToken } from '@/lib/auth-session-core'
import { verifyLtiAccessScopeToken } from '@/lib/lti-access-core'

type SecurityContext = {
    cspHeaderKey: string
    cspValue: string
    requestHeaders: Headers
}

let warnedProdNonceDisabled = false

function createCspNonce(): string {
    return Buffer.from(crypto.randomUUID()).toString('base64')
}
const LTI_ACCESS_SCOPE_COOKIE = 'lti-access-scope'

const PUBLIC_PATHS = new Set(['/login']);
const PUBLIC_AUTH_API_PATHS = new Set([
    '/api/auth/lti/login',
    '/api/auth/lti/launch',
    '/api/auth/lti/jwks',
]);
const PUBLIC_ADMIN_API_PATHS = new Set([
    // Worker route authenticates with dedicated bearer token (QA_RUN_WORKER_TOKEN)
    '/api/admin/qa-runs/worker',
]);
const ORG_ADMIN_ALLOWED_ADMIN_API_PATHS = new Set([
    '/api/admin/conversations/export',
]);

function isAdminApiPath(path: string): boolean {
    return path === '/api/admin' || path.startsWith('/api/admin/');
}

function isPublicPath(path: string): boolean {
    if (PUBLIC_PATHS.has(path)) return true;
    if (PUBLIC_ADMIN_API_PATHS.has(path)) return true;
    for (const publicApiPath of PUBLIC_AUTH_API_PATHS) {
        if (path === publicApiPath || path.startsWith(`${publicApiPath}/`)) {
            return true;
        }
    }
    return false;
}

function clearAuthCookies(response: NextResponse) {
    response.cookies.delete('session-token');
    response.cookies.delete('anon-session-token');
    response.cookies.delete(LTI_ACCESS_SCOPE_COOKIE);
    return response;
}

function extractOrganizationIdFromAdminPath(path: string): string | null {
    const match = path.match(/^\/admin\/organizations\/([^/]+)$/);
    return match?.[1] || null;
}

function unauthorizedResponse(request: NextRequest, clearCookies = false) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
        const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        if (clearCookies) {
            clearAuthCookies(response);
        }
        return response;
    }

    const response = NextResponse.redirect(new URL('/login', request.url));
    if (clearCookies) {
        clearAuthCookies(response);
    }
    return response;
}

function csrfForbiddenResponse(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Forbidden: invalid request origin' }, { status: 403 })
    }
    return new NextResponse('Forbidden: invalid request origin', { status: 403 })
}

function buildSecurityContext(request: NextRequest): SecurityContext {
    const isDev = process.env.NODE_ENV !== 'production'
    const nonceEnabled = shouldEnableCspNonce()
    if (process.env.NODE_ENV === 'production' && !nonceEnabled && !warnedProdNonceDisabled) {
        warnedProdNonceDisabled = true
        console.warn('[csp] CSP_NONCE_ENABLED is false in production. script-src may require unsafe-inline compatibility mode.')
    }

    const requestHeaders = new Headers(request.headers)
    const nonce = nonceEnabled ? createCspNonce() : undefined
    if (nonce) {
        requestHeaders.set('x-nonce', nonce)
    } else {
        requestHeaders.delete('x-nonce')
    }

    return {
        cspHeaderKey: getCspHeaderKey(),
        cspValue: buildCspValue({ isDev, nonce }),
        requestHeaders,
    }
}

function withSecurityHeaders(response: NextResponse, context: SecurityContext): NextResponse {
    response.headers.set(context.cspHeaderKey, context.cspValue)
    return response
}

function nextWithSecurity(context: SecurityContext): NextResponse {
    const response = NextResponse.next({
        request: {
            headers: context.requestHeaders,
        },
    })
    return withSecurityHeaders(response, context)
}

export async function proxy(request: NextRequest) {
    const securityContext = buildSecurityContext(request)
    const token = request.cookies.get('session-token')?.value
    const ltiScopeToken = request.cookies.get(LTI_ACCESS_SCOPE_COOKIE)?.value
    const path = request.nextUrl.pathname;

    if (isUnsafeHttpMethod(request.method) && !isCsrfExemptPath(path)) {
        const trustedOrigins = resolveTrustedOrigins(request.nextUrl.origin)
        const candidateOrigin = getRequestOriginFromHeaders(request.headers)
        const allowMissingOrigin = process.env.NODE_ENV !== 'production'
        const trusted = isTrustedRequestOrigin({
            candidateOrigin,
            trustedOrigins,
            allowMissingOrigin,
        })
        if (!trusted) {
            return withSecurityHeaders(csrfForbiddenResponse(request), securityContext)
        }
    }

    // 1. Define Public Routes (Always accessible)
    const isPublic = isPublicPath(path);

    // 2. Login behavior
    // - Unauthenticated user can see login page.
    // - Authenticated user is redirected to role home.
    // - Invalid token/session is cleared and login page remains available.
    if (path === '/login') {
        if (!token) return nextWithSecurity(securityContext);

        const parsedToken = await verifyAuthenticatedToken(token);
        if (!parsedToken) return clearAuthCookies(nextWithSecurity(securityContext));

        let sessionState: ValidatedAuthSession | null = null;
        try {
            sessionState = await validateAuthenticatedSession(parsedToken);
        } catch {
            sessionState = null;
        }
        if (!sessionState) return clearAuthCookies(nextWithSecurity(securityContext));

        let scopedBotId: string | null = null
        if (sessionState.role !== 'ADMIN' && ltiScopeToken) {
            const scope = await verifyLtiAccessScopeToken(ltiScopeToken)
            if (scope && scope.userId === parsedToken.userId && scope.sessionId === parsedToken.sessionId) {
                scopedBotId = scope.botId
            }
        }

        return withSecurityHeaders(
            NextResponse.redirect(new URL(getAuthenticatedHomePath({
                role: sessionState.role,
                hasOrgAdminAccess: sessionState.hasOrgAdminAccess,
                scopedBotId,
            }), request.url)),
            securityContext
        );
    }

    // 3. Redirect to /login if trying to access protected route without token
    if (!token && !isPublic && path !== '/favicon.ico') {
        return withSecurityHeaders(unauthorizedResponse(request), securityContext);
    }

    // 4. For protected routes, token and auth session must be valid.
    let sessionState: ValidatedAuthSession | null = null;
    if (token && !isPublic) {
        const parsedToken = await verifyAuthenticatedToken(token);
        if (!parsedToken) {
            return withSecurityHeaders(unauthorizedResponse(request, true), securityContext);
        }
        try {
            sessionState = await validateAuthenticatedSession(parsedToken);
        } catch {
            sessionState = null;
        }
        if (!sessionState) return withSecurityHeaders(unauthorizedResponse(request, true), securityContext);
    }

    // 5. Admin Route Protection
    if (isAdminApiPath(path) && !PUBLIC_ADMIN_API_PATHS.has(path)) {
        if (!sessionState) return withSecurityHeaders(unauthorizedResponse(request), securityContext);
        const role = sessionState.role;

        if (role === 'ADMIN') {
            return nextWithSecurity(securityContext);
        }

        if (sessionState.hasOrgAdminAccess && ORG_ADMIN_ALLOWED_ADMIN_API_PATHS.has(path)) {
            return nextWithSecurity(securityContext);
        }

        return withSecurityHeaders(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), securityContext);
    }

    // 6. Admin UI Route Protection
    if (path.startsWith('/admin')) {
        if (!sessionState) return withSecurityHeaders(unauthorizedResponse(request), securityContext);
        const role = sessionState.role;

        if (role === 'ADMIN') {
            return nextWithSecurity(securityContext);
        }

        if (sessionState.hasOrgAdminAccess) {
            const isConversationsScope = path === '/admin/conversations' || path.startsWith('/admin/conversations/');
            const isOrganizationsIndexScope = path === '/admin/organizations';
            const organizationId = extractOrganizationIdFromAdminPath(path);
            const isScopedOrganizationDetail = Boolean(
                organizationId
                && sessionState.orgAdminOrganizationIds.includes(organizationId)
            );
            if (path === '/admin' || path === '/admin/') {
                return withSecurityHeaders(
                    NextResponse.redirect(new URL('/admin/conversations', request.url)),
                    securityContext
                );
            }
            if (!isConversationsScope && !isOrganizationsIndexScope && !isScopedOrganizationDetail) {
                return withSecurityHeaders(
                    NextResponse.redirect(new URL('/conversations', request.url)),
                    securityContext
                );
            }
            return nextWithSecurity(securityContext);
        }

        return withSecurityHeaders(
            NextResponse.redirect(new URL(getRoleHomePath(role, sessionState.hasOrgAdminAccess), request.url)),
            securityContext
        );
    }

    return nextWithSecurity(securityContext);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next (internal Next.js assets and internals)
         * - favicon.ico (favicon file)
         * - any static file with an extension in /public (e.g. .png, .svg, .jpg, .css)
         */
        '/((?!_next|favicon.ico|.*\\.[^/]+$).*)',
    ],
}
