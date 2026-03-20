import { NextRequest, NextResponse } from 'next/server'
import {
    createLtiLoginContext,
    createLtiLoginContextToken,
    getLtiContextCookieName,
    getLtiPlatformConfig,
    isHttpsRequest,
    parseLtiLoginInitiationParams,
} from '@/lib/lti'
import { createLtiUnavailableResponse } from '@/lib/lti-error-response'
import { getRequestLanguage, pickLanguageValue } from '@/lib/server-language'

function parseSource(request: NextRequest, formData?: FormData): URLSearchParams {
    if (formData) {
        const params = new URLSearchParams()
        for (const [key, value] of formData.entries()) {
            if (typeof value === 'string') {
                params.set(key, value)
            }
        }
        return params
    }
    return request.nextUrl.searchParams
}

async function handleLoginInitiation(request: NextRequest, formData?: FormData) {
    const lang = getRequestLanguage(request)
    const config = getLtiPlatformConfig()
    if (!config) return createLtiUnavailableResponse(lang)

    const source = parseSource(request, formData)
    const params = parseLtiLoginInitiationParams(source, config.clientId)
    if (!params) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'Los parámetros de inicio de sesión LTI no son válidos.',
                    en: 'Invalid LTI login initiation parameters.',
                }),
            },
            { status: 400 }
        )
    }

    if (params.issuer !== config.issuer || params.clientId !== config.clientId) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'issuer/client_id LTI desconocidos.',
                    en: 'Unknown LTI issuer/client_id.',
                }),
            },
            { status: 403 }
        )
    }
    try {
        const target = new URL(params.targetLinkUri)
        if (target.origin !== request.nextUrl.origin) {
            return NextResponse.json(
                {
                    error: pickLanguageValue(lang, {
                        es: 'El origen de target_link_uri no coincide.',
                        en: 'target_link_uri origin mismatch.',
                    }),
                },
                { status: 400 }
            )
        }
    } catch {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'target_link_uri no es válido.',
                    en: 'Invalid target_link_uri.',
                }),
            },
            { status: 400 }
        )
    }

    const context = createLtiLoginContext(params)
    const contextToken = await createLtiLoginContextToken(context)

    const redirectUrl = new URL(config.authLoginUrl)
    redirectUrl.searchParams.set('scope', 'openid')
    redirectUrl.searchParams.set('response_type', 'id_token')
    redirectUrl.searchParams.set('response_mode', 'form_post')
    redirectUrl.searchParams.set('prompt', 'none')
    redirectUrl.searchParams.set('client_id', params.clientId)
    redirectUrl.searchParams.set('redirect_uri', params.targetLinkUri)
    redirectUrl.searchParams.set('login_hint', params.loginHint)
    redirectUrl.searchParams.set('state', context.state)
    redirectUrl.searchParams.set('nonce', context.nonce)
    if (params.ltiMessageHint) {
        redirectUrl.searchParams.set('lti_message_hint', params.ltiMessageHint)
    }

    const response = NextResponse.redirect(redirectUrl)
    const isHttps = isHttpsRequest(request.nextUrl, request.headers.get('x-forwarded-proto'))
    const secureCookie = isHttps || process.env.NODE_ENV === 'production'
    response.cookies.set(getLtiContextCookieName(), contextToken, {
        httpOnly: true,
        secure: secureCookie,
        sameSite: secureCookie ? 'none' : 'lax',
        path: '/api/auth/lti/launch',
        maxAge: 60 * 10,
    })
    return response
}

export async function GET(request: NextRequest) {
    return handleLoginInitiation(request)
}

export async function POST(request: NextRequest) {
    const formData = await request.formData()
    return handleLoginInitiation(request, formData)
}
