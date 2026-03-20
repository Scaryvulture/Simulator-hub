import OpenAI from 'openai';
import crypto from 'crypto';
import { createOpenAIClient } from './ai-client';

type Primitive = string | number | boolean;

export interface RagEvidence {
    vector_store_id: string;
    file_id: string;
    filename: string;
    excerpt: string;
    metadata: Record<string, Primitive>;
    rank: number;
    score: number;
}

export interface RagTrace {
    rag_used: boolean;
    rag_owner?: 'wrapper' | 'platform';
    rag_mode: 'OFF' | 'AUTO' | 'FORCED';
    purpose: 'context' | 'validate_user_response' | 'evaluate_conversation';
    strategy: 'metadata_first' | 'similarity' | 'hybrid';
    query: string;
    rewritten_query?: string;
    vector_store_ids: string[];
    filters_applied: Record<string, Primitive>;
    top_k: number;
    fallback_applied?: string;
    retrieval_error_count?: number;
    retrieval_error_sample?: string;
    evidence_pack_hash?: string;
    evidence_count: number;
    latency_ms?: number;
    top_results?: Array<{
        file_id: string;
        filename: string;
        score: number;
        excerpt: string;
    }>;
}

export interface RagRetrievalResult {
    hasEvidence: boolean;
    evidencePack: string;
    evidence: RagEvidence[];
    trace: RagTrace;
}

interface RagCacheEntry {
    expiresAt: number;
    result: RagRetrievalResult;
}

type VectorSearchFilter =
    | { type: 'eq'; key: string; value: Primitive }
    | { type: 'and'; filters: Array<{ type: 'eq'; key: string; value: Primitive }> };

type VectorSearchRequest = {
    query: string;
    max_num_results: number;
    rewrite_query: boolean;
    ranking_options?: { score_threshold: number };
    filters?: VectorSearchFilter;
};

type VectorSearchContentItem = {
    type?: string;
    text?: string;
};

type VectorSearchItem = {
    file_id?: string;
    filename?: string;
    score?: number;
    attributes?: Record<string, Primitive>;
    content?: VectorSearchContentItem[];
};

type VectorSearchPage = {
    data?: VectorSearchItem[];
};

type PlatformSearchContentItem = {
    type?: string;
    text?: string;
};

type PlatformSearchResultItem = {
    file_id?: string;
    filename?: string;
    score?: number;
    content?: PlatformSearchContentItem[];
};

type PlatformSearchCallOutput = {
    type?: string;
    results?: PlatformSearchResultItem[];
};

type PlatformSearchResponse = {
    output?: PlatformSearchCallOutput[];
};

type SearchStoreResult = {
    evidence: RagEvidence[];
    errorCount: number;
    errorSample?: string;
};

export class RagService {
    private static cache = new Map<string, RagCacheEntry>();

    static async retrieveEvidence(params: {
        apiKey: string;
        vectorStoreIds: string[];
        query: string;
        mode: 'OFF' | 'AUTO' | 'FORCED';
        purpose?: 'context' | 'validate_user_response' | 'evaluate_conversation';
        strategy?: 'metadata_first' | 'similarity' | 'hybrid';
        metadataFilters?: Record<string, Primitive>;
        topK?: number;
        searchThreshold?: number;
        fallbackStrategy?: 'rewrite_retry' | 'secondary_store' | 'safe_reply' | 'none';
        cacheTtlSeconds?: number;
        maxEvidenceTokens?: number;
        strictMode?: boolean;
    }): Promise<RagRetrievalResult> {
        const {
            apiKey,
            vectorStoreIds,
            query,
            mode,
            purpose = 'context',
            strategy = 'similarity',
            metadataFilters = {},
            topK = 4,
            searchThreshold,
            fallbackStrategy = 'none',
            cacheTtlSeconds = 90,
            maxEvidenceTokens = 1200,
        } = params;

        const cleanStoreIds = vectorStoreIds.filter(Boolean);
        const boundedTopK = Math.min(Math.max(1, topK), 50);
        const startedAt = Date.now();

        const emptyTrace: RagTrace = {
            rag_used: false,
            rag_mode: mode,
            purpose,
            strategy,
            query,
            vector_store_ids: cleanStoreIds,
            filters_applied: metadataFilters,
            top_k: boundedTopK,
            evidence_count: 0,
        };

        if (mode === 'OFF' || cleanStoreIds.length === 0) {
            return {
                hasEvidence: false,
                evidencePack: '',
                evidence: [],
                trace: emptyTrace,
            };
        }

        const cacheKey = JSON.stringify({
            owner: 'wrapper',
            api_key_hash: this.buildApiKeyHash(apiKey),
            cleanStoreIds,
            query,
            purpose,
            strategy,
            metadataFilters,
            topK: boundedTopK,
            searchThreshold,
            fallbackStrategy,
            mode,
            maxEvidenceTokens,
        });
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.result;
        }

