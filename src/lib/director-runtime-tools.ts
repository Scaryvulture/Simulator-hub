import { promptSessionVars, type SessionVars } from './director-session-vars';

export type PlatformTraceOutputContent = { type?: string; text?: string };
export type PlatformTraceOutputEntry = {
    type?: string;
    role?: string;
    content?: PlatformTraceOutputContent[];
    call_id?: string;
    name?: string;
    arguments?: string;
    results?: Array<{
        file_id?: string;
        filename?: string;
        score?: number;
        content?: PlatformTraceOutputContent[];
    }>;
};

export type RuntimeToolCall = {
    call_id: string;
    name: string;
    arguments: string;
};

export type RawResponsesCreateResult = {
    id?: string;
    output_text?: string;
    output?: PlatformTraceOutputEntry[];
    usage?: {
        input_tokens?: number;
        prompt_tokens?: number;
        output_tokens?: number;
        completion_tokens?: number;
    } & Record<string, unknown>;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

export function sanitizeConfiguredTools(raw: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(raw)) return [];

    const sanitized: Array<Record<string, unknown>> = [];
    for (const entry of raw) {
        const tool = asRecord(entry);
        if (!tool) continue;
        if (tool.type !== 'function') continue;

        const functionConfig = asRecord(tool.function);
        if (!functionConfig) continue;
        const name = typeof functionConfig.name === 'string' ? functionConfig.name.trim() : '';
        if (!name) continue;

        const normalizedFunction: Record<string, unknown> = { name };
        if (typeof functionConfig.description === 'string' && functionConfig.description.trim()) {
            normalizedFunction.description = functionConfig.description.trim();
        }
        const parameters = asRecord(functionConfig.parameters);
        if (parameters) {
            normalizedFunction.parameters = parameters;
        }

        sanitized.push({
            type: 'function',
            function: normalizedFunction,
        });
    }

    return sanitized;
}

export function extractRuntimeToolCalls(response: RawResponsesCreateResult): RuntimeToolCall[] {
    if (!Array.isArray(response.output)) return [];

    const calls: RuntimeToolCall[] = [];
    for (const entry of response.output) {
        if (entry?.type !== 'function_call') continue;
        const callId = typeof entry.call_id === 'string' ? entry.call_id : '';
        const name = typeof entry.name === 'string' ? entry.name.trim() : '';
        const argumentsText = typeof entry.arguments === 'string' ? entry.arguments : '{}';
        if (!callId || !name) continue;
        calls.push({
            call_id: callId,
            name,
            arguments: argumentsText,
        });
    }
    return calls;
}

function parseToolArguments(rawArgs: string): Record<string, unknown> {
    if (!rawArgs.trim()) return {};
    try {
        const parsed = JSON.parse(rawArgs);
        return asRecord(parsed) || {};
    } catch {
        return {};
    }
}

export function executeRuntimeToolCall(call: RuntimeToolCall, sessionVars: SessionVars): string {
    const name = call.name.trim().toLowerCase();
    const args = parseToolArguments(call.arguments);

    if (name === 'runtime.now' || name === 'get_current_datetime') {
        return JSON.stringify({
            ok: true,
            now_iso: new Date().toISOString(),
            unix_ms: Date.now(),
        });
    }

    if (name === 'runtime.session_vars' || name === 'get_session_vars') {
        const allVars = promptSessionVars(sessionVars || {});
        const requestedKeys = Array.isArray(args.keys)
            ? args.keys.filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
            : [];

        const selectedVars = requestedKeys.length > 0
            ? requestedKeys.reduce<Record<string, string>>((acc, key) => {
                if (typeof allVars[key] === 'string') {
                    acc[key] = allVars[key];
                }
                return acc;
            }, {})
            : allVars;

        return JSON.stringify({
            ok: true,
            session_vars: selectedVars,
            available_keys: Object.keys(allVars),
        });
    }

    return JSON.stringify({
        ok: false,
        error: `Tool "${call.name}" no está habilitada en runtime.`,
        available_tools: ['runtime.now', 'runtime.session_vars'],
    });
}

export function isLikelyReasoningModel(model: string): boolean {
    const normalized = (model || '').trim().toLowerCase();
    if (!normalized) return false;
    return normalized.startsWith('o')
        || normalized.startsWith('gpt-5')
        || normalized.startsWith('chatgpt-5')
        || normalized.startsWith('codex-5');
}
