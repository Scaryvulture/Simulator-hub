import 'server-only'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

function resolveConnectionString(): string {
    const candidates = [process.env.DATABASE_URL, process.env.DIRECT_URL].filter(
        (value): value is string => Boolean(value)
    )

    const normalize = (raw: string) =>
        raw.startsWith('postgres://')
            ? `postgresql://${raw.slice('postgres://'.length)}`
            : raw

    for (const raw of candidates) {
        const normalized = normalize(raw)
        try {
            new URL(normalized)
            return normalized
        } catch {
            continue
        }
    }

    if (candidates.length > 0) {
        // Keep moving even if URL parsing fails here; Prisma will provide exact diagnostics.
        return normalize(candidates[0])
    }

    throw new Error(
        'A valid DATABASE_URL or DIRECT_URL is required. Check URL format and escape special characters in password.'
    )
}

function resolvePoolNumber(value: string | undefined, fallback: number, min = 1, max = 20): number {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    const normalized = Math.floor(parsed)
    if (normalized < min) return min
    if (normalized > max) return max
    return normalized
}

const prismaClientSingleton = () => {
    const connectionString = resolveConnectionString()
    const defaultPoolMax = process.env.NODE_ENV === 'production' ? 3 : 10
    const poolMax = resolvePoolNumber(process.env.PRISMA_PG_POOL_MAX, defaultPoolMax, 1, 30)
    const idleTimeoutMillis = resolvePoolNumber(process.env.PRISMA_PG_IDLE_TIMEOUT_MS, 10_000, 1_000, 120_000)
    const connectionTimeoutMillis = resolvePoolNumber(process.env.PRISMA_PG_CONNECT_TIMEOUT_MS, 10_000, 1_000, 120_000)

    const adapter = new PrismaPg({
        connectionString,
        max: poolMax,
        idleTimeoutMillis,
        connectionTimeoutMillis,
    })
    return new PrismaClient({ adapter })
}

function hasRequiredDelegates(client: PrismaClient): boolean {
    const c = client as unknown as Record<string, unknown>
    const hasBot = typeof (c.bot as { findMany?: unknown } | undefined)?.findMany === 'function'
    return hasBot
}

declare global {
    var prismaGlobal: undefined | ReturnType<typeof prismaClientSingleton>
}

const existingPrisma = globalThis.prismaGlobal
if (existingPrisma && !hasRequiredDelegates(existingPrisma)) {
    // In dev hot-reload, global singleton can keep an older generated client shape.
    // Recreate it to expose the required delegates.
    console.warn('[prisma] Detected stale Prisma client singleton. Recreating instance.')
    void existingPrisma.$disconnect().catch(() => undefined)
    globalThis.prismaGlobal = undefined
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma

// Force reload after schema update
