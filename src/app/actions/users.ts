'use server';

import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { verifyAdmin } from '@/lib/auth-utils';
import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { buildAppUserIdentitySearchWhere } from '@/lib/user-audit-identity';
import { normalizePlatformRole, type PlatformRole } from '@/lib/platform-role';

const SAFE_USER_SELECT = {
    id: true,
    username: true,
    email: true,
    lti_issuer: true,
    lti_subject: true,
    lti_username: true,
    role: true,
    created_at: true,
} as const;

function normalizeOptionalEmail(email?: string): string | null | undefined {
    if (email === undefined) return undefined;
    const normalized = email.trim().toLowerCase();
    return normalized ? normalized : null;
}

function uniqueNonEmpty(values: string[] | undefined): string[] | undefined {
    if (!values) return undefined;
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePage(page: number | undefined): number {
    if (!Number.isFinite(page)) return 1;
    return Math.max(1, Math.trunc(page as number));
}

function toUserActionError(error: unknown, fallback: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
            const target = Array.isArray(error.meta?.target)
                ? error.meta.target.join(', ')
                : String(error.meta?.target ?? '');

            if (target.includes('username')) {
                return new Error('El nombre de usuario ya existe.');
            }
            if (target.includes('email')) {
                return new Error('El email ya existe.');
            }
            return new Error('Ya existe un registro con esos datos únicos.');
        }
        if (error.code === 'P2003') {
            return new Error('Referencia inválida: revisa organizaciones o bots asignados.');
        }
        if (error.code === 'P2025') {
            return new Error('Registro no encontrado.');
        }
    }

    if (error instanceof Error) return error;
    return new Error(fallback);
}

type ImportRole = 'ADMIN' | 'ORG_ADMIN' | 'USER';
type PlatformUserRole = PlatformRole;

type CsvColumnIndexes = {
    username: number;
    email: number;
    password: number;
    role: number;
    organizationName: number;
};

type ParsedImportRow = {
    username: string;
    email: string;
    password: string;
    roleRaw: string;
    organizationName: string;
};

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

function resolveCsvHeaderIndexes(headers: string[]): CsvColumnIndexes | null {
    const username = findHeaderIndex(headers, ['username', 'user', 'usuario']);
    if (username < 0) return null;

    return {
        username,
        email: findHeaderIndex(headers, ['email', 'mail', 'correo', 'correo_electronico']),
        password: findHeaderIndex(headers, ['password', 'pass', 'clave', 'contrasena']),
        role: findHeaderIndex(headers, ['role', 'rol']),
        organizationName: findHeaderIndex(headers, ['organization_name', 'organization', 'org', 'organizacion']),
    };
}

function readCsvValue(columns: string[], index: number): string {
    if (index < 0) return '';
    return (columns[index] || '').trim();
}

function parseImportRole(rawValue: string): ImportRole | null {
    const normalized = normalizeHeaderKey(rawValue).toUpperCase();
    if (!normalized) return 'USER';

    if (normalized === 'ADMIN') return 'ADMIN';
    if (normalized === 'USER' || normalized === 'USUARIO' || normalized === 'MEMBER' || normalized === 'MIEMBRO') {
        return 'USER';
    }
    if (
        normalized === 'ORG_ADMIN'
        || normalized === 'ORGADMIN'
        || normalized === 'ADMIN_ORG'
        || normalized === 'ADMIN_ORGANIZACION'
    ) {
        return 'ORG_ADMIN';
    }

    return null;
}