        const openai = createOpenAIClient(apiKey);
        const primaryStore = cleanStoreIds[0];
        const secondaryStores = cleanStoreIds.slice(1);

        let rewrittenQuery: string | undefined;
        let fallbackApplied: string | undefined;
        let retrievalErrorCount = 0;
        let retrievalErrorSample: string | undefined;

        const initialSearch = await this.searchStore({
            openai,
            vectorStoreIds: [primaryStore],
            query,
            topK: boundedTopK,
            strategy,
            metadataFilters,
            searchThreshold,
            rewriteQuery: false,
        });

        let evidence = initialSearch.evidence;
        retrievalErrorCount += initialSearch.errorCount;
        if (!retrievalErrorSample && initialSearch.errorSample) {
            retrievalErrorSample = initialSearch.errorSample;
        }

        if (evidence.length === 0 && fallbackStrategy === 'rewrite_retry') {
            rewrittenQuery = this.rewriteQueryDeterministically(query);
            fallbackApplied = 'rewrite_retry';
            const rewrittenSearch = await this.searchStore({
                openai,
                vectorStoreIds: [primaryStore],
                query: rewrittenQuery,
                topK: boundedTopK,
                strategy,
                metadataFilters,
                searchThreshold,
                rewriteQuery: true,
            });
            evidence = rewrittenSearch.evidence;
            retrievalErrorCount += rewrittenSearch.errorCount;
            if (!retrievalErrorSample && rewrittenSearch.errorSample) {
                retrievalErrorSample = rewrittenSearch.errorSample;
            }
        }

        if (evidence.length === 0 && fallbackStrategy === 'secondary_store' && secondaryStores.length > 0) {
            fallbackApplied = fallbackApplied ? `${fallbackApplied}+secondary_store` : 'secondary_store';
            const secondarySearch = await this.searchStore({
                openai,
                vectorStoreIds: secondaryStores,
                query: rewrittenQuery || query,
                topK: boundedTopK,
                strategy,
                metadataFilters,
                searchThreshold,
                rewriteQuery: true,
            });
            evidence = secondarySearch.evidence;
            retrievalErrorCount += secondarySearch.errorCount;
            if (!retrievalErrorSample && secondarySearch.errorSample) {
                retrievalErrorSample = secondarySearch.errorSample;
            }
        }

        const combinedFallback = [
            fallbackApplied,
            retrievalErrorCount > 0 ? 'search_error' : undefined,
        ].filter(Boolean).join('+') || undefined;
        const packed = this.buildEvidencePack(evidence, maxEvidenceTokens);
        const result: RagRetrievalResult = {
            hasEvidence: evidence.length > 0,
            evidencePack: packed.pack,
            evidence: packed.evidence,
            trace: {
                rag_used: evidence.length > 0,
                rag_owner: 'wrapper',
                rag_mode: mode,
                purpose,
                strategy,
                query,
                rewritten_query: rewrittenQuery,
                vector_store_ids: cleanStoreIds,
                filters_applied: metadataFilters,
                top_k: boundedTopK,
                fallback_applied: combinedFallback,
                retrieval_error_count: retrievalErrorCount > 0 ? retrievalErrorCount : undefined,
                retrieval_error_sample: retrievalErrorSample,
                evidence_pack_hash: packed.hash,
                evidence_count: evidence.length,
                latency_ms: Date.now() - startedAt,
                top_results: packed.evidence.slice(0, 5).map((e) => ({
                    file_id: e.file_id,
                    filename: e.filename,
                    score: e.score,
                    excerpt: e.excerpt.slice(0, 300),
                })),
            },
        };

        this.cache.set(cacheKey, {
            expiresAt: now + Math.max(1, cacheTtlSeconds) * 1000,
            result,
        });

