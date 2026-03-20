import "dotenv/config";
import { defineConfig } from "prisma/config";

function resolveDatabaseUrl() {
    const candidates = [process.env.DIRECT_URL, process.env.DATABASE_URL].filter(
        (value): value is string => Boolean(value)
    );

    const normalize = (raw: string) =>
        raw.startsWith("postgres://")
            ? `postgresql://${raw.slice("postgres://".length)}`
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
        "A valid DATABASE_URL or DIRECT_URL is required for Prisma commands."
    );
}

const databaseUrl = resolveDatabaseUrl();

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "tsx prisma/seed.ts",
    },
    datasource: {
        url: databaseUrl,
    },
});
