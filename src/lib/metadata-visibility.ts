import { shouldExpireEvaluationRawLog } from '@/lib/evaluation-log-policy';

type MetadataObject = Record<string, unknown>;

const ADMIN_ONLY_METADATA_KEYS = [
    'rag_traces',
    'trigger_traces',
    'llm_prompt_traces',
    'voice_audit_events',
    'voice_audit_totals',
    'chat_cost_by_model',
    'evaluation_audit',
    'evaluation_log_access_audit',
    'runtime_block',
    'runtime_snapshot',
    'evaluation_history',
    'examiner_state',
    'detector_state',
    'flow_state',
    'session_vars',
    'initialization_result',
    '_requests',
    '_operation',
    'lti_launch',
    'lti_outcome_sync',
] as const;

function toMetadataObject(value: unknown): MetadataObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return { ...(value as MetadataObject) };
}

export function sanitizeConversationMetadataForViewer(rawMetadata: unknown, isAdminViewer: boolean): MetadataObject {
    const metadata = toMetadataObject(rawMetadata);
    const rawEvaluation = metadata.evaluation && typeof metadata.evaluation === 'object' && !Array.isArray(metadata.evaluation)
        ? { ...(metadata.evaluation as MetadataObject) }
        : null;

    if (!isAdminViewer) {
        for (const key of ADMIN_ONLY_METADATA_KEYS) {
            delete metadata[key];
        }
    }

    if (rawEvaluation) {
        const shouldExpireRawLog = shouldExpireEvaluationRawLog(rawEvaluation);
        if (!isAdminViewer || shouldExpireRawLog) {
            delete rawEvaluation.raw_log;
        }
        if (!isAdminViewer) {
            delete rawEvaluation.rag_trace;
            delete rawEvaluation.evaluator_snapshot;
            delete rawEvaluation.transcript_sha256;
        }
        if (isAdminViewer && shouldExpireRawLog) {
            rawEvaluation.raw_log_expired = true;
        }
        metadata.evaluation = rawEvaluation;
    }

    return metadata;
}
