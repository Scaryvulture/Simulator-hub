'use server';

import prisma from '@/lib/prisma';
import { verifyAdmin, verifyAdminOrOrgAdmin } from '@/lib/auth-utils';
import { revalidatePath } from 'next/cache';
import { OrgRole, type Prisma } from '@prisma/client';
import { actionFailure, actionSuccess, resolveActionErrorMessage, type ActionResult } from '@/lib/action-result';

function normalizeSsoId(value: FormDataEntryValue | null): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function resolveOrganizationUniqueConstraintMessage(error: unknown): string {
    if (!isPrismaClientKnownRequestError(error) || error.code !== 'P2002') {
        return 'Failed to save organization.';
    }

    const target = Array.isArray((error as { meta?: { target?: unknown } }).meta?.target)
        ? ((error as { meta?: { target?: unknown[] } }).meta?.target as unknown[])
        : [];
    const normalizedTarget = target.map((item) => String(item));

    if (normalizedTarget.includes('sso_id')) {
        return 'An organization with this SSO ID already exists.';
    }

    return 'Failed to save organization.';
}

function resolveMaxLogoBytes() {
    const parsed = Number(process.env.ORG_LOGO_MAX_BYTES || 1_000_000);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1_000_000;
}

function normalizePage(page: number | undefined): number {
    if (!Number.isFinite(page)) return 1;
    return Math.max(1, Math.trunc(page as number));
}

function readRequiredOrganizationName(value: FormDataEntryValue | null): string {
    if (typeof value !== 'string') {
        throw new Error('Organization name is required.');
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error('Organization name is required.');
    }
    return trimmed;
}

function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            const next = line[i + 1];
            if (inQuotes && next === '"') {
                current += '"';
                i += 1;
                continue;
            }
            inQuotes = !inQuotes;
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current.trim());
    return values;
}

function normalizeLookupKey(value: string): string {
    return value.trim().toLowerCase();
}

function normalizeHeaderKey(value: string): string {
    return normalizeLookupKey(value)
        .replace(/^\uFEFF/, '')
        .replace(/\s+/g, '_');
}

function findHeaderIndex(headers: string[], aliases: string[]): number {
    for (let i = 0; i < headers.length; i += 1) {
        if (aliases.includes(normalizeHeaderKey(headers[i]))) return i;
    }
    return -1;
}

function readCsvValue(columns: string[], index: number): string {
    if (index < 0) return '';
    return (columns[index] || '').trim();
}

