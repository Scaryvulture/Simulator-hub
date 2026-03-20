import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

function resolveConnectionString(): string {
    const candidates = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(
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

    throw new Error(
        'A valid DATABASE_URL or DIRECT_URL is required. Check URL format and escape special characters in password.'
    );
}

type RlsStatusRow = {
    table_name: string;
    table_exists: boolean;
    rls_enabled: boolean;
    rls_forced: boolean;
};

type PolicyRow = {
    policyname: string;
    cmd: string;
    roles: string;
};

type GrantRow = {
    grantee: string;
    privilege_type: string;
};

async function main() {
    const connectionString = resolveConnectionString();
    const adapter = new PrismaPg({ connectionString });
    const prisma = new PrismaClient({ adapter });

    try {
        const [statusRows, policyRows, grantRows] = await Promise.all([
            prisma.$queryRawUnsafe<RlsStatusRow[]>(`
                select
                  'lti_activity_mappings' as table_name,
                  c.oid is not null as table_exists,
                  coalesce(c.relrowsecurity, false) as rls_enabled,
                  coalesce(c.relforcerowsecurity, false) as rls_forced
                from pg_class c
                where c.relname = 'lti_activity_mappings'
                  and c.relnamespace = 'public'::regnamespace
            `),
            prisma.$queryRawUnsafe<PolicyRow[]>(`
                select policyname, cmd, array_to_string(roles, ',') as roles
                from pg_policies
                where schemaname = 'public'
                  and tablename = 'lti_activity_mappings'
                order by policyname
            `),
            prisma.$queryRawUnsafe<GrantRow[]>(`
                select grantee, privilege_type
                from information_schema.role_table_grants
                where table_schema = 'public'
                  and table_name = 'lti_activity_mappings'
                  and grantee in ('public', 'anon', 'authenticated', 'service_role', 'postgres')
                order by grantee, privilege_type
            `),
        ]);

        console.log(JSON.stringify({
            status: statusRows[0] ?? null,
            policies: policyRows,
            grants: grantRows,
        }, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Failed to verify LTI RLS:', error);
    process.exit(1);
});
