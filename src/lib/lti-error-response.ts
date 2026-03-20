import { NextResponse } from 'next/server'
import { pickLanguageValue } from '@/lib/server-language'

export function createLtiUnavailableResponse(lang: 'es' | 'en') {
    return NextResponse.json(
        {
            error: pickLanguageValue(lang, {
                es: 'LTI no está configurado. Define LTI_ISSUER, LTI_CLIENT_ID, LTI_AUTH_LOGIN_URL y LTI_JWKS_URL.',
                en: 'LTI is not configured. Set LTI_ISSUER, LTI_CLIENT_ID, LTI_AUTH_LOGIN_URL and LTI_JWKS_URL.',
            }),
        },
        { status: 503 }
    )
}