function parseCsvList(value: string): string[] {
    if (!value.trim()) return [];
    return value
        .split(/[\n\r,;|]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseManualLoginValue(raw: string): { value: boolean; valid: boolean } {
    const normalized = normalizeLookupKey(raw);
    if (!normalized) return { value: true, valid: true };
    if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return { value: true, valid: true };
    if (['false', '0', 'no'].includes(normalized)) return { value: false, valid: true };
    return { value: true, valid: false };
}

type OrganizationImportHeaderIndexes = {
    name: number;
    allowManualLogin: number;
    members: number;
    bots: number;
};

function resolveOrganizationImportHeaderIndexes(headers: string[]): OrganizationImportHeaderIndexes | null {
    const name = findHeaderIndex(headers, ['organization_name', 'organization', 'org_name', 'organizacion', 'nombre_organizacion', 'name']);
    if (name < 0) return null;

    return {
        name,
        allowManualLogin: findHeaderIndex(headers, ['allow_manual_login', 'manual_login', 'permitir_login_manual']),
        members: findHeaderIndex(headers, ['members', 'member_usernames', 'miembros', 'usuarios']),
        bots: findHeaderIndex(headers, ['bots', 'bot_names', 'bots_asignados']),
    };
}

type ParsedOrganizationImportRow = {
    organizationName: string;
    allowManualLoginRaw: string;
    membersRaw: string;
    botsRaw: string;
};

function parseOrganizationImportRow(
    columns: string[],
    headerIndexes: OrganizationImportHeaderIndexes | null
): ParsedOrganizationImportRow {
    if (headerIndexes) {
        return {
            organizationName: readCsvValue(columns, headerIndexes.name),
            allowManualLoginRaw: readCsvValue(columns, headerIndexes.allowManualLogin),
            membersRaw: readCsvValue(columns, headerIndexes.members),
            botsRaw: readCsvValue(columns, headerIndexes.bots),
        };
    }

    return {
        organizationName: (columns[0] || '').trim(),
        allowManualLoginRaw: (columns[1] || '').trim(),
        membersRaw: (columns[2] || '').trim(),
        botsRaw: (columns[3] || '').trim(),
    };
}

type ScopedActor = {
    userId: string;
    role: 'ADMIN' | 'ORG_ADMIN';
};

async function requireOrganizationWriteAccess(organizationId: string): Promise<ScopedActor> {
    const actor = await verifyAdminOrOrgAdmin();
    if (actor.role === 'ADMIN') {
        return { userId: actor.userId, role: 'ADMIN' };
    }

    const membership = await prisma.organizationMember.findUnique({
        where: {
            organization_id_user_id: {
                organization_id: organizationId,
                user_id: actor.userId,
            },
        },
        select: { role: true },
    });

    if (!membership || membership.role !== 'ORG_ADMIN') {
        throw new Error('Forbidden: organization outside your scope.');
    }

    return { userId: actor.userId, role: 'ORG_ADMIN' };
}

async function resolveMemberOrganizationId(memberId: string): Promise<string> {
    const member = await prisma.organizationMember.findUnique({
        where: { id: memberId },
        select: { organization_id: true },
    });
    if (!member) {
        throw new Error('Organization member not found.');
    }
    return member.organization_id;
}

export interface OrganizationFilters {
    page?: number;
    search?: string;
}

export async function getOrganizations(filters: OrganizationFilters = {}) {
    const actor = await verifyAdminOrOrgAdmin();
    const pageSize = 9;
    const page = normalizePage(filters.page);

    const where: Prisma.OrganizationWhereInput = {};
    if (actor.role !== 'ADMIN') {
        if (actor.orgAdminOrganizationIds.length === 0) {
            return {
                organizations: [],
                totalCount: 0,
                totalPages: 0,
                page,
                viewer_role: 'ORG_ADMIN' as const,
                can_manage_catalog: false,
            };
        }
        where.id = { in: actor.orgAdminOrganizationIds };
    }
    if (filters.search) {
        where.OR = [
            { name: { contains: filters.search } },
            { sso_id: { contains: filters.search } },
        ];
    }

    const [orgs, totalCount] = await Promise.all([
        prisma.organization.findMany({
            where,
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
                id: true,
                name: true,
                logo: true,
                sso_id: true,
                allow_manual_login: true,
                created_at: true,
                _count: {
                    select: { members: true, bots: true }
                }
            },
        }),
        prisma.organization.count({ where })
    ]);

    // Convert Buffer logo to Base64 string for frontend
    const safeOrgs = orgs.map(org => ({
        ...org,
        logo: org.logo ? `data:image/png;base64,${Buffer.from(org.logo).toString('base64')}` : null
    }));

    return {
        organizations: safeOrgs,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        page,
        viewer_role: actor.role === 'ADMIN' ? 'ADMIN' as const : 'ORG_ADMIN' as const,
        can_manage_catalog: actor.role === 'ADMIN',
    };
}

export async function getAllOrganizations() { // For dropdowns
    await verifyAdmin();
    return prisma.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
}

export async function getOrganization(id: string) {
    await requireOrganizationWriteAccess(id);
    const org = await prisma.organization.findUnique({
        where: { id },
        include: {
            members: {
                select: {
                    id: true,
                    organization_id: true,
                    user_id: true,
                    role: true,
                    user: {
                        select: {
                            id: true,
                            username: true,
                            email: true,
                        },
                    },
                },
            },
            bots: {
                select: {
                    organization_id: true,
                    bot_id: true,
                    bot: {
                        select: {
                            id: true,
                            name: true,
                            bot_type: true,
                            published: true,
                        },
                    },
                },
            },
        }
    });

    if (!org) return null;

    return {
        ...org,
        logo: org.logo ? `data:image/png;base64,${Buffer.from(org.logo).toString('base64')}` : null
    };
}

export async function createOrganization(formData: FormData): Promise<ActionResult<null>> {
    try {
        await verifyAdmin();

        const name = readRequiredOrganizationName(formData.get('name'));
        const sso_id = normalizeSsoId(formData.get('sso_id'));
        const allow_manual_login = formData.get('allow_manual_login') === 'true';
        const logoFile = formData.get('logo') as File | null;

        let logoBytes: Uint8Array<ArrayBuffer> | null = null;
        if (logoFile && logoFile.size > 0) {
            try {
                if (logoFile.size > resolveMaxLogoBytes()) {
                    return actionFailure('Logo file is too large');
                }
                if (logoFile.type && !logoFile.type.startsWith('image/')) {
                    return actionFailure('Logo must be an image file');
                }
                const arrayBuffer = await logoFile.arrayBuffer();
                logoBytes = new Uint8Array(arrayBuffer as ArrayBuffer);
            } catch (e) {
                console.error('Error processing logo file', e);
                return actionFailure(resolveActionErrorMessage(e, 'Error processing logo file'));
            }
        }

        try {
            await prisma.organization.create({
                data: {
                    name,
                    sso_id,
                    allow_manual_login,
                    logo: logoBytes
                }
            });
        } catch (e: unknown) {
            console.error('Error creating organization:', e);
            return actionFailure(resolveOrganizationUniqueConstraintMessage(e));
        }

        revalidatePath('/admin/organizations');
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('createOrganization action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to create organization.'));
    }
}

