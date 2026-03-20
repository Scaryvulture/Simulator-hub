import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { processDetectorMessageRuntime, type DetectorUserImageAttachment } from '@/lib/detector-runtime';
import type { BotConfig } from '@/lib/schemas/bot-config';

function buildDeps(initialMetadata: Record<string, unknown> = {}) {
    let sessionEnded = false;
    let sessionMetadata: Record<string, unknown> = { ...initialMetadata };
    const userLogs: Array<{ content: string; images: DetectorUserImageAttachment[] }> = [];
    const assistantLogs: Array<{ content: string; promptTokens: number; completionTokens: number; cost: number }> = [];
    const audits: Array<{ model: string; tokensIn: number; tokensOut: number; costUsd: number }> = [];

    return {
        deps: {
            readSession: async () => ({ metadata: sessionMetadata }),
            writeSession: async (params: { sessionId: string; ended: boolean; metadata: Record<string, unknown> }) => {
                sessionEnded = params.ended;
                sessionMetadata = params.metadata;
            },
            logUserMessage: async (params: { sessionId: string; content: string; images: DetectorUserImageAttachment[] }) => {
                userLogs.push({ content: params.content, images: params.images });
            },
            logAssistantMessage: async (params: { sessionId: string; content: string; promptTokens: number; completionTokens: number; cost: number }) => {
                assistantLogs.push({
                    content: params.content,
                    promptTokens: params.promptTokens,
                    completionTokens: params.completionTokens,
                    cost: params.cost,
                });
            },
            calculateCost: async () => 0,
            incrementCostAudit: async (params: { sessionId: string; model: string; tokensIn: number; tokensOut: number; costUsd: number }) => {
                audits.push({
                    model: params.model,
                    tokensIn: params.tokensIn,
                    tokensOut: params.tokensOut,
                    costUsd: params.costUsd,
                });
            },
        },
        getState: () => ({ sessionEnded, sessionMetadata, userLogs, assistantLogs, audits }),
    };
}

describe('detector-runtime integration', () => {
    it('logs user images and advances first detector turn', async () => {
        const { deps, getState } = buildDeps();
        const config: BotConfig = {
            detection_steps: [
                {
                    id: 'step-1',
                    order: 0,
                    type: 'text',
                    instruction: 'Indicá el estado observado.',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        };

        const image: DetectorUserImageAttachment = {
            mime_type: 'image/png',
            data_url: 'data:image/png;base64,AAA',
        };

        const fakeOpenAI = {} as never;
        const result = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'mensaje con imagen',
                userMessage: 'mensaje con imagen',
                userImages: [image],
                config,
                openai: fakeOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );

        const state = getState();
        assert.equal(result.ended, false);
        assert.match(result.content, /Indicá el estado observado/);
        assert.equal(state.userLogs.length, 1);
        assert.deepEqual(state.userLogs[0].images, [image]);
        assert.equal(state.assistantLogs.length, 1);
        assert.equal(state.audits.length, 1);
        assert.deepEqual(state.audits[0], {
            model: 'gpt-4o-mini',
            tokensIn: 0,
            tokensOut: 0,
            costUsd: 0,
        });
    });

    it('persists detector state across turns and supports retry flow', async () => {
        const { deps, getState } = buildDeps();
        const config: BotConfig = {
            detection_steps: [
                {
                    id: 'step-retry',
                    order: 0,
                    type: 'text',
                    instruction: 'Respondé OK para avanzar.',
                    required: true,
                    keywords: ['ok'],
                    show_ref_on_uncertain: false,
                },
            ],
        };

        const fakeOpenAI = {} as never;

        const first = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'inicio',
                userMessage: 'inicio',
                userImages: [],
                config,
                openai: fakeOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );
        assert.equal(first.ended, false);
        assert.match(first.content, /Respondé OK para avanzar/);

        const second = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'respuesta mala',
                userMessage: 'no entiendo',
                userImages: [],
                config,
                openai: fakeOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );
        assert.equal(second.ended, false);
        assert.match(second.content, /No entendí\./);

        const third = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'respuesta buena',
                userMessage: 'ok',
                userImages: [],
                config,
                openai: fakeOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );
        assert.equal(third.ended, true);
        assert.match(third.content, /\*\*REPORTE FINAL DE DETECCIÓN\*\*/);

        const state = getState();
        assert.equal(state.sessionEnded, true);
        assert.equal(state.userLogs.length, 3);
        assert.equal(state.assistantLogs.length, 3);
        assert.equal(state.audits.length, 3);
    });

    it('returns deterministic blocked report when state is already blocked', async () => {
        const { deps } = buildDeps({
            detector_state: {
                currentStepIndex: 1,
                findings: [
                    {
                        stepId: 'img-1',
                        stepTitle: 'Revisión visual',
                        severity: 'CRITICAL',
                        explanation: 'Falla grave detectada.',
                    },
                ],
                blocked: true,
                turnCount: 2,
                stepAttempts: 0,
                data: { rol: 'soldador' },
            },
        });

        const config: BotConfig = {
            detection_steps: [
                {
                    id: 'img-1',
                    order: 0,
                    type: 'image',
                    instruction: 'Subí una imagen.',
                    required: true,
                    show_ref_on_uncertain: false,
                },
            ],
        };

        const fakeOpenAI = {} as never;
        const result = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'continuar',
                userMessage: 'continuar',
                userImages: [],
                config,
                openai: fakeOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );

        assert.equal(result.ended, true);
        assert.match(result.content, /\*\*Veredicto:\*\* NO HABILITADO/);
    });

    it('fails closed when detector model call throws', async () => {
        const { deps, getState } = buildDeps();
        const config: BotConfig = {
            detection_steps: [
                {
                    id: 'img-step',
                    order: 0,
                    type: 'image',
                    instruction: 'Subí la imagen del andamio.',
                    required: true,
                    criteria: 'Detectar fallas graves de seguridad.',
                    show_ref_on_uncertain: false,
                },
            ],
        };

        const failingOpenAI = {
            chat: {
                completions: {
                    create: async () => {
                        throw new Error('upstream model failure');
                    },
                },
            },
        } as never;

        const first = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'inicio',
                userMessage: 'inicio',
                userImages: [],
                config,
                openai: failingOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );
        assert.equal(first.ended, false);
        assert.match(first.content, /sub[íi] la imagen/i);

        const result = await processDetectorMessageRuntime(
            {
                sessionId: 'session-1',
                userLogContent: 'adjunto imagen',
                userMessage: 'adjunto imagen',
                userImages: [
                    { mime_type: 'image/png', data_url: 'https://example.com/img.png' },
                ],
                config,
                openai: failingOpenAI,
                model: 'gpt-4o-mini',
            },
            deps
        );

        const state = getState();
        assert.equal(result.ended, true);
        assert.match(result.content, /fall[oó] el modelo configurado/i);
        assert.equal(state.sessionEnded, true);
        assert.equal(state.assistantLogs.length, 2);
        assert.equal(state.assistantLogs[1].promptTokens, 0);
        assert.equal(state.assistantLogs[1].completionTokens, 0);
        assert.equal(state.audits.length, 1);
        assert.equal(typeof (state.sessionMetadata.detector_error as { message?: unknown } | undefined)?.message, 'string');
    });
});
