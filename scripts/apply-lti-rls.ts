import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';
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

async function main() {
    const sqlPath = path.join(process.cwd(), 'scripts', 'supabase_lti_activity_mappings_rls.sql');
    if (!fs.existsSync(sqlPath)) {
        throw new Error(`SQL file not found at: ${sqlPath}`);
    }

    const connectionString = resolveConnectionString();
    const adapter = new PrismaPg({ connectionString });
    const prisma = new PrismaClient({ adapter });

    try {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        await prisma.$executeRawUnsafe(sql);
        console.log('Applied RLS for public.lti_activity_mappings');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((error) => {
    console.error('Failed to apply LTI RLS:', error);
    process.exit(1);
});
