import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
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
    console.log('🔒 Starting Supabase Security Lockdown...');

    const connectionString = resolveConnectionString();
    const adapter = new PrismaPg({ connectionString });
    const prisma = new PrismaClient({ adapter });

    const sqlFiles = [
        path.join(process.cwd(), 'scripts', 'supabase_lockdown_all.sql'),
        path.join(process.cwd(), 'scripts', 'supabase_add_policies.sql'),
    ];

    try {
        for (const sqlPath of sqlFiles) {
            if (!fs.existsSync(sqlPath)) {
                console.error(`❌ SQL file not found at: ${sqlPath}`);
                process.exit(1);
            }
            const sql = fs.readFileSync(sqlPath, 'utf-8');
            await prisma.$executeRawUnsafe(sql);
            console.log(`✅ Applied: ${path.basename(sqlPath)}`);
        }

        console.log('✅ Security lockdown applied successfully!');
        console.log('   - RLS enabled on all sensitive tables');
        console.log('   - Public/Anon access revoked');
        console.log('   - Service Role access maintained');

    } catch (error) {
        console.error('❌ Error executing security script:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