export async function updateOrganization(id: string, formData: FormData): Promise<ActionResult<null>> {
    try {
        await requireOrganizationWriteAccess(id);

        const name = readRequiredOrganizationName(formData.get('name'));
        const sso_id = normalizeSsoId(formData.get('sso_id'));
        const allow_manual_login = formData.get('allow_manual_login') === 'true';
        const logoFile = formData.get('logo') as File | null;

        const data: Prisma.OrganizationUpdateInput = {
            name,
            sso_id, // null clears SSO ID
            allow_manual_login
        };

        if (logoFile && logoFile.size > 0) {
            if (logoFile.size > resolveMaxLogoBytes()) {
                return actionFailure('Logo file is too large');
            }
            if (logoFile.type && !logoFile.type.startsWith('image/')) {
                return actionFailure('Logo must be an image file');
            }
            const arrayBuffer = await logoFile.arrayBuffer();
            data.logo = new Uint8Array(arrayBuffer as ArrayBuffer);
        }

        try {
            await prisma.organization.update({
                where: { id },
                data
            });
        } catch (error: unknown) {
            return actionFailure(resolveOrganizationUniqueConstraintMessage(error));
        }

        revalidatePath(`/admin/organizations/${id}`);
        revalidatePath('/admin/organizations');
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('updateOrganization action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to update organization.'));
    }
}

export async function deleteOrganization(id: string): Promise<ActionResult<null>> {
    try {
        await verifyAdmin();
        await prisma.organization.delete({ where: { id } });
        revalidatePath('/admin/organizations');
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('deleteOrganization action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to delete organization.'));
    }
}

// Membership Actions
export async function addMemberToOrg(orgId: string, userId: string, role: OrgRole = 'MEMBER'): Promise<ActionResult<null>> {
    try {
        await requireOrganizationWriteAccess(orgId);

        // Check if constraints?
        try {
            await prisma.organizationMember.create({
                data: {
                    organization_id: orgId,
                    user_id: userId,
                    role
                }
            });
            revalidatePath(`/admin/organizations/${orgId}`);
            return actionSuccess(null);
        } catch {
            return actionFailure('Member already exists or invalid data');
        }
    } catch (error: unknown) {
        console.error('addMemberToOrg action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to add member.'));
    }
}

