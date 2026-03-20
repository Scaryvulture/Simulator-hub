import 'server-only'
import type { Prisma } from '@prisma/client'

export const APP_USER_AUDIT_IDENTITY_SELECT = {
    id: true,
    username: true,
    lti_issuer: true,
    lti_subject: true,
    lti_username: true,
} satisfies Prisma.AppUserSelect

type AppUserAuditIdentitySource = Prisma.AppUserGetPayload<{
    select: typeof APP_USER_AUDIT_IDENTITY_SELECT
}>

export type AppUserAuditIdentity = {
    appUserId: string
    appUsername: string
    totaraUserId: string | null
    totaraUsername: string | null
    ltiIssuer: string | null
}

export function toAppUserAuditIdentity(user: AppUserAuditIdentitySource): AppUserAuditIdentity {
    return {
        appUserId: user.id,
        appUsername: user.username,
        totaraUserId: user.lti_subject,
        totaraUsername: user.lti_username,
        ltiIssuer: user.lti_issuer,
    }
}

export function createAppUserAuditIdentityMap(
    users: AppUserAuditIdentitySource[]
): Map<string, AppUserAuditIdentity> {
    const identities = new Map<string, AppUserAuditIdentity>()
    for (const user of users) {
        identities.set(user.id, toAppUserAuditIdentity(user))
    }
    return identities
}

export function buildAppUserIdentitySearchWhere(
    term: string,
    options?: {
        includeEmail?: boolean
        includeAppUsername?: boolean
        includeTotaraUserId?: boolean
        includeTotaraUsername?: boolean
    }
): Prisma.AppUserWhereInput {
    const normalized = term.trim()
    const orConditions: Prisma.AppUserWhereInput[] = []

    if (options?.includeAppUsername !== false) {
        orConditions.push({ username: { contains: normalized } })
    }
    if (options?.includeTotaraUserId !== false) {
        orConditions.push({ lti_subject: { contains: normalized } })
    }
    if (options?.includeTotaraUsername !== false) {
        orConditions.push({ lti_username: { contains: normalized } })
    }

    if (options?.includeEmail) {
        orConditions.push({ email: { contains: normalized } })
    }

    return {
        OR: orConditions,
    }
}
