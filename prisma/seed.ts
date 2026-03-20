import { PrismaClient, type Prisma } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import * as dotenv from 'dotenv'

dotenv.config()

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

    throw new Error(
        'A valid DATABASE_URL or DIRECT_URL is required to run seed against Supabase/Postgres.'
    );
}

const connectionString = resolveDatabaseUrl()

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
    const username = 'admin'
    const password = process.env.SEED_ADMIN_PASSWORD || randomBytes(9).toString('base64url')
    const passwordHash = await bcrypt.hash(password, 10)

    const admin = await prisma.appUser.upsert({
        where: { username },
        update: {
            password_hash: passwordHash,
            role: 'ADMIN',
        },
        create: {
            username,
            password_hash: passwordHash,
            role: 'ADMIN',
        },
    })

    console.log('Admin user seeded:', admin)

    // =========================================================================
    // SEED BOT FROM IN-CODE CONFIG (DB-FIRST, NO STATIC JSON IMPORT)
    // =========================================================================

    const baseConfig: Prisma.InputJsonValue = {
        instructions_prefix: 'Sos un cliente en una estación de servicio. Mantené el rol y evitá lenguaje meta.',
        intro_message: 'Hola, vengo a cargar combustible. ¿Me podés atender?',
        session_vars: {
            dia: { type: 'random', options: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes'] },
            medio_pago: { type: 'random', options: ['efectivo', 'tarjeta de débito', 'app'] },
        },
        flow_steps: [],
        bypass_logic: {},
        image_triggers: [],
        rag_config: {
            enabled: false,
            mode: 'OFF',
            rag_owner: 'wrapper',
            vector_store_ids: [],
            top_k: 4,
            strict_mode: false,
            fallback_strategy: 'safe_reply',
            metadata_filters: {},
            cache_ttl_seconds: 120,
            max_evidence_tokens: 1200,
            history_limit: 10,
        },
    } as const;

    const name = 'Gas Station Simulator';
    const promptId = 'gpt-4o-mini';
    const promptVersion = '1';

    const bot = await prisma.bot.upsert({
        where: { id: 'default-bot-001' },
        update: {
            name,
            openai_prompt_id: promptId,
            prompt_version: promptVersion,
            config: baseConfig,
            published: true,
            bot_type: 'SIMULATOR'
        },
        create: {
            id: 'default-bot-001',
            name,
            openai_prompt_id: promptId,
            prompt_version: promptVersion,
            config: baseConfig,
            published: true,
            bot_type: 'SIMULATOR'
        }
    });

    console.log('Bot seeded:', bot.name);

    const versionCount = await prisma.botVersion.count({
        where: { bot_id: bot.id, version_number: 1 }
    });

    if (versionCount === 0) {
        await prisma.botVersion.create({
            data: {
                bot_id: bot.id,
                version_number: 1,
                config: baseConfig,
                prompt_version: promptVersion,
                environment: 'PROD',
            }
        });
        console.log('Bot Version 1 seeded');
    }

    await prisma.botAssignment.upsert({
        where: {
            user_id_bot_id: {
                user_id: admin.id,
                bot_id: bot.id
            }
        },
        update: {},
        create: {
            user_id: admin.id,
            bot_id: bot.id
        }
    });

    console.log('Bot assigned to admin');
    if (!process.env.SEED_ADMIN_PASSWORD) {
        console.log(`Temporary admin password generated: ${password}`)
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