export async function removeMemberFromOrg(memberId: string): Promise<ActionResult<null>> {
    try {
        const orgId = await resolveMemberOrganizationId(memberId);
        await requireOrganizationWriteAccess(orgId);
        await prisma.organizationMember.delete({ where: { id: memberId } });
        // This requires revalidating the org page... we assume called from there
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('removeMemberFromOrg action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to remove member.'));
    }
}

export async function updateMemberRole(memberId: string, role: OrgRole): Promise<ActionResult<null>> {
    try {
        const orgId = await resolveMemberOrganizationId(memberId);
        await requireOrganizationWriteAccess(orgId);
        await prisma.organizationMember.update({
            where: { id: memberId },
            data: { role }
        });
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('updateMemberRole action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to update member role.'));
    }
}

// Bot Actions
export async function addBotToOrg(orgId: string, botId: string): Promise<ActionResult<null>> {
    try {
        await requireOrganizationWriteAccess(orgId);
        try {
            await prisma.organizationBot.create({
                data: {
                    organization_id: orgId,
                    bot_id: botId
                }
            });
            revalidatePath(`/admin/organizations/${orgId}`);
            return actionSuccess(null);
        } catch {
            return actionFailure('Bot already assigned');
        }
    } catch (error: unknown) {
        console.error('addBotToOrg action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to assign bot.'));
    }
}

export async function removeBotFromOrg(orgBotId: string): Promise<ActionResult<null>> { // Actually needs orgId_botId or composite
    void orgBotId;
    return actionFailure('removeBotFromOrg is deprecated. Use removeBotFromOrgByComposite(orgId, botId).');
}

export async function removeBotFromOrgByComposite(orgId: string, botId: string): Promise<ActionResult<null>> {
    try {
        await requireOrganizationWriteAccess(orgId);
        await prisma.organizationBot.delete({
            where: {
                organization_id_bot_id: {
                    organization_id: orgId,
                    bot_id: botId
                }
            }
        });
        revalidatePath(`/admin/organizations/${orgId}`);
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('removeBotFromOrgByComposite action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to remove bot from organization.'));
    }
}

export async function updateBotOrganizations(botId: string, orgIds: string[]): Promise<ActionResult<null>> {
    try {
        const actor = await verifyAdminOrOrgAdmin();
        if (actor.role !== 'ADMIN') {
            return actionFailure('Forbidden: only global admins can update bot organization assignments.');
        }

        // Transactional update
        await prisma.$transaction(async (tx) => {
            // Remove all existing for this bot
            await tx.organizationBot.deleteMany({
                where: { bot_id: botId }
            });

            if (orgIds.length > 0) {
                await tx.organizationBot.createMany({
                    data: orgIds.map(orgId => ({
                        bot_id: botId,
                        organization_id: orgId
                    }))
                });
            }
        });

        revalidatePath('/admin/bots');
        revalidatePath(`/admin/bots/${botId}`);
        return actionSuccess(null);
    } catch (error: unknown) {
        console.error('updateBotOrganizations action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to update bot organizations.'));
    }
}

type BotOrgImportData = {
    total: number;
    added: number;
    errors: string[];
};

