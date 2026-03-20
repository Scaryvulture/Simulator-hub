'use server';

import { revalidatePath } from 'next/cache';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/auth-utils';
import { actionFailure, actionSuccess, type ActionResult } from '@/lib/action-result';
import type { Prisma, LtiActivityMappingStatus } from '@prisma/client';
import { getServerLanguage } from '@/lib/server-language';
import { buildLtiEligibleBotWhere } from '@/lib/lti-bot-eligibility';

export type LtiMappingFilters = {
    status?: 'ALL' | LtiActivityMappingStatus
    search?: string
    page?: number
    skipAuthCheck?: boolean
}

const LTI_MAPPING_PAGE_SIZE = 25
const LTI_OPTION_LIMIT = 30

function normalizeStatus(value: string | undefined): 'ALL' | LtiActivityMappingStatus {
    if (value === 'PENDING' || value === 'ACTIVE' || value === 'DISABLED') return value
    return 'ALL'
}

function normalizePage(value: number | undefined): number {
    if (!Number.isFinite(value)) return 1
    return Math.max(1, Math.trunc(value as number))
}

function uniqueNonEmptyIds(values: string[] | undefined): string[] {
    if (!values) return []
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export async function getLtiActivityMappings(filters: LtiMappingFilters = {}) {
    if (!filters.skipAuthCheck) {
        await verifyAdmin();
    }

    const status = normalizeStatus(filters.status);
    const search = filters.search?.trim() || '';
    const requestedPage = normalizePage(filters.page);
    const where: Prisma.LtiActivityMappingWhereInput = {};

    if (status !== 'ALL') {
        where.status = status;
    }

    if (search) {
        where.OR = [
            { issuer: { contains: search, mode: 'insensitive' } },
            { context_id: { contains: search, mode: 'insensitive' } },
            { context_title: { contains: search, mode: 'insensitive' } },
            { context_label: { contains: search, mode: 'insensitive' } },
            { resource_link_id: { contains: search, mode: 'insensitive' } },
            { resource_link_title: { contains: search, mode: 'insensitive' } },
            { org_sso_id: { contains: search, mode: 'insensitive' } },
            { org_name: { contains: search, mode: 'insensitive' } },
            { reporting_organization: { is: { name: { contains: search, mode: 'insensitive' } } } },
            { bot: { is: { name: { contains: search, mode: 'insensitive' } } } },
        ];
    }

    const totalCount = await prisma.ltiActivityMapping.count({ where })
    const totalPages = Math.max(1, Math.ceil(totalCount / LTI_MAPPING_PAGE_SIZE))
    const page = Math.min(requestedPage, totalPages)
    const items = await prisma.ltiActivityMapping.findMany({
        where,
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
                },
            },
        },
        orderBy: [
            { last_seen_at: 'desc' },
            { created_at: 'desc' },
        ],
        skip: (page - 1) * LTI_MAPPING_PAGE_SIZE,
        take: LTI_MAPPING_PAGE_SIZE,
    })

    return {
        items,
        totalCount,
        totalPages,
        page,
        pageSize: LTI_MAPPING_PAGE_SIZE,
    }
}

export async function getLtiEligibleBotOptions(params?: {
    search?: string
    includeIds?: string[]
    limit?: number
    skipAuthCheck?: boolean
}) {
    if (!params?.skipAuthCheck) {
        await verifyAdmin()
    }

    const search = params?.search?.trim() || ''
    const includeIds = uniqueNonEmptyIds(params?.includeIds)
    const limit = Math.min(Math.max(params?.limit ?? LTI_OPTION_LIMIT, 1), 100)

    const [selectedBots, candidateBots] = await Promise.all([
        includeIds.length > 0
            ? prisma.bot.findMany({
                where: buildLtiEligibleBotWhere({
                    id: { in: includeIds },
                    deleted_at: null,
                }),
                select: {
                    id: true,
                    name: true,
                    published: true,
                },
            })
            : Promise.resolve([]),
        prisma.bot.findMany({
            where: buildLtiEligibleBotWhere({
                deleted_at: null,
                ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
            }),
            select: {
                id: true,
                name: true,
                published: true,
            },
            orderBy: { name: 'asc' },
            take: limit,
        }),
    ])

    const merged = new Map<string, (typeof candidateBots)[number]>()
    for (const bot of [...selectedBots, ...candidateBots]) {
        merged.set(bot.id, bot)
    }

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function getLtiReportingOrganizationOptions(params?: {
    search?: string
    includeIds?: string[]
    limit?: number
    skipAuthCheck?: boolean
}) {
    if (!params?.skipAuthCheck) {
        await verifyAdmin()
    }

    const search = params?.search?.trim() || ''
    const includeIds = uniqueNonEmptyIds(params?.includeIds)
    const limit = Math.min(Math.max(params?.limit ?? LTI_OPTION_LIMIT, 1), 100)

    const [selectedOrganizations, candidateOrganizations] = await Promise.all([
        includeIds.length > 0
            ? prisma.organization.findMany({
                where: { id: { in: includeIds } },
                select: {
                    id: true,
                    name: true,
                },
            })
            : Promise.resolve([]),
        prisma.organization.findMany({
            where: search
                ? { name: { contains: search, mode: 'insensitive' } }
                : {},
            select: {
                id: true,
                name: true,
            },
            orderBy: { name: 'asc' },
            take: limit,
        }),
    ])

    const merged = new Map<string, (typeof candidateOrganizations)[number]>()
    for (const organization of [...selectedOrganizations, ...candidateOrganizations]) {
        merged.set(organization.id, organization)
    }

    return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name))
}