function parseCsvUserRow(columns: string[], headerIndexes: CsvColumnIndexes | null): ParsedImportRow | null {
    if (headerIndexes) {
        return {
            username: readCsvValue(columns, headerIndexes.username),
            email: readCsvValue(columns, headerIndexes.email),
            password: readCsvValue(columns, headerIndexes.password),
            roleRaw: readCsvValue(columns, headerIndexes.role) || 'USER',
            organizationName: readCsvValue(columns, headerIndexes.organizationName),
        };
    }

    if (columns.length < 2) return null;

    const username = (columns[0] || '').trim();
    let email = '';
    let password = '';
    let roleRaw = 'USER';
    let organizationName = '';

    if (columns.length >= 5) {
        email = (columns[1] || '').trim();
        password = (columns[2] || '').trim();
        roleRaw = (columns[3] || '').trim() || 'USER';
        organizationName = (columns[4] || '').trim();
    } else if (columns.length === 4) {
        email = (columns[1] || '').trim();
        password = (columns[2] || '').trim();
        const fourth = (columns[3] || '').trim();
        const parsedRole = parseImportRole(fourth);
        if (parsedRole) {
            roleRaw = parsedRole;
        } else {
            organizationName = fourth;
        }
    } else if (columns.length === 3) {
        const second = (columns[1] || '').trim();
        const third = (columns[2] || '').trim();
        const secondLooksLikeEmail = second.includes('@');

        if (secondLooksLikeEmail) {
            email = second;
            password = third;
        } else {
            password = second;
            const parsedRole = parseImportRole(third);
            if (parsedRole) {
                roleRaw = parsedRole;
            } else {
                organizationName = third;
            }
        }
    } else if (columns.length === 2) {
        const second = (columns[1] || '').trim();
        if (second.includes('@')) {
            email = second;
        } else {
            password = second;
        }
    }

    return {
        username,
        email,
        password,
        roleRaw,
        organizationName,
    };
}

export interface UserFilters {
    page?: number;
    search?: string; // Legacy/Global search
    username?: string;
    totaraUserId?: string;
    email?: string;
    role?: 'ADMIN' | 'ORG_ADMIN' | 'USER' | 'ALL';
}

