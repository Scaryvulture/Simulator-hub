import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RagService } from '@/lib/rag-service';

function jsonResponse(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });
}

describe('rag-service', () => {
    it('isolates wrapper cache by api key and fallback strategy', async () => {
        const originalFetch = globalThis.fetch;
        let vectorSearchCalls = 0;

        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = input instanceof Request
                ? input.url
                : (typeof input === 'string' ? input : input.toString());

            if (url.includes('/vector_stores/') && url.endsWith('/search')) {
                vectorSearchCalls += 1;
                return jsonResponse({
                    data: [
                        {
                            file_id: 'file_a',
                            filename: 'manual-a.md',
                            score: 0.95,
                            attributes: { area: 'seguridad' },
                            content: [{ type: 'text', text: 'Procedimiento de seguridad A.' }],
                        },
                    ],
                });
            }

            return jsonResponse({});
        }) as typeof fetch;

        try {
            const query = `cache-isolation-${Date.now()}-${Math.random()}`;
            const params = {
                vectorStoreIds: ['vs_test_cache'],
                query,
                mode: 'AUTO' as const,
                purpose: 'context' as const,
                topK: 3,
                cacheTtlSeconds: 120,
            };

            await RagService.retrieveEvidence({
                apiKey: 'sk-key-a',
                ...params,
                fallbackStrategy: 'safe_reply',
            });
            await RagService.retrieveEvidence({
                apiKey: 'sk-key-a',
                ...params,
                fallbackStrategy: 'safe_reply',
            });
            await RagService.retrieveEvidence({
                apiKey: 'sk-key-b',
                ...params,
                fallbackStrategy: 'safe_reply',
            });
            await RagService.retrieveEvidence({
                apiKey: 'sk-key-a',
                ...params,
                fallbackStrategy: 'rewrite_retry',
            });

            assert.equal(vectorSearchCalls, 3);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('retrieves platform evidence with configured limits and filters', async () => {
        const originalFetch = globalThis.fetch;
        const capturedBodies: Array<Record<string, unknown>> = [];

        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input instanceof Request
                ? input.url
                : (typeof input === 'string' ? input : input.toString());

            if (url.endsWith('/responses')) {
                let bodyText = '';
                if (input instanceof Request) {
                    bodyText = await input.clone().text();
                } else if (typeof init?.body === 'string') {
                    bodyText = init.body;
                }
                capturedBodies.push(bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {});

                return jsonResponse({
                    output: [
                        {
                            type: 'file_search_call',
                            results: [
                                {
                                    file_id: 'f-1',
                                    filename: 'playbook.pdf',
                                    score: 0.87,
                                    content: [{ type: 'text', text: 'Evidencia operacional prioritaria.' }],
                                },
                                {
                                    file_id: 'f-2',
                                    filename: 'policy.pdf',
                                    score: 0.61,
                                    content: [{ type: 'text', text: 'Evidencia secundaria.' }],
                                },
                            ],
                        },
                    ],
                });
            }

            return jsonResponse({});
        }) as typeof fetch;

        try {
            const result = await RagService.retrieveEvidencePlatform({
                apiKey: 'sk-platform',
                model: 'gpt-4o-mini',
                vectorStoreIds: ['vs_platform'],
                query: 'validar respuesta de seguridad',
                mode: 'FORCED',
                purpose: 'validate_user_response',
                topK: 1,
                metadataFilters: { topic: 'safety', active: true },
                rankingOptions: { score_threshold: 0.4 },
                forceTool: true,
                cacheTtlSeconds: 120,
                maxEvidenceTokens: 800,
            });

            assert.equal(capturedBodies.length, 1);
            const payload = capturedBodies[0];
            const tools = Array.isArray(payload.tools) ? payload.tools as Array<Record<string, unknown>> : [];
            assert.equal(tools.length, 1);
            assert.equal(payload.model, 'gpt-4o-mini');
            assert.equal(tools[0].max_num_results, 1);
            assert.deepEqual(tools[0].filters, { topic: 'safety', active: true });
            assert.deepEqual(tools[0].ranking_options, { score_threshold: 0.4 });
            assert.equal(payload.tool_choice, 'required');

            assert.equal(result.hasEvidence, true);
            assert.equal(result.evidence.length, 1);
            assert.equal(result.trace.rag_owner, 'platform');
            assert.equal(result.trace.rag_mode, 'FORCED');
            assert.equal(result.trace.top_k, 1);
            assert.match(result.evidencePack, /playbook\.pdf/);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('retries transient wrapper vector search failures before giving up', async () => {
        const originalFetch = globalThis.fetch;
        let vectorSearchCalls = 0;

        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = input instanceof Request
                ? input.url
                : (typeof input === 'string' ? input : input.toString());

            if (url.includes('/vector_stores/') && url.endsWith('/search')) {
                vectorSearchCalls += 1;
                if (vectorSearchCalls === 1) {
                    throw new Error('ETIMEDOUT while contacting vector store');
                }
                return jsonResponse({
                    data: [
                        {
                            file_id: 'file_retry',
                            filename: 'retry-manual.md',
                            score: 0.84,
                            attributes: { area: 'operaciones' },
                            content: [{ type: 'text', text: 'Evidencia recuperada tras reintento técnico.' }],
                        },
                    ],
                });
            }

            return jsonResponse({});
        }) as typeof fetch;

        try {
            const result = await RagService.retrieveEvidence({
                apiKey: 'sk-retry-wrapper',
                vectorStoreIds: ['vs_retry'],
                query: 'validar procedimiento operativo',
                mode: 'AUTO',
                purpose: 'validate_user_response',
                topK: 3,
                fallbackStrategy: 'none',
                cacheTtlSeconds: 120,
            });

            assert.equal(vectorSearchCalls, 2);
            assert.equal(result.hasEvidence, true);
            assert.equal(result.evidence.length, 1);
            assert.equal(result.trace.retrieval_error_count, undefined);
            assert.match(result.evidencePack, /reintento técnico/i);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('surfaces platform retrieval errors in trace when responses call fails', async () => {
        const originalFetch = globalThis.fetch;
        const originalConsoleError = console.error;
        let responseCalls = 0;

        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = input instanceof Request
                ? input.url
                : (typeof input === 'string' ? input : input.toString());

            if (url.endsWith('/responses')) {
                responseCalls += 1;
                throw new Error('503 Service Unavailable');
            }

            return jsonResponse({});
        }) as typeof fetch;
        console.error = (() => undefined) as typeof console.error;

        try {
            const result = await RagService.retrieveEvidencePlatform({
                apiKey: 'sk-platform-error',
                model: 'gpt-4o-mini',
                vectorStoreIds: ['vs_platform_error'],
                query: 'buscar evidencia',
                mode: 'FORCED',
                purpose: 'evaluate_conversation',
                topK: 2,
                forceTool: true,
            });

            assert.ok(responseCalls >= 1);
            assert.equal(result.hasEvidence, false);
            assert.equal(result.trace.fallback_applied, 'platform_error');
            assert.equal(result.trace.retrieval_error_count, 1);
            assert.match(result.trace.retrieval_error_sample || '', /connection error|503/i);
        } finally {
            console.error = originalConsoleError;
            globalThis.fetch = originalFetch;
        }
    });
});
