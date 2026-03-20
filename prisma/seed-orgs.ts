import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

function resolveDatabaseUrl(): string {
    const candidates = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(
        (value): value is string => Boolean(value)
    );

    const normalize = (raw: string) =>
        raw.startsWith('postgres://')
            ? `postgresql://${raw.slice('postgres://'.length)}`
            : raw;

    for (const raw of candidates) {
        const normalized = normalize(raw);
        try {
            new URL(normalized);
            return normalized;
        } catch {
            continue;
        }
    }

    if (candidates.length > 0) {
        return normalize(candidates[0]);
    }

    throw new Error('A valid DIRECT_URL or DATABASE_URL is required.');
}

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Start seeding organizations...');

    // 1. Create Default Organization
    const defaultOrgName = 'Default Organization';
    let defaultOrg = await prisma.organization.findFirst({
        where: { name: defaultOrgName },
    });

    if (!defaultOrg) {
        console.log('Creating Default Organization...');
        defaultOrg = await prisma.organization.create({
            data: {
                name: defaultOrgName,
                allow_manual_login: true,
            },
        });
    } else {
        console.log('Default Organization already exists.');
    }

    const orgId = defaultOrg.id;

    // 2. Migrate Users
    const users = await prisma.appUser.findMany();
    console.log(`Found ${users.length} users to migrate.`);

    for (const user of users) {
        const existingMember = await prisma.organizationMember.findUnique({
            where: {
                organization_id_user_id: {
                    organization_id: orgId,
                    user_id: user.id
                }
            }
        });

        if (!existingMember) {
            // Global Admins become Org Admins, others Members
            const orgRole = user.role === 'ADMIN' ? 'ORG_ADMIN' : 'MEMBER';

            await prisma.organizationMember.create({
                data: {
                    organization_id: orgId,
                    user_id: user.id,
                    role: orgRole,
                },
            });
            console.log(`Migrated user ${user.username} as ${orgRole}`);
        }
    }

    // 3. Migrate Bots
    const bots = await prisma.bot.findMany();
    console.log(`Found ${bots.length} bots to migrate.`);

    for (const bot of bots) {
        const existingBot = await prisma.organizationBot.findFirst({ // Composite ID check
            where: {
                organization_id: orgId,
                bot_id: bot.id
            }
        });

        if (!existingBot) {
            await prisma.organizationBot.create({
                data: {
                    organization_id: orgId,
                    bot_id: bot.id,
                },
            });
            console.log(`Migrated bot ${bot.name}`);
        }
    }

    // 4. Update Sessions (Optional but good for consistency)
    const sessions = await prisma.session.findMany({
        where: { organization_id: null }
    });
    console.log(`Found ${sessions.length} sessions to link.`);

    if (sessions.length > 0) {
        await prisma.session.updateMany({
            where: { organization_id: null },
            data: { organization_id: orgId }
        });
        console.log('Sessions linked to Default Organization.');
    }

    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
