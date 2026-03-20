import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

function resolveConnectionString(): string {
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

    throw new Error('A valid DATABASE_URL or DIRECT_URL is required.');
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveConnectionString() }),
});

type ExistsRow = { exists: boolean };
type DeleteRuleRow = { delete_rule: string | null };

async function checkDeletedAtColumn(): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<ExistsRow[]>(`
        SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'bots'
              AND column_name = 'deleted_at'
        ) AS exists;
    `);
    return Boolean(rows[0]?.exists);
}

async function checkSessionBotFkDeleteRule(): Promise<string | null> {
    const rows = await prisma.$queryRawUnsafe<DeleteRuleRow[]>(`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        JOIN information_schema.table_constraints tc
          ON tc.constraint_schema = rc.constraint_schema
         AND tc.constraint_name = rc.constraint_name
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_schema = tc.constraint_schema
         AND kcu.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_schema = tc.constraint_schema
         AND ccu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = 'sessions'
          AND kcu.column_name = 'bot_id'
          AND ccu.table_name = 'bots'
        LIMIT 1;
    `);

    return rows[0]?.delete_rule || null;
}

async function main() {
    const hasDeletedAt = await checkDeletedAtColumn();
    const deleteRule = await checkSessionBotFkDeleteRule();

    console.log('[db-check] bots.deleted_at:', hasDeletedAt ? 'OK' : 'MISSING');
    console.log('[db-check] sessions.bot_id FK delete rule:', deleteRule || 'NOT_FOUND');

    const fkOk = deleteRule?.toUpperCase() === 'SET NULL';

    if (!hasDeletedAt || !fkOk) {
        console.error('[db-check] Schema is NOT ready for soft-delete flow.');
        process.exitCode = 1;
        return;
    }

    console.log('[db-check] Schema is ready.');
}

main()
    .catch((error) => {
        console.error('[db-check] failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect().catch(() => undefined);
    });