export async function getUsers(filters: UserFilters = {}) {
    await verifyAdmin();
    const pageSize = 25;
    const page = normalizePage(filters.page);

    const where: Prisma.AppUserWhereInput = {};
    const andConditions: Prisma.AppUserWhereInput[] = [];

    // Global Search (OR logic)
    if (filters.search) {
        andConditions.push(buildAppUserIdentitySearchWhere(filters.search, { includeEmail: true }));
    }

    // Granular Filters (AND logic)
    if (filters.username) {
        andConditions.push({ username: { contains: filters.username } });
    }
    if (filters.totaraUserId) {
        andConditions.push({ lti_subject: { contains: filters.totaraUserId } });
    }
    if (filters.email) {
        andConditions.push({ email: { contains: filters.email } });
    }
    if (filters.role && filters.role !== 'ALL') {
        if (filters.role === 'ORG_ADMIN') {
            andConditions.push({
                org_memberships: { some: { role: 'ORG_ADMIN' } },
            });
        } else if (filters.role === 'USER') {
            andConditions.push({
                AND: [
                    { role: { not: 'ADMIN' } },
                    { org_memberships: { none: { role: 'ORG_ADMIN' } } },
                ],
            });
        } else {
            andConditions.push({ role: filters.role });
        }
    }

    if (andConditions.length > 0) {
        where.AND = andConditions;
    }

    const [users, totalCount] = await Promise.all([
        prisma.appUser.findMany({
            where,
            select: {
                ...SAFE_USER_SELECT,
                assignments: {
                    select: {
                        user_id: true,
                        bot_id: true,
                    },
                },
                org_memberships: {
                    select: {
                        role: true,
                        organization: {
                            select: {
                                bots: {
                                    select: { bot_id: true },
                                },
                            },
                        },
                    },
                },
            },
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.appUser.count({ where }),
    ]);

    const usersWithEffectiveRole = users.map((user) => {
        const hasOrgAdminMembership = user.org_memberships.some((membership) => membership.role === 'ORG_ADMIN');
        const platformRole = normalizePlatformRole(user.role);
        const effectiveRole = platformRole === 'ADMIN'
            ? 'ADMIN'
            : hasOrgAdminMembership
                ? 'ORG_ADMIN'
                : 'USER';
        const assignmentMap = new Map(user.assignments.map((assignment) => [assignment.bot_id, assignment]));

        for (const membership of user.org_memberships) {
            for (const orgBot of membership.organization.bots) {
                if (!assignmentMap.has(orgBot.bot_id)) {
                    assignmentMap.set(orgBot.bot_id, {
                        user_id: user.id,
                        bot_id: orgBot.bot_id,
                    });
                }
            }
        }

        const assignments = Array.from(assignmentMap.values());

        return {
            id: user.id,
            username: user.username,
            totaraUserId: user.lti_subject,
            totaraUsername: user.lti_username,
            ltiIssuer: user.lti_issuer,
            email: user.email,
            created_at: user.created_at,
            role: effectiveRole,
            assignments,
        };
    });

    return {
        users: usersWithEffectiveRole,
        totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
        page,
    };
}

export async function getUser(id: string) {
    await verifyAdmin();
    const user = await prisma.appUser.findUnique({
        where: { id },
        select: {
            ...SAFE_USER_SELECT,
            assignments: {
                select: {
                    user_id: true,
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
            org_memberships: {
                select: {
                    id: true,
                    organization_id: true,
                    role: true,
                    organization: {
                        select: {
                            id: true,
                            name: true,
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
                        },
                    },
                },
            },
        },
    });

    if (!user) return null;
    const {
        lti_issuer,
        lti_subject,
        lti_username,
        ...safeUser
    } = user;

    return {
        ...safeUser,
        totaraUserId: lti_subject,
        totaraUsername: lti_username,
        ltiIssuer: lti_issuer,
        role: normalizePlatformRole(safeUser.role),
        has_org_admin_membership: safeUser.org_memberships.some((m) => m.role === 'ORG_ADMIN'),
    };
}

export async function createUser(username: string, email?: string, role: PlatformUserRole = 'USER') {
    await verifyAdmin();
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
        throw new Error('El nombre de usuario es obligatorio.');
    }
    const normalizedEmail = normalizeOptionalEmail(email);

    try {
        const temporaryPassword = process.env.DEFAULT_USER_PASSWORD || randomBytes(9).toString('base64url');
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);
        const user = await prisma.appUser.create({
            data: {
                username: normalizedUsername,
                email: normalizedEmail,
                password_hash: passwordHash,
                role,
            },
            select: SAFE_USER_SELECT,
        });
        revalidatePath('/admin/users');
        return {
            ...user,
            temporary_password: temporaryPassword,
        };
    } catch (error: unknown) {
        throw toUserActionError(error, 'No se pudo crear el usuario.');
    }
}

export async function updateUser(id: string, data: { username?: string, email?: string, role?: PlatformUserRole, botIds?: string[], orgIds?: string[] }) {
    await verifyAdmin();
    const normalizedOrgIds = uniqueNonEmpty(data.orgIds);
    const normalizedBotIds = uniqueNonEmpty(data.botIds);
    const updateData: Prisma.AppUserUpdateInput = {};

    if (data.username !== undefined) {
        const normalizedUsername = data.username.trim();
        if (!normalizedUsername) {
            throw new Error('El nombre de usuario no puede estar vacío.');
        }
        updateData.username = normalizedUsername;
    }

    if (data.email !== undefined) {
        updateData.email = normalizeOptionalEmail(data.email);
    }

    let updatedUser: { id: string; username: string; email: string | null; role: PlatformUserRole; created_at: Date | null };

    try {
        updatedUser = await prisma.$transaction(async (tx) => {
            const existingUser = await tx.appUser.findUnique({
                where: { id },
                select: { role: true, id: true },
            });

            if (!existingUser) {
                throw new Error('Usuario no encontrado.');
            }

            if (data.role) {
                updateData.role = data.role;
            }

            if (normalizedBotIds !== undefined) {
                await tx.botAssignment.deleteMany({
                    where: { user_id: id },
                });

                if (normalizedBotIds.length > 0) {
                    await tx.botAssignment.createMany({
                        data: normalizedBotIds.map((botId) => ({
                            user_id: id,
                            bot_id: botId,
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            if (normalizedOrgIds !== undefined) {
                if (normalizedOrgIds.length > 0) {
                    const orgs = await tx.organization.findMany({
                        where: { id: { in: normalizedOrgIds } },
                        select: { id: true },
                    });
                    if (orgs.length !== normalizedOrgIds.length) {
                        throw new Error('Una o más organizaciones seleccionadas no existen.');
                    }
                }

                const existingMemberships = await tx.organizationMember.findMany({
                    where: { user_id: id },
                    select: {
                        organization_id: true,
                        role: true,
                    },
                });

                const targetOrgIds = new Set(normalizedOrgIds);
                const existingOrgIds = new Set(existingMemberships.map((membership) => membership.organization_id));
                const orgIdsToRemove = existingMemberships
                    .map((membership) => membership.organization_id)
                    .filter((organizationId) => !targetOrgIds.has(organizationId));
                const orgIdsToAdd = normalizedOrgIds.filter((organizationId) => !existingOrgIds.has(organizationId));

                if (orgIdsToRemove.length > 0) {
                    await tx.organizationMember.deleteMany({
                        where: {
                            user_id: id,
                            organization_id: { in: orgIdsToRemove },
                        },
                    });
                }

                if (orgIdsToAdd.length > 0) {
                    await tx.organizationMember.createMany({
                        data: orgIdsToAdd.map((orgId) => ({
                            user_id: id,
                            organization_id: orgId,
                            role: 'MEMBER',
                        })),
                        skipDuplicates: true,
                    });
                }
            }

            const persistedUser = await tx.appUser.update({
                where: { id },
                data: updateData,
                select: SAFE_USER_SELECT,
            });
            return {
                ...persistedUser,
                role: normalizePlatformRole(persistedUser.role),
            };
        });
    } catch (error: unknown) {
        throw toUserActionError(error, 'No se pudo actualizar el usuario.');
    }

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${id}`);
    return updatedUser;
}

export async function deleteUser(id: string) {
    await verifyAdmin();
    try {
        await prisma.appUser.delete({
            where: { id },
        });
        revalidatePath('/admin/users');
    } catch (error) {
        console.error('Failed to delete user:', error);
        throw error;
    }
}

export async function setPassword(id: string, password: string) {
    await verifyAdmin();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.appUser.update({
        where: { id },
        data: { password_hash: passwordHash },
    });
    revalidatePath('/admin/users');
    return { success: true };
}

export async function getAllUsers() { // For dropdowns/assignments
    await verifyAdmin();
    return prisma.appUser.findMany({
        select: { id: true, username: true, email: true },
        orderBy: { username: 'asc' }
    });
}

export async function importUsersFromCSV(formData: FormData) {
    await verifyAdmin();
    const file = formData.get('file') as File;
    if (!file) throw new Error('No file provided');

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length === 0) {
        throw new Error('El archivo CSV está vacío.');
    }

    const results = {
        total: 0,
        created: 0,
        errors: [] as string[]
    };

    const firstRow = parseCsvLine(lines[0]);
    if (firstRow.length > 0) {
        firstRow[0] = firstRow[0].replace(/^\uFEFF/, '');
    }
    const headerIndexes = resolveCsvHeaderIndexes(firstRow);
    const startIndex = headerIndexes ? 1 : 0;

    const allOrgs = await prisma.organization.findMany({ select: { id: true, name: true } });
    const orgNameMap = new Map(allOrgs.map((org) => [normalizeLookupKey(org.name), org.id]));

    const csvUsernames: string[] = [];
    const csvEmails: string[] = [];
    for (let i = startIndex; i < lines.length; i += 1) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length > 0) {
            columns[0] = columns[0].replace(/^\uFEFF/, '');
        }
        const parsed = parseCsvUserRow(columns, headerIndexes);
        if (!parsed) continue;

        if (parsed.username) csvUsernames.push(parsed.username);
        const normalizedEmail = normalizeOptionalEmail(parsed.email);
        if (normalizedEmail) csvEmails.push(normalizedEmail);
    }

    const existingUsers = await prisma.appUser.findMany({
        where: { username: { in: [...new Set(csvUsernames)] } },
        select: { username: true }
    });
    const existingUsernames = new Set(existingUsers.map((u) => normalizeLookupKey(u.username)));

    const existingEmails = csvEmails.length > 0
        ? await prisma.appUser.findMany({
            where: { email: { in: [...new Set(csvEmails)] } },
            select: { email: true }
        })
        : [];
    const existingEmailSet = new Set(
        existingEmails
            .map((row) => normalizeOptionalEmail(row.email || undefined))
            .filter((value): value is string => Boolean(value))
    );

    const usersToCreate: Prisma.AppUserCreateManyInput[] = [];
    const membersToCreate: Prisma.OrganizationMemberCreateManyInput[] = [];
    const stagedUsernameKeys = new Set<string>();
    const stagedEmails = new Set<string>();
    const importFallbackPassword = process.env.DEFAULT_IMPORT_PASSWORD;

    for (let i = startIndex; i < lines.length; i += 1) {
        const columns = parseCsvLine(lines[i]);
        if (columns.length > 0) {
            columns[0] = columns[0].replace(/^\uFEFF/, '');
        }
        const parsed = parseCsvUserRow(columns, headerIndexes);
        if (!parsed) {
            results.errors.push(`Line ${i + 1}: Invalid format`);
            continue;
        }

        results.total += 1;

        const username = parsed.username.trim();
        if (!username) {
            results.errors.push(`Line ${i + 1}: Missing username`);
            continue;
        }
        const usernameKey = normalizeLookupKey(username);
        if (existingUsernames.has(usernameKey)) {
            results.errors.push(`Line ${i + 1}: User '${username}' already exists`);
            continue;
        }
        if (stagedUsernameKeys.has(usernameKey)) {
            results.errors.push(`Line ${i + 1}: Duplicate username in CSV`);
            continue;
        }

        const normalizedEmail = normalizeOptionalEmail(parsed.email);
        if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            results.errors.push(`Line ${i + 1}: Invalid email format`);
            continue;
        }
        if (normalizedEmail && existingEmailSet.has(normalizedEmail)) {
            results.errors.push(`Line ${i + 1}: Email '${normalizedEmail}' already exists`);
            continue;
        }
        if (normalizedEmail && stagedEmails.has(normalizedEmail)) {
            results.errors.push(`Line ${i + 1}: Duplicate email in CSV`);
            continue;
        }

        const role = parseImportRole(parsed.roleRaw);
        if (!role) {
            results.errors.push(`Line ${i + 1}: Invalid role '${parsed.roleRaw}'. Use ADMIN or USER`);
            continue;
        }

        if (role === 'ORG_ADMIN') {
            results.errors.push(`Line ${i + 1}: ORG_ADMIN can no longer be imported as a platform role. Import as USER and promote org admins from the organization members screen.`);
            continue;
        }

        const resolvedPassword = parsed.password || importFallbackPassword;
        if (!resolvedPassword) {
            results.errors.push(
                `Line ${i + 1}: Missing password. Add password in CSV or set DEFAULT_IMPORT_PASSWORD in env.`
            );
            continue;
        }

        let resolvedOrganizationId: string | null = null;
        const orgNameRaw = parsed.organizationName.trim();

        if (orgNameRaw) {
            const byName = orgNameMap.get(normalizeLookupKey(orgNameRaw));
            if (!byName) {
                results.errors.push(`Line ${i + 1}: Organization '${orgNameRaw}' not found`);
                continue;
            }
            resolvedOrganizationId = byName;
        }

        try {
            const passwordHash = await bcrypt.hash(resolvedPassword, 10);
            const userId = uuidv4();

            usersToCreate.push({
                id: userId,
                username,
                email: normalizedEmail ?? null,
                password_hash: passwordHash,
                // Persisted platform roles are ADMIN/USER.
                // ORG_ADMIN is represented by organization_members.role.
                role: role === 'ADMIN' ? 'ADMIN' : 'USER',
                created_at: new Date()
            });

            if (resolvedOrganizationId) {
                membersToCreate.push({
                    id: uuidv4(),
                    user_id: userId,
                    organization_id: resolvedOrganizationId,
                    role: 'MEMBER'
                });
            }

            stagedUsernameKeys.add(usernameKey);
            if (normalizedEmail) stagedEmails.add(normalizedEmail);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.errors.push(`Line ${i + 1}: ${message}`);
        }
    }

    if (usersToCreate.length > 0) {
        try {
            await prisma.$transaction(async (tx) => {
                await tx.appUser.createMany({ data: usersToCreate });
                if (membersToCreate.length > 0) {
                    await tx.organizationMember.createMany({ data: membersToCreate });
                }
            });
            results.created = usersToCreate.length;
        } catch (error: unknown) {
            console.error('Batch import error:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            results.errors.push(`Batch write failed: ${message}`);
            results.created = 0;
        }
    }

    revalidatePath('/admin/users');
    return results;
}
