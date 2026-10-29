import type { RagTrace } from './rag-service';
import { mutateSessionMetadata, toSessionMetadataObject } from './session-metadata';
import type { SessionVars } from './director-session-vars';

export function readMetadataRecord(rawMetadata: unknown): Record<string, unknown> {
    return toSessionMetadataObject(rawMetadata);
}

export async function blockSessionForInvalidConfig(sessionId: string, botId: string, issues: string[]): Promise<void> {
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            metadata.runtime_block = {
                reason: 'invalid_bot_config',
                bot_id: botId,
                issues: issues.slice(0, 10),
                blocked_at: new Date().toISOString(),
            };

            return {
                metadata,
                ended: true,
            };
        },
    });
}

export async function updateSessionMetadataPreservingAudit(params: {
    sessionId: string;
    ended?: boolean;
    patch: Record<string, unknown>;
}): Promise<void> {
    const { sessionId, ended, patch } = params;
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => ({
            metadata: {
                ...metadata,
                ...patch,
            },
            ended,
        }),
    });
}

export async function syncSessionVars(sessionId: string, vars: SessionVars): Promise<void> {
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            metadata.session_vars = vars;

            if (metadata.flow_state && typeof metadata.flow_state === 'object' && !Array.isArray(metadata.flow_state)) {
                const flowState = metadata.flow_state as Record<string, unknown>;
                metadata.flow_state = {
                    ...flowState,
                    vars,
                };
            }

            return { metadata };
        },
    });
}

export async function appendRagTrace(sessionId: string, trace: RagTrace): Promise<void> {
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            const traces = Array.isArray(metadata.rag_traces) ? metadata.rag_traces : [];

            traces.push({
                timestamp: new Date().toISOString(),
                ...trace,
            });

            metadata.rag_traces = traces.slice(-200);
            return { metadata };
        },
    });
}

export async function appendTriggerTraces(sessionId: string, traces: unknown[]): Promise<void> {
    if (!Array.isArray(traces) || traces.length === 0) return;

    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            const existing = Array.isArray(metadata.trigger_traces) ? metadata.trigger_traces : [];

            const timestamp = new Date().toISOString();
            const next = traces.map((trace) => ({
                timestamp,
                ...(trace && typeof trace === 'object' && !Array.isArray(trace)
                    ? trace as Record<string, unknown>
                    : { value: String(trace) }),
            }));

            metadata.trigger_traces = [...existing, ...next].slice(-400);
            return { metadata };
        },
    });
}

export async function appendLlmPromptTrace(sessionId: string, trace: Record<string, unknown>): Promise<void> {
    await mutateSessionMetadata({
        sessionId,
        mutate: (metadata) => {
            const existing = Array.isArray(metadata.llm_prompt_traces) ? metadata.llm_prompt_traces : [];

            existing.push({
                timestamp: new Date().toISOString(),
                ...trace,
            });

            metadata.llm_prompt_traces = existing.slice(-300);
            return { metadata };
        },
    });
}
