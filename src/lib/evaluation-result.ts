import type { RagTrace } from '@/lib/rag-service';

type MetadataObject = Record<string, unknown>;

type BooleanCriterionResult = {
    id: string;
    title: string;
    passed: boolean;
    reason: string;
};

type QualitativeCriterionResult = {
    id: string;
    title: string;
    feedback: string;
};

export interface PublicEvaluationResult {
    score: number;
    max_score: number;
    percentage: number;
    results: {
        boolean: BooleanCriterionResult[];
        qualitative: QualitativeCriterionResult[];
    };
    timestamp: string;
}

export interface ViewerEvaluationResult extends PublicEvaluationResult {
    raw_log?: string;
    raw_log_expired?: boolean;
}

export interface StoredEvaluationResult extends ViewerEvaluationResult {
    transcript_sha256?: string;
    evaluator_snapshot?: unknown;
    rag_trace?: RagTrace;
    source?: string;
}

function toMetadataObject(value: unknown): MetadataObject | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as MetadataObject;
}

function isBooleanCriterionResult(value: unknown): value is BooleanCriterionResult {
    const source = toMetadataObject(value);
    return Boolean(
        source
        && typeof source.id === 'string'
        && typeof source.title === 'string'
        && typeof source.passed === 'boolean'
        && typeof source.reason === 'string'
    );
}

function isQualitativeCriterionResult(value: unknown): value is QualitativeCriterionResult {
    const source = toMetadataObject(value);
    return Boolean(
        source
        && typeof source.id === 'string'
        && typeof source.title === 'string'
        && typeof source.feedback === 'string'
    );
}

export function isEvaluationResult(value: unknown): value is ViewerEvaluationResult {
    const source = toMetadataObject(value);
    if (!source) return false;
    if (typeof source.score !== 'number') return false;
    if (typeof source.max_score !== 'number') return false;
    if (typeof source.percentage !== 'number') return false;
    if (typeof source.timestamp !== 'string') return false;

    const results = toMetadataObject(source.results);
    if (!results) return false;
    if (!Array.isArray(results.boolean) || !results.boolean.every(isBooleanCriterionResult)) return false;
    if (!Array.isArray(results.qualitative) || !results.qualitative.every(isQualitativeCriterionResult)) return false;

    return true;
}

export function readStoredEvaluationFromMetadata(metadata: unknown): StoredEvaluationResult | null {
    const source = toMetadataObject(metadata);
    if (!source) return null;

    const rawEvaluation = source.evaluation;
    if (!isEvaluationResult(rawEvaluation)) return null;
    const rawEvaluationObject = toMetadataObject(rawEvaluation) || {};

    return {
        ...rawEvaluation,
        raw_log: typeof rawEvaluation.raw_log === 'string' ? rawEvaluation.raw_log : undefined,
        raw_log_expired: rawEvaluation.raw_log_expired === true ? true : undefined,
        rag_trace: (toMetadataObject(rawEvaluationObject.rag_trace) || undefined) as unknown as RagTrace | undefined,
        source: typeof rawEvaluationObject.source === 'string' ? rawEvaluationObject.source : undefined,
    };
}

export function toPublicEvaluationResult(value: ViewerEvaluationResult | StoredEvaluationResult): PublicEvaluationResult {
    return {
        score: value.score,
        max_score: value.max_score,
        percentage: value.percentage,
        results: value.results,
        timestamp: value.timestamp,
    };
}
