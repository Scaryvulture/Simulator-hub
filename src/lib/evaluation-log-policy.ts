const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS_PROD = 30;
const DEFAULT_RETENTION_DAYS_NON_PROD = 90;

type MetadataObject = Record<string, unknown>;

function toPositiveInteger(value: number): number | null {
    if (!Number.isFinite(value)) return null;
    const normalized = Math.trunc(value);
    return normalized >= 0 ? normalized : null;
}

export function getEvaluationRawLogRetentionDays(): number {
    const fallback = process.env.NODE_ENV === 'production'
        ? DEFAULT_RETENTION_DAYS_PROD
        : DEFAULT_RETENTION_DAYS_NON_PROD;
    const raw = (process.env.EVALUATION_RAW_LOG_RETENTION_DAYS || '').trim();
    if (!raw) return fallback;

    const parsed = toPositiveInteger(Number(raw));
    if (parsed === null) {
        console.warn(
            `[evaluation-log-policy] Invalid EVALUATION_RAW_LOG_RETENTION_DAYS="${raw}". Falling back to ${fallback} days.`
        );
        return fallback;
    }
    return parsed;
}

export function shouldExpireEvaluationRawLog(
    evaluationValue: unknown,
    nowMs: number = Date.now()
): boolean {
    if (!evaluationValue || typeof evaluationValue !== 'object' || Array.isArray(evaluationValue)) {
        return false;
    }

    const evaluation = evaluationValue as MetadataObject;
    if (typeof evaluation.raw_log !== 'string' || !evaluation.raw_log.trim()) {
        return false;
    }

    const retentionDays = getEvaluationRawLogRetentionDays();
    if (retentionDays === 0) return true;

    const timestampRaw = typeof evaluation.timestamp === 'string' ? evaluation.timestamp : '';
    const timestampMs = Date.parse(timestampRaw);
    if (!Number.isFinite(timestampMs)) {
        // If timestamp is missing/invalid we cannot guarantee retention, so fail closed.
        return true;
    }

    return nowMs - timestampMs > retentionDays * DAY_MS;
}
