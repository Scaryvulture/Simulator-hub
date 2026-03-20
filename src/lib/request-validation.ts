

const UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ID_REGEX =
    /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/;

const RESERVED_METADATA_KEYS = new Set([
    'session_id',
    'bot_id',
    'organization_id',
    'external_user_id',
    'user_id',
    // Internal audit fields must never be client-injectable
    'rag_traces',
    'trigger_traces',
    'voice_audit_events',
    'voice_audit_totals',
    'chat_cost_by_model',
    'evaluation_audit',
    'evaluation_log_access_audit',
    'llm_prompt_traces',
    'runtime_block',
    'flow_state',
    'lti_launch',
    'lti_outcome_sync',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export class PayloadTooLargeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PayloadTooLargeError';
    }
}

export function isValidUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_REGEX.test(value);
}

/**
 * Accepts UUID (current standard) and legacy opaque ids used in early datasets.
 */
export function isValidEntityId(value: unknown): value is string {
    return typeof value === 'string' && (UUID_REGEX.test(value) || LEGACY_ID_REGEX.test(value));
}

export function assertValidUuid(value: unknown, fieldName: string): string {
    if (!isValidUuid(value)) {
        throw new Error(`${fieldName} must be a valid UUID`);
    }
    return value;
}

export function isContentLengthOverLimit(
    contentLengthHeader: string | null,
    maxBytes: number
): boolean {
    if (!contentLengthHeader) return false;

    const normalizedHeader = contentLengthHeader.trim();
    if (!/^\d+$/.test(normalizedHeader)) return false;

    const contentLength = Number(normalizedHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) return false;

    const normalizedMax = Number.isFinite(maxBytes) && maxBytes > 0
        ? Math.floor(maxBytes)
        : 1;

    return contentLength > normalizedMax;
}

export async function parseJsonBodyWithLimit(
    req: Request,
    maxBytes: number
): Promise<Record<string, unknown>> {
    const normalizedMax = Number.isFinite(maxBytes) && maxBytes > 0
        ? Math.floor(maxBytes)
        : 1;

    const rawBody = await req.text();
    const bodyBytes = new TextEncoder().encode(rawBody).length;
    if (bodyBytes > normalizedMax) {
        throw new PayloadTooLargeError(`Request body too large. Max ${normalizedMax} bytes.`);
    }

    if (!rawBody.trim()) return {};

    try {
        const parsed = JSON.parse(rawBody);
        if (!isPlainObject(parsed)) return {};
        return parsed;
    } catch {
        throw new SyntaxError('Invalid JSON body');
    }
}

export function sanitizeSessionMetadata(raw: unknown): Record<string, unknown> {
    if (raw === null || raw === undefined) return {};
    if (!isPlainObject(raw)) {
        throw new Error('metadata must be a JSON object');
    }

    const cloned = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
    for (const reservedKey of RESERVED_METADATA_KEYS) {
        delete cloned[reservedKey];
    }

    const parsedMaxBytes = Number(process.env.SESSION_METADATA_MAX_BYTES || 8_192);
    const maxBytes = Number.isFinite(parsedMaxBytes) && parsedMaxBytes >= 256
        ? parsedMaxBytes
        : 8_192;
    const serialized = JSON.stringify(cloned);
    const sizeInBytes = Buffer.byteLength(serialized, 'utf8');
    if (sizeInBytes > maxBytes) {
        throw new Error(`metadata exceeds maximum allowed size (${maxBytes} bytes)`);
    }

    return cloned;
}
