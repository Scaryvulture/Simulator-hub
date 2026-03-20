import OpenAI from 'openai';

import { processDetectorTurn, type DetectorState, type DetectorTurnResult } from './detector-engine';
import type { BotConfig } from './schemas/bot-config';

export type DetectorUserImageAttachment = {
    mime_type: string;
    data_url: string;
};

type DetectorRuntimeDeps = {
    readSession: (sessionId: string) => Promise<{ metadata?: unknown } | null>;
    writeSession: (params: { sessionId: string; ended: boolean; metadata: Record<string, unknown> }) => Promise<void>;
    logUserMessage: (params: { sessionId: string; content: string; images: DetectorUserImageAttachment[] }) => Promise<void>;
    logAssistantMessage: (params: { sessionId: string; content: string; promptTokens: number; completionTokens: number; cost: number }) => Promise<void>;
    calculateCost: (model: string, promptTokens: number, completionTokens: number) => Promise<number>;
    incrementCostAudit: (params: { sessionId: string; model: string; tokensIn: number; tokensOut: number; costUsd: number }) => Promise<void>;
};

export type DetectorRuntimeInput = {
    sessionId: string;
    userLogContent: string;
    userMessage: string;
    userImages: DetectorUserImageAttachment[];
    config: BotConfig;
    openai: OpenAI;
    model: string;
};

export type DetectorRuntimeResult = {
    content: string;
    ended: boolean;
    usage: { prompt_tokens: number; completion_tokens: number } | null;
};

export async function processDetectorMessageRuntime(
    input: DetectorRuntimeInput,
    deps: DetectorRuntimeDeps
): Promise<DetectorRuntimeResult> {
    const { sessionId, userLogContent, userMessage, userImages, config, openai, model } = input;

    const session = await deps.readSession(sessionId);
    const metadata = (session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata))
        ? session.metadata as Record<string, unknown>
        : {};

    let detectorState = metadata.detector_state as DetectorState | undefined;
    if (!detectorState) {
        detectorState = {
            currentStepIndex: 0,
            findings: [],
            blocked: false,
            turnCount: 0,
            stepAttempts: 0,
            data: {},
        };
    }

    detectorState.turnCount += 1;

    let result: DetectorTurnResult;
    try {
        result = await processDetectorTurn({
            userMessage,
            userImages: userImages.map((image) => image.data_url),
            state: detectorState,
            config,
            openai,
            model,
        });
    } catch (error: unknown) {
        const safeMessage = (error instanceof Error ? error.message : 'Unknown runtime error').slice(0, 500);
        const failureReply = 'No pude continuar la detección porque falló el modelo configurado del bot. Revisá la configuración e intentá nuevamente.';
        const nextMetadata: Record<string, unknown> = {
            ...metadata,
            detector_state: detectorState,
            detector_error: {
                timestamp: new Date().toISOString(),
                message: safeMessage,
            },
        };

        await deps.writeSession({
            sessionId,
            ended: true,
            metadata: nextMetadata,
        });
        await deps.logUserMessage({
            sessionId,
            content: userLogContent,
            images: userImages,
        });
        await deps.logAssistantMessage({
            sessionId,
            content: failureReply,
            promptTokens: 0,
            completionTokens: 0,
            cost: 0,
        });

        return {
            content: failureReply,
            ended: true,
            usage: null,
        };
    }

    const nextMetadata: Record<string, unknown> = {
        ...metadata,
        detector_state: result.newState,
    };

    await deps.writeSession({
        sessionId,
        ended: result.ended,
        metadata: nextMetadata,
    });

    const promptTokens = result.usage?.prompt_tokens || 0;
    const completionTokens = result.usage?.completion_tokens || 0;
    const cost = await deps.calculateCost(model, promptTokens, completionTokens);

    await deps.logUserMessage({
        sessionId,
        content: userLogContent,
        images: userImages,
    });
    await deps.logAssistantMessage({
        sessionId,
        content: result.response,
        promptTokens,
        completionTokens,
        cost,
    });

    await deps.incrementCostAudit({
        sessionId,
        model,
        tokensIn: promptTokens,
        tokensOut: completionTokens,
        costUsd: cost,
    });

    return {
        content: result.response,
        ended: result.ended,
        usage: result.usage
            ? {
                prompt_tokens: result.usage.prompt_tokens,
                completion_tokens: result.usage.completion_tokens,
            }
            : null,
    };
}
