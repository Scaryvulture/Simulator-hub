import OpenAI from 'openai';

function readPositiveInt(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
}

function readDefaultHeaders(): Record<string, string> | undefined {
    const headerList = process.env.OPENAI_DEFAULT_HEADERS?.trim();
    if (!headerList) return undefined;

    const pairs = headerList
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
            const separatorIndex = entry.indexOf('=');
            if (separatorIndex <= 0) return null;
            const key = entry.slice(0, separatorIndex).trim();
            const value = entry.slice(separatorIndex + 1).trim();
            if (!key || !value) return null;
            return [key, value] as const;
        })
        .filter((entry): entry is readonly [string, string] => Boolean(entry));

    if (pairs.length === 0) return undefined;
    return Object.fromEntries(pairs);
}

export function createOpenAIClient(apiKey: string): OpenAI {
    const timeout = readPositiveInt(process.env.OPENAI_TIMEOUT_MS);
    const maxRetries = readPositiveInt(process.env.OPENAI_MAX_RETRIES);
    const defaultHeaders = readDefaultHeaders();

    return new OpenAI({
        apiKey,
        ...(timeout !== undefined ? { timeout } : {}),
        ...(maxRetries !== undefined ? { maxRetries } : {}),
        ...(defaultHeaders ? { defaultHeaders } : {}),
    });
}

export type AIClient = OpenAI;
