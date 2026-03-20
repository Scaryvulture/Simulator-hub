type Primitive = string | number | boolean | null;
type PrimitiveMap = Record<string, Primitive>;

const MAX_MAP_ENTRIES = 120;
const MAX_ARRAY_ENTRIES = 120;
const MAX_STRING_LENGTH = 280;

type RuntimeFlowState = {
    current_step?: string;
    ended?: boolean;
    completed_steps: string[];
    vars: PrimitiveMap;
};

type RuntimeExaminerState = {
    phase?: string;
    topic?: string | null;
    pending_topic?: string | null;
    current_index?: number;
    current_attempt?: number;
    last_result?: string | null;
    selected_questions?: number;
    shown_interstitial_ids?: number;
};

export interface RuntimeSignalsSummary {
    has_runtime_signals: boolean;
    session_vars: PrimitiveMap;
    flow_state?: RuntimeFlowState;
    examiner_state?: RuntimeExaminerState;
    activated_variables: string[];
}

function toObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function toPrimitive(value: unknown): Primitive | undefined {
    if (value === null) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        return value.length > MAX_STRING_LENGTH
            ? `${value.slice(0, MAX_STRING_LENGTH)}...`
            : value;
    }
    return undefined;
}

function toPrimitiveMap(value: unknown, maxEntries: number = MAX_MAP_ENTRIES): PrimitiveMap {
    const source = toObject(value);
    if (!source) return {};

    const next: PrimitiveMap = {};
    for (const [key, raw] of Object.entries(source)) {
        if (Object.keys(next).length >= maxEntries) break;
        const primitive = toPrimitive(raw);
        if (primitive === undefined) continue;
        next[key] = primitive;
    }
    return next;
}

function toStringArray(value: unknown, maxEntries: number = MAX_ARRAY_ENTRIES): string[] {
    if (!Array.isArray(value)) return [];
    const next: string[] = [];
    for (const item of value) {
        if (next.length >= maxEntries) break;
        if (typeof item !== 'string') continue;
        const trimmed = item.trim();
        if (!trimmed) continue;
        next.push(
            trimmed.length > MAX_STRING_LENGTH
                ? `${trimmed.slice(0, MAX_STRING_LENGTH)}...`
                : trimmed
        );
    }
    return next;
}

function isActivated(value: Primitive): boolean {
    if (value === null) return false;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;

    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'false' || normalized === 'no' || normalized === 'none' || normalized === 'null' || normalized === '0') {
        return false;
    }
    return true;
}

function uniqueSorted(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function buildRuntimeSignalsSummary(rawMetadata: unknown): RuntimeSignalsSummary {
    const metadata = toObject(rawMetadata) || {};
    const sessionVars = toPrimitiveMap(metadata.session_vars);

    const flowStateRaw = toObject(metadata.flow_state);
    const flowVars = flowStateRaw ? toPrimitiveMap(flowStateRaw.vars) : {};
    const flowState: RuntimeFlowState | undefined = flowStateRaw
        ? {
            current_step: typeof flowStateRaw.current_step === 'string' ? flowStateRaw.current_step : undefined,
            ended: typeof flowStateRaw.ended === 'boolean' ? flowStateRaw.ended : undefined,
            completed_steps: toStringArray(flowStateRaw.completed_steps),
            vars: flowVars,
        }
        : undefined;

    const examinerRaw = toObject(metadata.examiner_state);
    const examinerState: RuntimeExaminerState | undefined = examinerRaw
        ? {
            phase: typeof examinerRaw.phase === 'string' ? examinerRaw.phase : undefined,
            topic: typeof examinerRaw.topic === 'string' ? examinerRaw.topic : null,
            pending_topic: typeof examinerRaw.pending_topic === 'string' ? examinerRaw.pending_topic : null,
            current_index: typeof examinerRaw.current_index === 'number' ? examinerRaw.current_index : undefined,
            current_attempt: typeof examinerRaw.current_attempt === 'number' ? examinerRaw.current_attempt : undefined,
            last_result: typeof examinerRaw.last_result === 'string' ? examinerRaw.last_result : null,
            selected_questions: Array.isArray(examinerRaw.selected_question_ids) ? examinerRaw.selected_question_ids.length : undefined,
            shown_interstitial_ids: Array.isArray(examinerRaw.shown_interstitial_ids) ? examinerRaw.shown_interstitial_ids.length : undefined,
        }
        : undefined;

    const mergedVars: PrimitiveMap = {
        ...sessionVars,
        ...flowVars,
    };
    const activatedVariables = uniqueSorted(
        Object.entries(mergedVars)
            .filter(([, value]) => isActivated(value))
            .map(([key]) => key)
    ).slice(0, MAX_MAP_ENTRIES);

    const hasRuntimeSignals = (
        Object.keys(sessionVars).length > 0
        || Object.keys(flowVars).length > 0
        || Boolean(examinerState)
    );

    return {
        has_runtime_signals: hasRuntimeSignals,
        session_vars: sessionVars,
        flow_state: flowState,
        examiner_state: examinerState,
        activated_variables: activatedVariables,
    };
}
