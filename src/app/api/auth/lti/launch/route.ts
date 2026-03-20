import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import prisma from '@/lib/prisma'
import { createAuthSession } from '@/lib/auth-utils'
import { getAppJwtSecretKey } from '@/lib/app-jwt'
import {
    extractLtiIdentity,
    getLtiContextCookieName,
    getLtiPlatformConfig,
    isHttpsRequest,
    verifyAndDecodeLtiIdToken,
    verifyLtiLoginContextToken,
} from '@/lib/lti'
import { createLtiUnavailableResponse } from '@/lib/lti-error-response'
import { resolveClientIpOrUnknown, UNKNOWN_IP } from '@/lib/request-ip'
import {
    findOrCreateLtiWrapperOrganization,
    upsertLtiActivityMappingFromLaunch,
} from '@/lib/lti-activity-mappings'
import { resolveLtiReportingScope } from '@/lib/lti-launch-organizations-core'
import {
    createLtiAccessScopeToken,
    getLtiAccessScopeCookieName,
} from '@/lib/lti-access'
import { getChatPath } from '@/lib/chat-routes'
import { getRequestLanguage, pickLanguageValue } from '@/lib/server-language'

const secretKey = getAppJwtSecretKey()

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function ltiErrorResponse(message: string, lang: 'es' | 'en', status = 403) {
    const safeMessage = escapeHtml(message)
    const title = pickLanguageValue(lang, {
        es: 'Error de acceso LTI',
        en: 'LTI Launch Error',
    })
    const heading = pickLanguageValue(lang, {
        es: 'El acceso LTI no está disponible',
        en: 'LTI launch unavailable',
    })
    const hint = pickLanguageValue(lang, {
        es: 'Pide a un administrador que revise el mapeo LTI de la actividad y la configuración de la organización wrapper.',
        en: 'Ask an administrator to review the LTI activity mapping and wrapper organization setup.',
    })
    return new NextResponse(
        `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f6f7fb; color: #1f2937; margin: 0; }
      main { max-width: 720px; margin: 64px auto; background: white; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08); }
      h1 { margin-top: 0; font-size: 28px; }
      p { line-height: 1.6; }
      .hint { color: #6b7280; font-size: 14px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${safeMessage}</p>
      <p class="hint">${escapeHtml(hint)}</p>
    </main>
  </body>
</html>`,
        {
            status,
            headers: {
                'content-type': 'text/html; charset=utf-8',
            },
        }
    )
}

function getRequestContext(request: NextRequest) {
    const ip = resolveClientIpOrUnknown(request.headers)
    const userAgent = request.headers.get('user-agent')?.trim() || null
    return {
        ip: ip === UNKNOWN_IP ? null : ip,
        userAgent,
    }
}

async function createOrLinkLtiUser(identity: {
    issuer: string
    subject: string
    externalUsername: string
    ltiUsername: string | null
    email: string | null
}) {
    const resolveAssignableEmail = async (email: string | null, currentUserId?: string) => {
        if (!email) return null

        const emailOwner = await prisma.appUser.findUnique({
            where: { email },
            select: { id: true },
        })

        if (!emailOwner || emailOwner.id === currentUserId) {
            return email
        }

        return null
    }

    const selectUser = {
        id: true,
        username: true,
        role: true,
        email: true,
        lti_issuer: true,
        lti_subject: true,
        lti_username: true,
    } as const

    const existingByLtiIdentity = await prisma.appUser.findUnique({
        where: {
            lti_issuer_lti_subject: {
                lti_issuer: identity.issuer,
                lti_subject: identity.subject,
            },
        },
        select: selectUser,
    })

    const existingByLegacyUsername = existingByLtiIdentity ? null : await prisma.appUser.findUnique({
        where: { username: identity.externalUsername },
        select: selectUser,
    })
    const existing = existingByLtiIdentity
        ?? (existingByLegacyUsername?.username.startsWith('lti_') ? existingByLegacyUsername : null)

    const syncExistingUser = async (user: typeof existing) => {
        if (!user) return null

        const updateData: {
            email?: string | null
            lti_issuer?: string
            lti_subject?: string
            lti_username?: string | null
        } = {}

        if ((!user.lti_issuer || !user.lti_subject) && user.username.startsWith('lti_')) {
            updateData.lti_issuer = identity.issuer
            updateData.lti_subject = identity.subject
        }

        if (identity.ltiUsername !== user.lti_username) {
            updateData.lti_username = identity.ltiUsername
        }

        if (identity.email && identity.email !== user.email) {
            const assignableEmail = await resolveAssignableEmail(identity.email, user.id)
            if (assignableEmail) {
                updateData.email = assignableEmail
            }
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.appUser.update({
                where: { id: user.id },
                data: updateData,
            })
        }

        return {
            id: user.id,
            username: user.username,
            role: user.role,
            email: updateData.email ?? user.email,
        }
    }

    if (existing) {
        const syncedUser = await syncExistingUser(existing)
        if (syncedUser) {
            return syncedUser
        }
    }

    const emailToUse = await resolveAssignableEmail(identity.email)

    const passwordHash = await bcrypt.hash(crypto.randomUUID(), 10)
    return await prisma.appUser.create({
        data: {
            username: identity.externalUsername,
            email: emailToUse,
            password_hash: passwordHash,
            role: 'USER',
            lti_issuer: identity.issuer,
            lti_subject: identity.subject,
            lti_username: identity.ltiUsername,
        },
        select: { id: true, username: true, role: true, email: true },
    })
}