export async function importBotOrganizationsFromCSV(botId: string, formData: FormData): Promise<ActionResult<BotOrgImportData>> {
    try {
        const actor = await verifyAdminOrOrgAdmin();
        if (actor.role !== 'ADMIN') {
            return actionFailure('Forbidden: only global admins can import bot organization assignments.');
        }
        const file = formData.get('file') as File;
        if (!file) return actionFailure('No file provided');

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
        if (lines.length === 0) {
            return actionFailure('CSV is empty');
        }
        const results: BotOrgImportData = {
            total: 0,
            added: 0,
            errors: [],
        };

        const firstRow = parseCsvLine(lines[0]);
        if (firstRow.length > 0) {
            firstRow[0] = firstRow[0].replace(/^\uFEFF/, '');
        }
        const startIndex = firstRow.some((cell) => normalizeHeaderKey(cell).includes('organization')) ? 1 : 0;

        // 1. Prefetch all orgs for lookup (O(1) access)
        // Scalability: For huge datasets, this might need pagination, but for <10k orgs this is fine.
        const allOrgs = await prisma.organization.findMany({ select: { id: true, name: true } });
        const orgMap = new Map(allOrgs.map((o) => [normalizeLookupKey(o.name), o.id]));

        // 2. Prefetch existing assignments to avoid duplicates (and single queries)
        const existingAssignments = await prisma.organizationBot.findMany({
            where: { bot_id: botId },
            select: { organization_id: true }
        });
        const existingOrgIds = new Set(existingAssignments.map((assignment) => assignment.organization_id));

        const newAssignments: { bot_id: string; organization_id: string }[] = [];

        // 3. Process lines in memory
        for (let i = startIndex; i < lines.length; i++) {
            const columns = parseCsvLine(lines[i]);
            if (columns.length > 0) {
                columns[0] = columns[0].replace(/^\uFEFF/, '');
            }
            const orgName = (columns[0] || '').trim();
            if (!orgName) continue;

            results.total++;
            const orgId = orgMap.get(normalizeLookupKey(orgName));

            if (orgId) {
                if (!existingOrgIds.has(orgId)) {
                    // Check if we already staged this one (handle duplicates in CSV)
                    const alreadyStaged = newAssignments.some((assignment) => assignment.organization_id === orgId);
                    if (!alreadyStaged) {
                        newAssignments.push({
                            bot_id: botId,
                            organization_id: orgId
                        });
                    }
                }
            } else {
                results.errors.push(`Line ${i + 1}: Organization '${orgName}' not found`);
            }
        }

        // 4. Batch Create
        if (newAssignments.length > 0) {
            try {
                await prisma.organizationBot.createMany({
                    data: newAssignments
                });
                results.added = newAssignments.length;
            } catch (e: unknown) {
                console.error("Bulk create error:", e);
                const message = e instanceof Error ? e.message : 'Unknown error';
                results.errors.push(`Batch write failed: ${message}`);
                results.added = 0;
            }
        }

        revalidatePath(`/admin/bots/${botId}`);
        return actionSuccess(results);
    } catch (error: unknown) {
        console.error('importBotOrganizationsFromCSV action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to import bot organizations.'));
    }
}

type OrganizationImportData = {
    total: number;
    created: number;
    updated: number;
    member_links: number;
    bot_links: number;
    errors: string[];
};