export async function saveLtiActivityMapping(formData: FormData): Promise<ActionResult<null>> {
    await verifyAdmin();
    const lang = await getServerLanguage();
    const copy = lang === 'es'
        ? {
            mappingRequired: 'El identificador del mapeo es obligatorio.',
            mappingUnavailable: 'El mapeo LTI seleccionado ya no existe.',
            botUnavailable: 'El bot seleccionado no está disponible para launch LTI.',
            reportingUnavailable: 'La organización de reporting seleccionada no está disponible.',
            wrapperUnavailable: 'No se encontró la organización wrapper detectada para esta actividad. Vuelve a lanzar la actividad desde la LMS o elige una organización de reporting.',
        }
        : {
            mappingRequired: 'Mapping id is required.',
            mappingUnavailable: 'The selected LTI mapping no longer exists.',
            botUnavailable: 'Selected bot is not available for LTI launch.',
            reportingUnavailable: 'Selected reporting organization is not available.',
            wrapperUnavailable: 'No detected wrapper organization was found for this activity. Launch the activity from the LMS again or choose a reporting organization.',
        };

    const mappingId = typeof formData.get('mappingId') === 'string' ? String(formData.get('mappingId')).trim() : ''
    const botId = typeof formData.get('botId') === 'string' ? String(formData.get('botId')).trim() : ''
    const reportingOrganizationId = typeof formData.get('reportingOrganizationId') === 'string'
        ? String(formData.get('reportingOrganizationId')).trim()
        : ''
    if (!mappingId) {
        return actionFailure(copy.mappingRequired);
    }

    const mapping = await prisma.ltiActivityMapping.findUnique({
        where: { id: mappingId },
        select: {
            id: true,
            org_sso_id: true,
        },
    });
    if (!mapping) {
        return actionFailure(copy.mappingUnavailable);
    }

    if (botId) {
        const bot = await prisma.bot.findFirst({
            where: buildLtiEligibleBotWhere({
                id: botId,
                deleted_at: null,
            }),
            select: { id: true },
        });
        if (!bot) {
            return actionFailure(copy.botUnavailable);
        }
    }

    if (reportingOrganizationId) {
        const organization = await prisma.organization.findUnique({
            where: { id: reportingOrganizationId },
            select: { id: true },
        });
        if (!organization) {
            return actionFailure(copy.reportingUnavailable);
        }
    }

    let effectiveOrganizationId: string | null = null;
    if (reportingOrganizationId) {
        effectiveOrganizationId = reportingOrganizationId;
    } else if (botId && mapping.org_sso_id) {
        const wrapperOrganization = await prisma.organization.findUnique({
            where: { sso_id: mapping.org_sso_id },
            select: { id: true },
        });
        effectiveOrganizationId = wrapperOrganization?.id ?? null;
        if (!effectiveOrganizationId) {
            return actionFailure(copy.wrapperUnavailable);
        }
    }

    if (botId && effectiveOrganizationId) {
        const assignment = await prisma.organizationBot.findUnique({
            where: {
                organization_id_bot_id: {
                    organization_id: effectiveOrganizationId,
                    bot_id: botId,
                },
            },
            select: { bot_id: true },
        });

        if (!assignment) {
            await prisma.organizationBot.create({
                data: {
                    organization_id: effectiveOrganizationId,
                    bot_id: botId,
                },
            });
        }
    }

    await prisma.ltiActivityMapping.update({
        where: { id: mappingId },
        data: {
            bot_id: botId || null,
            reporting_organization_id: reportingOrganizationId || null,
            status: botId ? 'ACTIVE' : 'PENDING',
        },
    });

    revalidatePath('/admin/lti');
    return actionSuccess(null);
}

export async function disableLtiActivityMapping(formData: FormData): Promise<ActionResult<null>> {
    await verifyAdmin();
    const lang = await getServerLanguage();
    const copy = lang === 'es'
        ? {
            mappingRequired: 'El identificador del mapeo es obligatorio.',
            mappingUnavailable: 'El mapeo LTI seleccionado ya no existe.',
        }
        : {
            mappingRequired: 'Mapping id is required.',
            mappingUnavailable: 'The selected LTI mapping no longer exists.',
        }

    const mappingId = typeof formData.get('mappingId') === 'string' ? String(formData.get('mappingId')).trim() : ''
    if (!mappingId) {
        return actionFailure(copy.mappingRequired);
    }

    const mapping = await prisma.ltiActivityMapping.findUnique({
        where: { id: mappingId },
        select: { id: true },
    })
    if (!mapping) {
        return actionFailure(copy.mappingUnavailable)
    }

    await prisma.ltiActivityMapping.update({
        where: { id: mappingId },
        data: {
            status: 'DISABLED',
        },
    });

    revalidatePath('/admin/lti');
    return actionSuccess(null);
}
