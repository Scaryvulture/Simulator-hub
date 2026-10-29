import type { Bot, Prisma } from '@prisma/client';

// Deliberate allowlist. Credentials stay on the current Bot record for rotation.
export type RuntimeSnapshot = Pick<Bot, 'id' | 'name' | 'bot_type' | 'openai_prompt_id' | 'openai_vector_store_id' | 'prompt_version' | 'config'> & { version_id?: string };
export type SessionRuntimeSnapshot = { bot: RuntimeSnapshot; evaluator: RuntimeSnapshot | null; captured_at: string; legacy?: boolean };

export function snapshotBot(bot: RuntimeSnapshot): RuntimeSnapshot {
    return JSON.parse(JSON.stringify({
        id: bot.id, name: bot.name, bot_type: bot.bot_type,
        openai_prompt_id: bot.openai_prompt_id, openai_vector_store_id: bot.openai_vector_store_id,
        prompt_version: bot.prompt_version, config: bot.config,
        ...(bot.version_id ? { version_id: bot.version_id } : {}),
    })) as RuntimeSnapshot;
}

export function versionConfig(bot: RuntimeSnapshot) {
    const { config, ...runtime } = snapshotBot(bot);
    return { ...(config as Record<string, unknown>), __runtime: runtime };
}

export function readVersionSnapshot(version: { id: string; config: unknown; prompt_version: string }, fallback: RuntimeSnapshot): RuntimeSnapshot {
    const raw = version.config as Record<string, unknown>;
    const { __runtime, ...config } = raw;
    const runtime = __runtime && typeof __runtime === 'object' ? __runtime as Partial<RuntimeSnapshot> : {};
    return snapshotBot({ ...fallback, ...runtime, id: fallback.id, config: config as Prisma.JsonObject, prompt_version: version.prompt_version, version_id: version.id });
}

export function hasRuntimeSnapshot(config: unknown): boolean {
    return Boolean(config && typeof config === 'object' && '__runtime' in config);
}