async function syncAutomaticOrganizationMembership(params: {
    organizationId: string
    userId: string
}) {
    const membership = await prisma.organizationMember.findUnique({
        where: {
            organization_id_user_id: {
                organization_id: params.organizationId,
                user_id: params.userId,
            },
        },
        select: { id: true, role: true },
    })

    if (!membership) {
        await prisma.organizationMember.create({
            data: {
                organization_id: params.organizationId,
                user_id: params.userId,
                role: 'MEMBER',
            },
        })
        return
    }
}

export async function POST(request: NextRequest) {
    const lang = getRequestLanguage(request)
    const config = getLtiPlatformConfig()
    if (!config) return createLtiUnavailableResponse(lang)

    const contextToken = request.cookies.get(getLtiContextCookieName())?.value
    if (!contextToken) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'Falta la cookie de contexto de login LTI.',
                    en: 'Missing LTI login context cookie.',
                }),
            },
            { status: 400 }
        )
    }

    const formData = await request.formData()
    const state = typeof formData.get('state') === 'string' ? String(formData.get('state')) : ''
    const idToken = typeof formData.get('id_token') === 'string' ? String(formData.get('id_token')) : ''

    if (!state || !idToken) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'Faltan state o id_token.',
                    en: 'Missing state or id_token.',
                }),
            },
            { status: 400 }
        )
    }

    const context = await verifyLtiLoginContextToken(contextToken)
    if (!context) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'El contexto de login LTI es inválido o expiró.',
                    en: 'Invalid or expired LTI login context.',
                }),
            },
            { status: 400 }
        )
    }
    if (context.state !== state) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'El state LTI es inválido.',
                    en: 'Invalid LTI state.',
                }),
            },
            { status: 400 }
        )
    }
    if (context.issuer !== config.issuer || context.clientId !== config.clientId) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'issuer/client_id inesperados en el contexto LTI.',
                    en: 'Unexpected issuer/client_id in LTI context.',
                }),
            },
            { status: 403 }
        )
    }

    const payload = await verifyAndDecodeLtiIdToken(idToken, config)
    if (!payload) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'La firma o los claims de id_token LTI no son válidos.',
                    en: 'Invalid LTI id_token signature or claims.',
                }),
            },
            { status: 401 }
        )
    }

    const nonce = typeof payload.nonce === 'string' ? payload.nonce : ''
    if (!nonce || nonce !== context.nonce) {
        return NextResponse.json(
            {
                error: pickLanguageValue(lang, {
                    es: 'El nonce LTI es inválido.',
                    en: 'Invalid LTI nonce.',
                }),
            },
            { status: 401 }
        )
    }

    const identity = extractLtiIdentity(payload, config)
    if (!identity) {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'El payload de claims LTI es inválido o no es compatible.',
                en: 'Invalid or unsupported LTI claims payload.',
            }),
            lang,
            400
        )
    }

    if (identity.messageType !== 'LtiResourceLinkRequest') {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'Esta herramienta todavía no soporta lanzamientos LTI de Deep Linking.',
                en: 'This tool does not support LTI Deep Linking launches yet.',
            }),
            lang,
            400
        )
    }

    if (!identity.orgSsoId) {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'No se encontró el claim de organización wrapper en el payload LTI. Configura un custom parameter dinámico organization_id en la LMS.',
                en: 'No wrapper organization claim was found in the LTI payload. Configure a dynamic organization_id custom parameter in the LMS.',
            }),
            lang,
            403
        )
    }

    const activityMapping = await upsertLtiActivityMappingFromLaunch({
        issuer: identity.issuer,
        clientId: config.clientId,
        deploymentId: identity.deploymentId,
        contextId: identity.contextId,
        contextTitle: identity.contextTitle,
        contextLabel: identity.contextLabel,
        resourceLinkId: identity.resourceLinkId,
        resourceLinkTitle: identity.resourceLinkTitle,
        orgSsoId: identity.orgSsoId,
        orgName: identity.orgName,
    })

    const organization = await findOrCreateLtiWrapperOrganization({
        issuer: identity.issuer,
        orgSsoId: identity.orgSsoId,
        orgName: identity.orgName,
    })
    if (!organization) {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: `No existe una organización wrapper para org:${identity.orgSsoId} y la autocreación está deshabilitada.`,
                en: `No wrapper organization exists for org:${identity.orgSsoId} and auto-create is disabled.`,
            }),
            lang,
            403
        )
    }

    if (activityMapping.status === 'DISABLED') {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'Esta actividad de la LMS fue deshabilitada en la administración de mapeos LTI.',
                en: 'This LMS activity has been disabled in the LTI mapping admin.',
            }),
            lang,
            403
        )
    }

    if (!activityMapping.bot_id || activityMapping.status !== 'ACTIVE') {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'Esta actividad de la LMS todavía no está mapeada a un bot. La actividad fue registrada y está esperando configuración administrativa.',
                en: 'This LMS activity is not mapped to a bot yet. The activity was registered and is waiting for admin configuration.',
            }),
            lang,
            403
        )
    }

    if (!activityMapping.bot || activityMapping.bot.deleted_at || !activityMapping.bot.published) {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'El bot mapeado a esta actividad de la LMS no está disponible actualmente para launch.',
                en: 'The bot mapped to this LMS activity is not currently available for launch.',
            }),
            lang,
            403
        )
    }

    if (activityMapping.reporting_organization_id && !activityMapping.reporting_organization) {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: 'Esta actividad de la LMS apunta a una organización de reporting que ya no existe. Pide a un administrador que revise el mapeo LTI.',
                en: 'This LMS activity points to a reporting organization that no longer exists. Ask an administrator to review the LTI mapping.',
            }),
            lang,
            403
        )
    }

    const reportingScope = resolveLtiReportingScope({
        baseOrganizationId: organization.id,
        reportingOrganizationId: activityMapping.reporting_organization_id,
    })
    const reportingOrganization = activityMapping.reporting_organization ?? organization
    const botOrganizationAssignment = await prisma.organizationBot.findUnique({
        where: {
            organization_id_bot_id: {
                organization_id: reportingOrganization.id,
                bot_id: activityMapping.bot.id,
            },
        },
        select: {
            bot_id: true,
        },
    })
    if (!botOrganizationAssignment) {
        return ltiErrorResponse(
            pickLanguageValue(lang, {
                es: activityMapping.reporting_organization_id
                    ? 'Esta actividad de la LMS está mapeada a una organización de reporting, pero el bot seleccionado no está asignado a esa organización.'
                    : 'Esta actividad de la LMS está mapeada a un bot, pero ese bot no está asignado a la organización wrapper resuelta para este launch.',
                en: activityMapping.reporting_organization_id
                    ? 'This LMS activity is mapped to a reporting organization, but the selected bot is not assigned to that organization.'
                    : 'This LMS activity is mapped to a bot, but that bot is not assigned to the wrapper organization resolved for this launch.',
            }),
            lang,
            403
        )
    }

    const user = await createOrLinkLtiUser({
        issuer: identity.issuer,
        subject: identity.subject,
        externalUsername: identity.externalUsername,
        ltiUsername: identity.ltiUsername,
        email: identity.email,
    })

    await syncAutomaticOrganizationMembership({
        organizationId: organization.id,
        userId: user.id,
    })

    if (reportingScope.requiresAdditionalMembership) {
        await syncAutomaticOrganizationMembership({
            organizationId: reportingScope.reportingOrganizationId,
            userId: user.id,
        })
    }

    const requestContext = getRequestContext(request)
    const authSession = await createAuthSession({
        userId: user.id,
        ipAddress: requestContext.ip,
        userAgent: requestContext.userAgent,
    })

    const token = await new SignJWT({
        userId: user.id,
        username: user.username,
        role: user.role === 'ADMIN' ? 'ADMIN' : 'USER',
        sid: authSession.id,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(Math.floor(authSession.expiresAt.getTime() / 1000))
        .sign(secretKey)

    const ltiAccessScopeToken = await createLtiAccessScopeToken({
        scope: {
            userId: user.id,
            sessionId: authSession.id,
            botId: activityMapping.bot.id,
            organizationId: reportingScope.reportingOrganizationId,
            mappingId: activityMapping.id,
            issuer: identity.issuer,
            deploymentId: identity.deploymentId,
            contextId: identity.contextId,
            resourceLinkId: identity.resourceLinkId,
            ags: identity.ags,
            strict: true,
        },
        expiresAt: authSession.expiresAt,
    })

    const secureCookie = isHttpsRequest(request.nextUrl, request.headers.get('x-forwarded-proto'))
        || process.env.NODE_ENV === 'production'
    const sameSite = secureCookie ? 'none' : 'lax'
    const response = NextResponse.redirect(new URL(getChatPath(activityMapping.bot.id, {
        routeMode: 'lti_embedded',
        forceNewSession: true,
    }), request.url))
    response.cookies.set('session-token', token, {
        httpOnly: true,
        secure: secureCookie,
        sameSite,
        path: '/',
        expires: authSession.expiresAt,
    })
    response.cookies.set(getLtiAccessScopeCookieName(), ltiAccessScopeToken, {
        httpOnly: true,
        secure: secureCookie,
        sameSite,
        path: '/',
        expires: authSession.expiresAt,
    })
    response.cookies.delete('anon-session-token')
    response.cookies.delete(getLtiContextCookieName())
    return response
}