        return result;
    }

    static async retrieveEvidencePlatform(params: {
        apiKey: string;
        vectorStoreIds: string[];
        query: string;
        mode: 'OFF' | 'AUTO' | 'FORCED';
        purpose?: 'context' | 'validate_user_response' | 'evaluate_conversation';
        topK?: number;
        metadataFilters?: Record<string, Primitive>;
        rankingOptions?: { score_threshold?: number };
        forceTool?: boolean;
        cacheTtlSeconds?: number;
        maxEvidenceTokens?: number;
        model: string;
    }): Promise<RagRetrievalResult> {
        const {
            apiKey,
            vectorStoreIds,
            query,
            mode,
            purpose = 'context',
            topK = 6,
            metadataFilters = {},
            rankingOptions,
            forceTool = false,
            cacheTtlSeconds = 90,
            maxEvidenceTokens = 1200,
            model,
        } = params;
        const modelName = (model || '').trim();
        if (!modelName) {
            throw new Error('Modelo no configurado para retrieveEvidencePlatform.');
        }

        const cleanStoreIds = vectorStoreIds.filter(Boolean);
        const boundedTopK = Math.min(Math.max(1, topK), 50);
        const startedAt = Date.now();

        const emptyTrace: RagTrace = {
            rag_used: false,
            rag_owner: 'platform',
            rag_mode: mode,
            purpose,
            strategy: 'similarity',
            query,
            vector_store_ids: cleanStoreIds,
            filters_applied: metadataFilters,
            top_k: boundedTopK,
            evidence_count: 0,
        };

        if (mode === 'OFF' || cleanStoreIds.length === 0) {
            return {
                hasEvidence: false,
                evidencePack: '',
                evidence: [],
                trace: emptyTrace,
            };
        }

        const cacheKey = JSON.stringify({
            owner: 'platform',
            api_key_hash: this.buildApiKeyHash(apiKey),
            cleanStoreIds,
            query,
            purpose,
            topK: boundedTopK,
            metadataFilters,
            rankingOptions,
            mode,
            forceTool,
            maxEvidenceTokens,
            model: modelName,
        });
        const now = Date.now();
        const cached = this.cache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return cached.result;
        }

        try {
            const openai = createOpenAIClient(apiKey);
            const responsePayload: Record<string, unknown> = {
                model: modelName,
                input: [
                    {
                        role: 'system',
                        content: [
                            'Retrieve documentary evidence with file_search.',
                            'Use the user query as the search intent.',
                            'Do not fabricate facts.',
                        ].join(' '),
                    },
                    {
                        role: 'user',
                        content: query,
                    },
                ],
                tools: [
                    {
                        type: 'file_search',
                        vector_store_ids: cleanStoreIds,
                        max_num_results: boundedTopK,
                        ...(Object.keys(metadataFilters).length > 0 ? { filters: metadataFilters } : {}),
                        ...(rankingOptions ? { ranking_options: rankingOptions } : {}),
                    },
                ],
                include: ['file_search_call.results'],
            };

            if (forceTool || mode === 'FORCED') {
                responsePayload.tool_choice = 'required';
            }

            const response = await this.runWithTransientRetry(
                () => openai.responses.create(
                    responsePayload as Parameters<typeof openai.responses.create>[0]
                ) as unknown as Promise<PlatformSearchResponse>,
                { maxAttempts: 2, baseDelayMs: 220 }
            );

            const parsed = this.extractPlatformResults(cleanStoreIds, response);
            parsed.sort((a, b) => b.score - a.score);
            const deduped = this.dedupeEvidence(parsed)
                .slice(0, boundedTopK)
                .map((item, idx) => ({ ...item, rank: idx + 1 }));

            const packed = this.buildEvidencePack(deduped, maxEvidenceTokens);
            const result: RagRetrievalResult = {
                hasEvidence: deduped.length > 0,
                evidencePack: packed.pack,
                evidence: packed.evidence,
                trace: {
                    rag_used: deduped.length > 0,
                    rag_owner: 'platform',
                    rag_mode: mode,
                    purpose,
                    strategy: 'similarity',
                    query,
                    vector_store_ids: cleanStoreIds,
                    filters_applied: metadataFilters,
                    top_k: boundedTopK,
                    evidence_pack_hash: packed.hash,
                    evidence_count: deduped.length,
                    latency_ms: Date.now() - startedAt,
                    top_results: packed.evidence.slice(0, 5).map((e) => ({
                        file_id: e.file_id,
                        filename: e.filename,
                        score: e.score,
                        excerpt: e.excerpt.slice(0, 300),
                    })),
                },
            };

            this.cache.set(cacheKey, {
                expiresAt: now + Math.max(1, cacheTtlSeconds) * 1000,
                result,
            });

            return result;
        } catch (error) {
            console.error('Platform RAG retrieval failed', error);
            const errorMessage = this.extractErrorMessage(error);
            return {
                hasEvidence: false,
                evidencePack: '',
                evidence: [],
                trace: {
                    ...emptyTrace,
                    fallback_applied: 'platform_error',
                    retrieval_error_count: 1,
                    retrieval_error_sample: errorMessage.slice(0, 280),
                    latency_ms: Date.now() - startedAt,
                },
            };
        }
    }

    private static async searchStore(params: {
        openai: OpenAI;
        vectorStoreIds: string[];
        query: string;
        topK: number;
        strategy: 'metadata_first' | 'similarity' | 'hybrid';
        metadataFilters: Record<string, Primitive>;
        searchThreshold?: number;
        rewriteQuery: boolean;
    }): Promise<SearchStoreResult> {
        const {
            openai,
            vectorStoreIds,
            query,
            topK,
            strategy,
            metadataFilters,
            searchThreshold,
            rewriteQuery,
        } = params;

        const filterObj = this.toVectorSearchFilter(metadataFilters);
        const useMetadataFirst = strategy === 'metadata_first' || strategy === 'hybrid';
        const useFallbackSimilarity = strategy === 'hybrid';

        const all: RagEvidence[] = [];
        let errorCount = 0;
        let errorSample: string | undefined;

        for (const vectorStoreId of vectorStoreIds) {
            try {
                const primaryBody: VectorSearchRequest = {
                    query,
                    max_num_results: Math.min(Math.max(1, topK), 50),
                    rewrite_query: rewriteQuery,
                };

                if (searchThreshold !== undefined) {
                    primaryBody.ranking_options = { score_threshold: searchThreshold };
                }
                if (useMetadataFirst && filterObj) {
                    primaryBody.filters = filterObj;
                }

                const primaryPage = await this.runWithTransientRetry(
                    () => openai.vectorStores.search(vectorStoreId, primaryBody) as Promise<VectorSearchPage>,
                    { maxAttempts: 2, baseDelayMs: 160 }
                );
                const primaryItems = primaryPage?.data || [];
                all.push(...this.normalizeSearchResults(vectorStoreId, primaryItems));

                if (primaryItems.length === 0 && useFallbackSimilarity) {
                    const fallbackBody: VectorSearchRequest = {
                        query,
                        max_num_results: Math.min(Math.max(1, topK), 50),
                        rewrite_query: rewriteQuery,
                    };
                    if (searchThreshold !== undefined) {
                        fallbackBody.ranking_options = { score_threshold: searchThreshold };
                    }

                    const fallbackPage = await this.runWithTransientRetry(
                        () => openai.vectorStores.search(vectorStoreId, fallbackBody) as Promise<VectorSearchPage>,
                        { maxAttempts: 2, baseDelayMs: 160 }
                    );
                    const fallbackItems = fallbackPage?.data || [];
                    all.push(...this.normalizeSearchResults(vectorStoreId, fallbackItems));
                }
            } catch (error) {
                errorCount += 1;
                if (!errorSample) {
                    errorSample = this.extractErrorMessage(error).slice(0, 280);
                }
                console.error(`RAG search failed for vector store ${vectorStoreId}`, error);
            }
        }

        all.sort((a, b) => b.score - a.score);
        const deduped = this.dedupeEvidence(all);

        return {
            evidence: deduped.slice(0, topK).map((item, idx) => ({ ...item, rank: idx + 1 })),
            errorCount,
            errorSample,
        };
    }

    private static normalizeSearchResults(vectorStoreId: string, items: VectorSearchItem[]): RagEvidence[] {
        return items.map((item, index) => {
            const excerpt = (item?.content || [])
                .filter((c) => c?.type === 'text')
                .map((c) => c?.text || '')
                .join('\n')
                .trim();

            return {
                vector_store_id: vectorStoreId,
                file_id: item?.file_id || '',
                filename: item?.filename || 'unknown',
                excerpt,
                metadata: (item?.attributes || {}) as Record<string, Primitive>,
                rank: index + 1,
                score: typeof item?.score === 'number' ? item.score : 0,
            };
        }).filter((item) => !!item.excerpt);
    }

    private static dedupeEvidence(evidence: RagEvidence[]): RagEvidence[] {
        const seen = new Set<string>();
        const out: RagEvidence[] = [];
        for (const item of evidence) {
            const key = `${item.file_id}::${item.excerpt}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(item);
        }
        return out;
    }

    private static toVectorSearchFilter(metadataFilters: Record<string, Primitive>): VectorSearchFilter | undefined {
        const entries = Object.entries(metadataFilters || {}).filter(([, value]) => value !== undefined && value !== null && value !== '');
        if (entries.length === 0) return undefined;
        if (entries.length === 1) {
            const [key, value] = entries[0];
            return { type: 'eq', key, value };
        }
        return {
            type: 'and',
            filters: entries.map(([key, value]) => ({ type: 'eq', key, value })),
        };
    }

    private static extractPlatformResults(vectorStoreIds: string[], response: PlatformSearchResponse): RagEvidence[] {
        const output = Array.isArray(response?.output) ? response.output : [];
        const fallbackStoreId = vectorStoreIds[0] || 'platform';
        const results: RagEvidence[] = [];

        for (const item of output) {
            if (item?.type !== 'file_search_call') continue;
            const entries = Array.isArray(item?.results) ? item.results : [];
            for (const entry of entries) {
                const excerpt = (entry?.content || [])
                    .filter((contentItem) => contentItem?.type === 'text')
                    .map((contentItem) => contentItem?.text || '')
                    .join('\n')
                    .trim();
                if (!excerpt) continue;

                results.push({
                    vector_store_id: fallbackStoreId,
                    file_id: entry?.file_id || '',
                    filename: entry?.filename || 'unknown',
                    excerpt,
                    metadata: {},
                    rank: results.length + 1,
                    score: typeof entry?.score === 'number' ? entry.score : 0,
                });
            }
        }

        return results;
    }

    private static buildEvidencePack(evidence: RagEvidence[], maxEvidenceTokens: number): { pack: string; hash: string; evidence: RagEvidence[] } {
        if (evidence.length === 0) {
            const emptyHash = crypto.createHash('sha256').update('').digest('hex');
            return { pack: '', hash: emptyHash, evidence: [] };
        }

        const maxChars = Math.max(300, Math.floor(maxEvidenceTokens * 4));
        let consumed = 0;
        const normalized: RagEvidence[] = [];

        for (const item of evidence) {
            const remaining = maxChars - consumed;
            if (remaining <= 0) break;
            const excerpt = item.excerpt.slice(0, remaining);
            consumed += excerpt.length;
            normalized.push({
                ...item,
                excerpt,
            });
        }

        const pack = normalized.map((item) => {
            return [
                `[EVIDENCE ${item.rank}]`,
                `vector_store_id: ${item.vector_store_id}`,
                `file_id: ${item.file_id}`,
                `filename: ${item.filename}`,
                `score: ${item.score.toFixed(4)}`,
                `metadata: ${JSON.stringify(item.metadata)}`,
                `excerpt: ${item.excerpt}`,
            ].join('\n');
        }).join('\n\n');

        const hash = crypto.createHash('sha256').update(pack).digest('hex');
        return { pack, hash, evidence: normalized };
    }

    private static rewriteQueryDeterministically(query: string): string {
        return query
            .replace(/[^\p{L}\p{N}\s]/gu, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private static buildApiKeyHash(apiKey: string): string {
        return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
    }

    private static async runWithTransientRetry<T>(
        operation: () => Promise<T>,
        options?: { maxAttempts?: number; baseDelayMs?: number }
    ): Promise<T> {
        const maxAttempts = Math.max(1, options?.maxAttempts || 1);
        const baseDelayMs = Math.max(1, options?.baseDelayMs || 150);
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                const canRetry = attempt < maxAttempts && this.isTransientError(error);
                if (!canRetry) {
                    throw error;
                }
                await this.sleep(baseDelayMs * attempt);
            }
        }

        throw lastError instanceof Error
            ? lastError
            : new Error(this.extractErrorMessage(lastError));
    }

    private static isTransientError(error: unknown): boolean {
        const message = this.extractErrorMessage(error).toLowerCase();
        if (!message) return false;

        return [
            'timeout',
            'timed out',
            'etimedout',
            'econnreset',
            'connection reset',
            'network',
            'socket hang up',
            'temporarily unavailable',
            'service unavailable',
            'rate limit',
            '429',
            '502',
            '503',
            '504',
            'overloaded',
        ].some((marker) => message.includes(marker));
    }

    private static extractErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message || error.name || 'unknown_error';
        }
        if (typeof error === 'string') {
            return error;
        }
        try {
            return JSON.stringify(error);
        } catch {
            return 'unknown_error';
        }
    }

    private static async sleep(ms: number): Promise<void> {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
}
