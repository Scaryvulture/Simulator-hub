import 'server-only'
import prisma from '@/lib/prisma'
import {
    buildLtiWrapperOrganizationName,
    normalizeLtiDeploymentId,
    normalizeWhitespace,
    shouldAutoCreateLtiWrapperOrganizations,
} from '@/lib/lti-activity-mapping-core'

export async function upsertLtiActivityMappingFromLaunch(params: {
    issuer: string
    clientId: string
    deploymentId?: string | null
    contextId?: string | null
    contextTitle?: string | null
    contextLabel?: string | null
    resourceLinkId: string
    resourceLinkTitle?: string | null
    orgSsoId?: string | null
    orgName?: string | null
}) {
    const deploymentId = normalizeLtiDeploymentId(params.deploymentId)
    const contextId = typeof params.contextId === 'string' ? params.contextId.trim() : ''
    const contextTitle = typeof params.contextTitle === 'string' ? normalizeWhitespace(params.contextTitle) : null
    const contextLabel = typeof params.contextLabel === 'string' ? normalizeWhitespace(params.contextLabel) : null
    const resourceLinkTitle = typeof params.resourceLinkTitle === 'string'
        ? normalizeWhitespace(params.resourceLinkTitle)
        : null
    const orgName = typeof params.orgName === 'string' ? normalizeWhitespace(params.orgName) : null
    const now = new Date()

    return await prisma.ltiActivityMapping.upsert({
        where: {
            issuer_client_id_deployment_id_context_id_resource_link_id: {
                issuer: params.issuer,
                client_id: params.clientId,
                deployment_id: deploymentId,
                context_id: contextId,
                resource_link_id: params.resourceLinkId,
            },
        },
        create: {
            issuer: params.issuer,
            client_id: params.clientId,
            deployment_id: deploymentId,
            context_id: contextId,
            context_title: contextTitle,
            context_label: contextLabel,
            resource_link_id: params.resourceLinkId,
            resource_link_title: resourceLinkTitle,
            org_sso_id: params.orgSsoId?.trim() || null,
            org_name: orgName,
            last_seen_at: now,
        },
        update: {
            context_title: contextTitle,
            context_label: contextLabel,
            resource_link_title: resourceLinkTitle,
            org_sso_id: params.orgSsoId?.trim() || null,
            org_name: orgName,
            last_seen_at: now,
        },
        include: {
            bot: {
                select: {
                    id: true,
                    name: true,
                    published: true,
                    deleted_at: true,
                },
            },
            reporting_organization: {
                select: {
                    id: true,
                    name: true,
                    sso_id: true,
                    allow_manual_login: true,
                },
            },
        },
    })
}

export async function findOrCreateLtiWrapperOrganization(params: {
    issuer: string
    orgSsoId: string
    orgName?: string | null
}) {
    const existing = await prisma.organization.findUnique({
        where: { sso_id: params.orgSsoId },
        select: {
            id: true,
            name: true,
            sso_id: true,
            allow_manual_login: true,
        },
    })

    const fallbackName = buildLtiWrapperOrganizationName({
        issuer: params.issuer,
        orgSsoId: params.orgSsoId,
    })
    const desiredName = buildLtiWrapperOrganizationName(params)

    if (existing) {
        if (existing.name === fallbackName && existing.name !== desiredName) {
            return await prisma.organization.update({
                where: { id: existing.id },
                data: { name: desiredName },
                select: {
                    id: true,
                    name: true,
                    sso_id: true,
                    allow_manual_login: true,
                },
            })
        }
        return existing
    }

    if (!shouldAutoCreateLtiWrapperOrganizations()) {
        return null
    }

    return await prisma.organization.create({
        data: {
            name: desiredName,
            sso_id: params.orgSsoId,
            allow_manual_login: false,
        },
        select: {
            id: true,
            name: true,
            sso_id: true,
            allow_manual_login: true,
        },
    })
}

export {
    buildLtiWrapperOrganizationName,
    normalizeLtiDeploymentId,
    shouldAutoCreateLtiWrapperOrganizations,
}