export async function importOrganizationsFromCSV(formData: FormData): Promise<ActionResult<OrganizationImportData>> {
    try {
        const actor = await verifyAdminOrOrgAdmin();
        if (actor.role !== 'ADMIN') {
            return actionFailure('Forbidden: only global admins can import organizations.');
        }
        const file = formData.get('file') as File;
        if (!file) return actionFailure('No file provided');

        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
        if (lines.length === 0) {
            return actionFailure('CSV is empty');
        }

        const firstRow = parseCsvLine(lines[0]);
        if (firstRow.length > 0) {
            firstRow[0] = firstRow[0].replace(/^\uFEFF/, '');
        }
        const headerIndexes = resolveOrganizationImportHeaderIndexes(firstRow);
        const startIndex = headerIndexes ? 1 : 0;

        const [allOrganizations, allUsers, allBots] = await Promise.all([
            prisma.organization.findMany({
                select: { id: true, name: true, allow_manual_login: true },
            }),
            prisma.appUser.findMany({
                select: { id: true, username: true },
            }),
            prisma.bot.findMany({
                where: { deleted_at: null },
                select: { id: true, name: true },
            }),
        ]);

        const orgMap = new Map<string, Array<{ id: string; allow_manual_login: boolean }>>();
        for (const org of allOrganizations) {
            const key = normalizeLookupKey(org.name);
            const bucket = orgMap.get(key) || [];
            bucket.push({ id: org.id, allow_manual_login: org.allow_manual_login });
            orgMap.set(key, bucket);
        }

        const userMap = new Map(allUsers.map((u) => [normalizeLookupKey(u.username), u.id]));
        const botMap = new Map<string, string[]>();
        for (const bot of allBots) {
            const key = normalizeLookupKey(bot.name);
            const bucket = botMap.get(key) || [];
            bucket.push(bot.id);
            botMap.set(key, bucket);
        }

        const memberLinks = new Set<string>();
        const botLinks = new Set<string>();
        const results: OrganizationImportData = {
            total: 0,
            created: 0,
            updated: 0,
            member_links: 0,
            bot_links: 0,
            errors: [],
        };

        for (let i = startIndex; i < lines.length; i += 1) {
            const columns = parseCsvLine(lines[i]);
            if (columns.length > 0) {
                columns[0] = columns[0].replace(/^\uFEFF/, '');
            }

            const parsed = parseOrganizationImportRow(columns, headerIndexes);
            const orgName = parsed.organizationName.trim();
            if (!orgName) continue;

            results.total += 1;

            const allowParsed = parseManualLoginValue(parsed.allowManualLoginRaw);
            if (!allowParsed.valid) {
                results.errors.push(`Line ${i + 1}: Invalid allow_manual_login value '${parsed.allowManualLoginRaw}'. Defaulted to true.`);
            }

            const orgKey = normalizeLookupKey(orgName);
            const existing = orgMap.get(orgKey) || [];
            if (existing.length > 1) {
                results.errors.push(`Line ${i + 1}: Organization '${orgName}' is duplicated in database. Resolve duplicates first.`);
                continue;
            }

            let orgId: string;
            if (existing.length === 1) {
                orgId = existing[0].id;
                if (existing[0].allow_manual_login !== allowParsed.value) {
                    await prisma.organization.update({
                        where: { id: orgId },
                        data: { allow_manual_login: allowParsed.value },
                    });
                }
                results.updated += 1;
            } else {
                const created = await prisma.organization.create({
                    data: {
                        name: orgName,
                        allow_manual_login: allowParsed.value,
                    },
                    select: { id: true },
                });
                orgId = created.id;
                orgMap.set(orgKey, [{ id: orgId, allow_manual_login: allowParsed.value }]);
                results.created += 1;
            }

            const members = parseCsvList(parsed.membersRaw);
            for (const member of members) {
                const userId = userMap.get(normalizeLookupKey(member));
                if (!userId) {
                    results.errors.push(`Line ${i + 1}: User '${member}' not found (skipped).`);
                    continue;
                }
                memberLinks.add(`${orgId}::${userId}`);
            }

            const bots = parseCsvList(parsed.botsRaw);
            for (const botName of bots) {
                const matches = botMap.get(normalizeLookupKey(botName)) || [];
                if (matches.length === 0) {
                    results.errors.push(`Line ${i + 1}: Bot '${botName}' not found (skipped).`);
                    continue;
                }
                if (matches.length > 1) {
                    results.errors.push(`Line ${i + 1}: Bot '${botName}' is duplicated by name (skipped).`);
                    continue;
                }
                botLinks.add(`${orgId}::${matches[0]}`);
            }
        }

        if (memberLinks.size > 0) {
            const createdMembers = await prisma.organizationMember.createMany({
                data: Array.from(memberLinks).map((link) => {
                    const [organization_id, user_id] = link.split('::');
                    return {
                        organization_id,
                        user_id,
                        role: 'MEMBER' as OrgRole,
                    };
                }),
                skipDuplicates: true,
            });
            results.member_links = createdMembers.count;
        }

        if (botLinks.size > 0) {
            const createdBots = await prisma.organizationBot.createMany({
                data: Array.from(botLinks).map((link) => {
                    const [organization_id, bot_id] = link.split('::');
                    return {
                        organization_id,
                        bot_id,
                    };
                }),
                skipDuplicates: true,
            });
            results.bot_links = createdBots.count;
        }

        revalidatePath('/admin/organizations');
        return actionSuccess(results);
    } catch (error: unknown) {
        console.error('importOrganizationsFromCSV action failed:', error);
        return actionFailure(resolveActionErrorMessage(error, 'Failed to import organizations.'));
    }
}

function isPrismaClientKnownRequestError(error: unknown): error is { code: string } {
    return typeof error === 'object'
        && error !== null
        && 'code' in error
        && typeof (error as { code?: unknown }).code === 'string';
}
