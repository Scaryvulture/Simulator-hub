export type PrimitiveFilterValue = string | number | boolean;
export type RagOwner = 'wrapper' | 'platform';
export type RagMode = 'never' | 'always' | 'by_step' | 'evaluation_only';

export interface NormalizedRagConfig {
    enabled: boolean;
    owner: RagOwner;
    mode: RagMode;
    vector_store_ids: string[];
    strict_mode: boolean;
    history_limit: number;
    wrapper: {
        strategy: 'metadata_first' | 'similarity' | 'hybrid';
        fallback: 'rewrite_retry' | 'secondary_store' | 'safe_reply' | 'none';
        score_threshold?: number;
        cache_ttl_seconds: number;
        metadata_filters: Record<string, PrimitiveFilterValue>;
        top_k: number;
        max_evidence_tokens: number;
    };
    platform: {
        max_num_results: number;
        filters?: Record<string, PrimitiveFilterValue>;
        ranking_options?: {
            score_threshold?: number;
        };
        force_tool: boolean;
    };
    audit: {
        store_results: boolean;
        store_queries: boolean;
        store_scores: boolean;
    };
}

type RawRagConfig = {
    enabled?: unknown;
    mode?: unknown;
    owner?: unknown;
    rag_owner?: unknown;
    strict_mode?: unknown;
    strict?: unknown;
    vector_store_ids?: unknown;
    history_limit?: unknown;
    metadata_filters?: Record<string, PrimitiveFilterValue>;
    search_threshold?: unknown;
    top_k?: unknown;
    fallback_strategy?: unknown;
    cache_ttl_seconds?: unknown;
    max_evidence_tokens?: unknown;
    wrapper?: {
        strategy?: NormalizedRagConfig['wrapper']['strategy'];
        fallback?: NormalizedRagConfig['wrapper']['fallback'];
        score_threshold?: number;
        cache_ttl?: unknown;
        metadata_filters?: Record<string, PrimitiveFilterValue>;
        top_k?: unknown;
        max_evidence_tokens?: unknown;
    };
    platform?: {
        max_num_results?: unknown;
        filters?: Record<string, PrimitiveFilterValue>;
        ranking_options?: {
            score_threshold?: number;
        };
        force_tool?: unknown;
    };
    audit?: {
        store_results?: unknown;
        store_queries?: unknown;
        store_scores?: unknown;
    };
};

export function normalizeRagMode(mode: unknown, enabled?: boolean): RagMode {
    if (mode === 'never' || mode === 'always' || mode === 'by_step' || mode === 'evaluation_only') {
        return mode;
    }
    if (mode === 'OFF') return 'never';
    if (mode === 'AUTO') return 'always';
    if (mode === 'FORCED') return 'always';
    if (enabled === true) return 'always';
    return 'never';
}

export function normalizeRagOwner(raw: unknown): RagOwner {
    return raw === 'platform' ? 'platform' : 'wrapper';
}

export function normalizeVectorStoreIds(rawIds: unknown, legacyVectorStoreId?: string | null): string[] {
    const ids = new Set<string>();
    if (Array.isArray(rawIds)) {
        for (const id of rawIds) {
            if (typeof id === 'string' && id.trim()) {
                ids.add(id.trim());
            }
        }
    }
    if (legacyVectorStoreId && legacyVectorStoreId.trim()) {
        ids.add(legacyVectorStoreId.trim());
    }
    return Array.from(ids);
}

export function normalizeRagConfig(raw: unknown, legacyVectorStoreId?: string | null): NormalizedRagConfig {
    const source = (raw && typeof raw === 'object' ? raw : {}) as RawRagConfig;

    const enabledFlag = typeof source.enabled === 'boolean' ? source.enabled : undefined;
    const mode = normalizeRagMode(source.mode, enabledFlag);
    const owner = normalizeRagOwner(source.owner ?? source.rag_owner);
    const strict = Boolean(source.strict_mode ?? source.strict);
    const vectorStoreIds = normalizeVectorStoreIds(source.vector_store_ids, legacyVectorStoreId);

    const wrapperMetadata: Record<string, PrimitiveFilterValue> =
        (source.wrapper?.metadata_filters && typeof source.wrapper.metadata_filters === 'object')
            ? source.wrapper.metadata_filters
            : (source.metadata_filters || {});

    const scoreThreshold =
        source.wrapper?.score_threshold ??
        source.search_threshold;

    const platformThreshold =
        source.platform?.ranking_options?.score_threshold ??
        scoreThreshold;

    const fallbackStrategy = (
        source.fallback_strategy === 'rewrite_retry'
        || source.fallback_strategy === 'secondary_store'
        || source.fallback_strategy === 'safe_reply'
        || source.fallback_strategy === 'none'
    ) ? source.fallback_strategy : undefined;
    const wrapperFallback = (
        source.wrapper?.fallback === 'rewrite_retry'
        || source.wrapper?.fallback === 'secondary_store'
        || source.wrapper?.fallback === 'safe_reply'
        || source.wrapper?.fallback === 'none'
    ) ? source.wrapper.fallback : undefined;

    const normalized: NormalizedRagConfig = {
        enabled: mode !== 'never',
        owner,
        mode,
        vector_store_ids: vectorStoreIds,
        strict_mode: strict,
        history_limit: Number(source.history_limit ?? 10),
        wrapper: {
            strategy: source.wrapper?.strategy || (Object.keys(wrapperMetadata).length > 0 ? 'hybrid' : 'similarity'),
            fallback: wrapperFallback || fallbackStrategy || 'none',
            score_threshold: typeof scoreThreshold === 'number' ? scoreThreshold : undefined,
            cache_ttl_seconds: Number(source.wrapper?.cache_ttl ?? source.cache_ttl_seconds ?? 120),
            metadata_filters: wrapperMetadata || {},
            top_k: Number(source.wrapper?.top_k ?? source.top_k ?? 4),
            max_evidence_tokens: Number(source.wrapper?.max_evidence_tokens ?? source.max_evidence_tokens ?? 1200),
        },
        platform: {
            max_num_results: Number(source.platform?.max_num_results ?? source.top_k ?? 6),
            filters: source.platform?.filters || (Object.keys(wrapperMetadata).length > 0 ? wrapperMetadata : undefined),
            ranking_options: typeof platformThreshold === 'number'
                ? { score_threshold: platformThreshold }
                : undefined,
            force_tool: Boolean(source.platform?.force_tool ?? false),
        },
        audit: {
            store_results: Boolean(source.audit?.store_results ?? true),
            store_queries: Boolean(source.audit?.store_queries ?? true),
            store_scores: Boolean(source.audit?.store_scores ?? true),
        },
    };

    return normalized;
}

export function shouldRunRagForChat(mode: RagMode, hasStepRagAction: boolean, isEvaluationPurposeStep: boolean): boolean {
    if (mode === 'never') return false;
    if (mode === 'always') return true;
    if (mode === 'by_step') return hasStepRagAction;
    if (mode === 'evaluation_only') return isEvaluationPurposeStep;
    return false;
}

export function shouldRunRagForEvaluation(mode: RagMode): boolean {
    if (mode === 'never') return false;
    if (mode === 'by_step') return false;
    return true;
}

export function toLegacyRagMode(mode: RagMode, strictMode: boolean): 'OFF' | 'AUTO' | 'FORCED' {
    if (mode === 'never') return 'OFF';
    return strictMode ? 'FORCED' : 'AUTO';
}
