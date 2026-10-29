import { randomUUID } from 'node:crypto';
import { withSessionOperation, readRuntimeSession } from './session-operation';
import { currentSessionOperation, SessionOperationError } from './session-operation-context';
import prisma from './prisma';
import OpenAI from 'openai';
import 'server-only';
import { decrypt, isEncrypted } from './crypto';
import { safeRegex } from './safe-regex';
import { FlowEngine, FlowConfig, FlowRagAction, FlowState } from './flow-engine';
import { BotService } from './bot-service';
import { sanitizeResponse } from './sanitizer';
import { RagService, RagTrace, RagRetrievalResult } from './rag-service';
import { normalizeRagConfig, shouldRunRagForChat, toLegacyRagMode } from './rag-config';
import type { NormalizedRagConfig } from './rag-config';
import {
    hasFlowEngineConfig as hasFlowEngineConfigValue,
    resolveRuntimeStrategy as resolveRuntimeStrategyValue,
    toFlowConfig as toFlowConfigValue,
    type RuntimeStrategy,
} from './director-strategy';
import { persistDeterministicTurn, persistModelTurn } from './director-turn-persistence';
import type { PhraseModelFallbackInput, PhraseModelFallbackResult } from './trigger-matcher';
import { PhraseFallbackBudget } from './phrase-fallback-budget';
import {
    createInitialExaminerState,
    ensureExaminerState,
    getExaminerIntroMessage,
    hasExaminerQuestionBank,
    parseExpectedKeys,
    processExaminerTurn,
    type DeterministicExamEvaluation,
    type ExaminerSemanticEvaluation,
} from './examiner-engine';
import { processDetectorMessageRuntime } from './detector-runtime';
import type { Question } from './question-selector';
import { SessionCostScope } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { incrementSessionCostAudit } from './session-cost-audit';
import type { BotConfig } from './schemas/bot-config';

// BotConfig interface removed (using Zod schema type)

import { PricingService } from './pricing';
import { createOpenAIClient } from './ai-client';
import {
    detectGenericTerminalIntent,
    extractSessionVarUpdates,
    generateSessionVars,
    getGenericClosingMessage,
    getGenericGoodbyeMessage,
    interpolateVars,
    promptSessionVars,
    withSessionVarUpdateProtocol,
    type SessionVars,
} from './director-session-vars';
import {
    executeRuntimeToolCall,
    extractRuntimeToolCalls,
    isLikelyReasoningModel,
    sanitizeConfiguredTools,
    type PlatformTraceOutputEntry,
    type RawResponsesCreateResult,
    type RuntimeToolCall,
} from './director-runtime-tools';
import {
    processImageTriggers,
    toStoredImageAttachments,
    type UserImageAttachment,
} from './director-images';
import {
    appendLlmPromptTrace,
    appendRagTrace,
    appendTriggerTraces,
    blockSessionForInvalidConfig,
    syncSessionVars,
    updateSessionMetadataPreservingAudit,
} from './director-metadata';

type ChatRole = 'user' | 'assistant' | 'system';
type HistoryItem = { role: ChatRole; content: string };
type UsageSummary = { prompt_tokens?: number; completion_tokens?: number } | null;
type ResponseModelControls = {
    text_format: 'text' | 'json_object';
    reasoning_effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    verbosity: 'low' | 'medium' | 'high';
    summary: 'auto' | 'concise' | 'detailed';
    store_logs: boolean;
};

const DEFAULT_RESPONSE_MODEL_CONTROLS: ResponseModelControls = {
    text_format: 'text',
    reasoning_effort: 'medium',
    verbosity: 'medium',
    summary: 'auto',
    store_logs: true,
};

export class Director {
    private static readonly PHRASE_FALLBACK_CACHE_LIMIT = 500;
    private static readonly PHRASE_FALLBACK_CACHE_TTL_MS = 10 * 60 * 1000;
    private static readonly PHRASE_FALLBACK_MAX_PER_TURN = 2;
    private static readonly PHRASE_FALLBACK_MAX_PER_INTENT_PER_TURN = 1;
    private static readonly TOOL_CALL_MAX_ROUNDS = 4;
    private static readonly SESSION_VAR_UPDATE_OPEN_TAG = '<SESSION_VARS_UPDATE>';
    private static readonly SESSION_VAR_UPDATE_CLOSE_TAG = '</SESSION_VARS_UPDATE>';
    private static readonly SESSION_ALREADY_ENDED_REPLY = 'La sesión ha finalizado.';
    private static readonly SESSION_ALREADY_ENDED_REASON = 'SESSION_ALREADY_ENDED';
    private static readonly INVALID_CONFIG_REPLY = 'Este bot está temporalmente deshabilitado por configuración inválida. Contacta al administrador.';
    private static readonly EXAMINER_RUNTIME_FAILURE_REPLY = 'No pude continuar el examen porque falló una validación automática del modelo configurado. Revisá la configuración e intentá nuevamente.';
    private static phraseFallbackCache = new Map<string, { expiresAt: number; value: PhraseModelFallbackResult }>();

    private static getPhraseFallbackCache(key: string): PhraseModelFallbackResult | null {
        const entry = this.phraseFallbackCache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.phraseFallbackCache.delete(key);
            return null;
        }
        return entry.value;
    }

    private static setPhraseFallbackCache(key: string, value: PhraseModelFallbackResult) {
        this.phraseFallbackCache.set(key, {
            expiresAt: Date.now() + this.PHRASE_FALLBACK_CACHE_TTL_MS,
            value,
        });

        if (this.phraseFallbackCache.size <= this.PHRASE_FALLBACK_CACHE_LIMIT) return;
        const oldestKey = this.phraseFallbackCache.keys().next().value;
        if (oldestKey) this.phraseFallbackCache.delete(oldestKey);
    }

    private static normalizeResponseModelControls(raw: unknown): ResponseModelControls {
        const source = (raw && typeof raw === 'object' && !Array.isArray(raw))
            ? raw as Record<string, unknown>
            : {};

        const textFormat = source.text_format;
        const reasoningEffort = source.reasoning_effort;
        const verbosity = source.verbosity;
        const summary = source.summary;

        return {
            text_format: textFormat === 'json_object' ? 'json_object' : DEFAULT_RESPONSE_MODEL_CONTROLS.text_format,
            reasoning_effort: (
                reasoningEffort === 'none'
                || reasoningEffort === 'minimal'
                || reasoningEffort === 'low'
                || reasoningEffort === 'medium'
                || reasoningEffort === 'high'
                || reasoningEffort === 'xhigh'
            ) ? reasoningEffort : DEFAULT_RESPONSE_MODEL_CONTROLS.reasoning_effort,
            verbosity: (
                verbosity === 'low'
                || verbosity === 'medium'
                || verbosity === 'high'
            ) ? verbosity : DEFAULT_RESPONSE_MODEL_CONTROLS.verbosity,
            summary: (
                summary === 'auto'
                || summary === 'concise'
                || summary === 'detailed'
            ) ? summary : DEFAULT_RESPONSE_MODEL_CONTROLS.summary,
            store_logs: typeof source.store_logs === 'boolean'
                ? source.store_logs
                : DEFAULT_RESPONSE_MODEL_CONTROLS.store_logs,
        };
    }

    private static async blockSessionForInvalidConfig(sessionId: string, botId: string, issues: string[]): Promise<void> {
        await blockSessionForInvalidConfig(sessionId, botId, issues);
    }

    private static resolveRuntimeStrategy(botType: string | null | undefined): RuntimeStrategy {
        return resolveRuntimeStrategyValue(botType);
    }

    private static hasFlowEngineConfig(config: BotConfig): boolean {
        return hasFlowEngineConfigValue(config);
    }

    private static toFlowConfig(config: BotConfig): FlowConfig {
        return toFlowConfigValue(config);
    }

    private static resolveConfiguredRuntimeModel(config: BotConfig): string | null {
        const configuredModel = typeof config.llm_model === 'string' ? config.llm_model.trim() : '';
        return configuredModel ? configuredModel : null;
    }

    private static requireConfiguredRuntimeModel(config: BotConfig): string {
        const model = this.resolveConfiguredRuntimeModel(config);
        if (model) return model;
        throw new Error('Modelo no configurado: definí llm_model explícitamente en la configuración visual del bot.');
    }

    private static async persistDeterministicReply(params: {
        sessionId: string;
        userLogContent: string;
        assistantContent: string;
        userImages?: UserImageAttachment[];
    }): Promise<void> {
        await persistDeterministicTurn({
            logMessage: (...args) => this.logMessage(...args),
            sessionId: params.sessionId,
            userLogContent: params.userLogContent,
            assistantContent: params.assistantContent,
            userImages: params.userImages,
        });
    }

    private static async persistModelReply(params: {
        sessionId: string;
        userLogContent: string;
        assistantContent: string;
        model: string;
        tokensIn: number;
        tokensOut: number;
        costUsd: number;
        userImages?: UserImageAttachment[];
        skipCostAudit?: boolean;
    }): Promise<void> {
        await persistModelTurn({
            logMessage: (...args) => this.logMessage(...args),
            incrementCostAudit: async ({ sessionId, model, tokensIn, tokensOut, costUsd }) => {
                await incrementSessionCostAudit({
                    sessionId,
                    scope: SessionCostScope.CHAT,
                    model,
                    tokensIn,
                    tokensOut,
                    messages: 1,
                    costUsd,
                });
            },
            sessionId: params.sessionId,
            userLogContent: params.userLogContent,
            assistantContent: params.assistantContent,
            model: params.model,
            tokensIn: params.tokensIn,
            tokensOut: params.tokensOut,
            costUsd: params.costUsd,
            userImages: params.userImages,
            skipCostAudit: params.skipCostAudit,
        });
    }

    private static responseControlsRequireResponsesApi(controls: ResponseModelControls): boolean {
        return controls.text_format !== DEFAULT_RESPONSE_MODEL_CONTROLS.text_format
            || controls.reasoning_effort !== DEFAULT_RESPONSE_MODEL_CONTROLS.reasoning_effort
            || controls.verbosity !== DEFAULT_RESPONSE_MODEL_CONTROLS.verbosity
            || controls.summary !== DEFAULT_RESPONSE_MODEL_CONTROLS.summary
            || controls.store_logs !== DEFAULT_RESPONSE_MODEL_CONTROLS.store_logs;
    }

    private static sanitizeConfiguredTools(raw: unknown): Array<Record<string, unknown>> {
        return sanitizeConfiguredTools(raw);
    }

    private static extractRuntimeToolCalls(response: RawResponsesCreateResult): RuntimeToolCall[] {
        return extractRuntimeToolCalls(response);
    }

    private static executeRuntimeToolCall(call: RuntimeToolCall, sessionVars: SessionVars): string {
        return executeRuntimeToolCall(call, sessionVars);
    }

    private static isLikelyReasoningModel(model: string): boolean {
        return isLikelyReasoningModel(model);
    }

    /**
     * Initialize a new session with flow state and intro message.
     * Works for ALL bot types - generates intro before user's first message.
     */
    static async initSession(sessionId: string, botId: string): Promise<{ introMessage: string | null; flowState: FlowState; vars: SessionVars }> {
        return withSessionOperation(sessionId, 'init', async () => {
            const session = await readRuntimeSession(sessionId);
            if (!session || session.bot_id !== botId) throw new SessionOperationError('Session does not match bot');
            const metadata = (session.metadata || {}) as Record<string, unknown>;
            if (session.ended) throw new SessionOperationError('La sesión ya está cerrada.');
            if (metadata.initialization_result) return metadata.initialization_result as { introMessage: string | null; flowState: FlowState; vars: SessionVars };
            if (metadata.flow_state || metadata.examiner_state || metadata.detector_state) {
                const first = await prisma.message.findFirst({ where: { session_id: sessionId, role: 'assistant' }, orderBy: { created_at: 'asc' } });
                const vars = (metadata.session_vars || {}) as SessionVars;
                return { introMessage: first?.content || null, vars, flowState: (metadata.flow_state || { current_step: 'CONVERSATION', completed_steps: [], vars, ended: false }) as FlowState };
            }
            const result = await this.initSessionUnlocked(sessionId, botId);
            await this.updateSessionMetadataPreservingAudit({ sessionId, patch: { initialized: true, initialization_result: result } });
            return result;
        });
    }

    private static async initSessionUnlocked(sessionId: string, botId: string): Promise<{ introMessage: string | null; flowState: FlowState; vars: SessionVars }> {
        const { bot, config, validation } = await BotService.getBot(botId, sessionId);
        if (validation.block_runtime) {
            const flowState: FlowState = {
                current_step: 'BLOCKED',
                completed_steps: [],
                vars: {},
                ended: true,
            };
            await this.blockSessionForInvalidConfig(sessionId, botId, validation.issues);
            await this.logMessage(sessionId, 'assistant', this.INVALID_CONFIG_REPLY, 0, 0, 0);
            return {
                introMessage: this.INVALID_CONFIG_REPLY,
                flowState,
                vars: {},
            };
        }
        const hasFlowEngine = this.hasFlowEngineConfig(config);

        // ========== GENERATE SESSION VARIABLES ==========
        // These apply to ALL bots, not just flow engine
        let sessionVars: SessionVars = {};

        if (config.session_vars) {
            sessionVars = this.generateSessionVars(config.session_vars, config.variable_rules);
        }

        // ========== GENERATE INTRO MESSAGE ==========
        let introMessage: string | null = null;
        let flowState: FlowState = {
            current_step: 'CONVERSATION',
            completed_steps: [],
            vars: sessionVars,
            ended: false,
        };

        if (bot.bot_type === 'EXAMINER' && hasExaminerQuestionBank(config)) {
            if (hasFlowEngine) {
                const flowConfig = this.toFlowConfig(config);
                flowState = FlowEngine.createInitialState(flowConfig);
                flowState.vars = { ...sessionVars };
            }

            const intro = this.interpolateVars(getExaminerIntroMessage(config), sessionVars);
            if (intro) {
                await this.logMessage(sessionId, 'assistant', intro, 0, 0, 0);
            }

            await this.updateSessionMetadataPreservingAudit({
                sessionId,
                patch: {
                    flow_state: flowState as unknown as Record<string, unknown>,
                    session_vars: sessionVars as unknown as Record<string, unknown>,
                    examiner_state: createInitialExaminerState() as unknown as Record<string, unknown>,
                },
            });

            return {
                introMessage: intro,
                flowState,
                vars: sessionVars,
            };
        }

        // Priority 1: Use intro_message template if configured (most common case)
        if (config.intro_message) {
            introMessage = this.interpolateVars(config.intro_message, sessionVars);
        }

        // Priority 2: If using Flow Engine, set up flow state (but don't override intro if already set)
        if (hasFlowEngine) {
            const flowConfig = this.toFlowConfig(config);

            flowState = FlowEngine.createInitialState(flowConfig);
            flowState.vars = { ...sessionVars };

            // Only use Flow Engine intro if no intro_message was configured
            if (!introMessage) {
                const result = await FlowEngine.processMessage(flowConfig, '', flowState, true, {
                    collect_trigger_audit: true,
                });
                introMessage = result.response;
                flowState = result.newState;
                if (result.triggerAudit?.length) {
                    await this.appendTriggerTraces(sessionId, result.triggerAudit);
                }
            }
        }

        // Priority 3: Legacy scenarios fallback
        if (!introMessage && config.scenarios && config.scenarios.length > 0) {
            const scenario = config.scenarios[Math.floor(Math.random() * config.scenarios.length)];
            introMessage = typeof scenario === 'string' ? scenario : JSON.stringify(scenario);
        }

        // ========== SAVE TO DATABASE ==========
        if (introMessage) {
            await this.logMessage(sessionId, 'assistant', introMessage, 0, 0, 0);
        }

        // Update session metadata with flow state and vars
        await this.updateSessionMetadataPreservingAudit({
            sessionId,
            patch: {
                flow_state: flowState as unknown as Record<string, unknown>,
                session_vars: sessionVars as unknown as Record<string, unknown>,
            },
        });

        return {
            introMessage,
            flowState,
            vars: sessionVars,
        };
    }

    /**
     * Generate random session variables respecting interdependencies
     */
    private static generateSessionVars(
        sessionVarsConfig: unknown,
        variableRules?: Record<string, { depends_on: string; mappings: Record<string, string[]> }>
    ): SessionVars {
        return generateSessionVars(sessionVarsConfig, variableRules);
    }

    /**
     * Replace {varname} placeholders with actual values
     */
    private static interpolateVars(template: string, vars: SessionVars): string {
        return interpolateVars(template, vars);
    }

    private static extractSessionVarUpdates(
        content: string,
        currentVars: SessionVars
    ): { cleanContent: string; updates: SessionVars } {
        return extractSessionVarUpdates(content, currentVars, {
            openTag: this.SESSION_VAR_UPDATE_OPEN_TAG,
            closeTag: this.SESSION_VAR_UPDATE_CLOSE_TAG,
        });
    }

    private static withSessionVarUpdateProtocol(instructions: string, vars: SessionVars): string {
        return withSessionVarUpdateProtocol(instructions, vars, {
            openTag: this.SESSION_VAR_UPDATE_OPEN_TAG,
            closeTag: this.SESSION_VAR_UPDATE_CLOSE_TAG,
        });
    }

    private static withRagGroundingProtocol(params: {
        instructions: string;
        ragQuery: string;
        ragPurpose: 'context' | 'validate_user_response' | 'evaluate_conversation';
        forceDirectAnswer: boolean;
    }): string {
        const { instructions, ragQuery, ragPurpose, forceDirectAnswer } = params;
        const lines = [
            instructions,
            '',
            '[PROTOCOLO RAG OBLIGATORIO]',
            `Objetivo de recuperacion: ${ragQuery}`,
            `Proposito: ${ragPurpose}`,
            'Responde usando la evidencia recuperada como fuente principal de hechos.',
            'Incluye datos concretos (nombres, dias, montos, topes, condiciones) cuando existan en evidencia.',
            'Si un dato no aparece en evidencia, dilo de forma explicita.',
            'No inventes informacion.',
        ];
        if (forceDirectAnswer) {
            lines.push('Si la evidencia ya permite responder, NO hagas preguntas de seguimiento genericas.');
        }
        return lines.join('\n');
    }

    private static promptSessionVars(vars: SessionVars): SessionVars {
        return promptSessionVars(vars);
    }

    private static async updateSessionMetadataPreservingAudit(params: {
        sessionId: string;
        ended?: boolean;
        patch: Record<string, unknown>;
    }): Promise<void> {
        await updateSessionMetadataPreservingAudit(params);
    }

    private static async syncSessionVars(sessionId: string, vars: SessionVars): Promise<void> {
        await syncSessionVars(sessionId, vars);
    }

    private static formatDeterministicReply(
        response: string,
        imageTriggers?: Array<{ pattern: string; image_url: string; caption?: string }>
    ): string {
        let content = this.processImageTriggers(response, imageTriggers);
        content = sanitizeResponse(content);
        return content;
    }

    private static getGenericGoodbyeMessage(config: BotConfig): string {
        return getGenericGoodbyeMessage(config);
    }

    private static getGenericClosingMessage(config: BotConfig): string {
        return getGenericClosingMessage(config);
    }

    private static detectGenericTerminalIntent(message: string, config: BotConfig): 'GOODBYE' | 'CLOSING' | null {
        return detectGenericTerminalIntent(message, config);
    }

    static async processMessage(sessionId: string, botId: string, userMessage: string, userImages: UserImageAttachment[] = [], requestId?: string) {
        return withSessionOperation(sessionId, 'message', () => this.processMessageUnlocked(sessionId, botId, userMessage, userImages),
            requestId ? { id: requestId, payload: { botId, userMessage, userImages } } : undefined);
    }

    private static async processMessageUnlocked(sessionId: string, botId: string, userMessage: string, userImages: UserImageAttachment[]) {
        const { bot: botEntity, config, validation } = await BotService.getBot(botId, sessionId);
        const botData = botEntity;
        const strategy = this.resolveRuntimeStrategy(botData.bot_type);
        const userLogContent = userImages.length > 0
            ? `${userMessage}\n\n[Adjuntos: ${userImages.length} imagen(es)]`
            : userMessage;

        // Check if session is already ended before processing a new turn
        const session = await readRuntimeSession(sessionId);

        if (session?.ended) {
            return {
                content: this.SESSION_ALREADY_ENDED_REPLY,
                bypass: true,
                ended: true,
                end_reason: this.SESSION_ALREADY_ENDED_REASON,
            };
        }

        if (validation.block_runtime) {
            await this.blockSessionForInvalidConfig(sessionId, botId, validation.issues);
            await this.persistDeterministicReply({
                sessionId,
                userLogContent,
                assistantContent: this.INVALID_CONFIG_REPLY,
            });
            return { content: this.INVALID_CONFIG_REPLY, bypass: true, ended: true };
        }

        // Decrypt API key if encrypted
        let apiKey = botData.api_key;
        if (!apiKey) {
            throw new Error('Bot API Key not configured. Individual keys are mandatory.');
        }

        try {
            if (isEncrypted(apiKey)) {
                apiKey = decrypt(apiKey);
            }
        } catch {
            throw new Error('Failed to decrypt API key. Please reconfigure the bot.');
        }
        if (!apiKey) {
            throw new Error('Bot API key is invalid. Please reconfigure the bot.');
        }

        const rawPromptValue = (botData.openai_prompt_id || '').trim();
        const promptId = rawPromptValue.startsWith('pmpt_') ? rawPromptValue : '';
        const runtimeModel = this.requireConfiguredRuntimeModel(config);
        const promptVersion = botData.prompt_version || '1';
        const responseModelControls = this.normalizeResponseModelControls(config.model_controls);
        const rag = normalizeRagConfig(config.rag_config || {}, botData.openai_vector_store_id);
        const historyLimit = rag.history_limit || 10;
        let flowRagAction: FlowRagAction | undefined;
        let sessionVars: SessionVars = {};
        let sessionVarsChangedByAssistant = false;
        const hasFlowEngine = this.hasFlowEngineConfig(config);
        const phraseFallbackBudget = new PhraseFallbackBudget({
            max_per_turn: this.PHRASE_FALLBACK_MAX_PER_TURN,
            max_per_intent_per_turn: this.PHRASE_FALLBACK_MAX_PER_INTENT_PER_TURN,
        });

        const phraseModelFallback = async (input: PhraseModelFallbackInput): Promise<PhraseModelFallbackResult> => {
            if (!phraseFallbackBudget.consume(input)) {
                return { match: false, confidence: 0 };
            }
            return this.classifyPhraseFallback(apiKey, input, runtimeModel, sessionId);
        };

        // =====================================================================
        // GLOBAL BLOCKERS (Priority 0) - Detector standalone path
        // =====================================================================
        if (strategy === 'DETECTOR' && config.global_triggers && config.global_triggers.length > 0) {
            const sessionMetadata = (session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata))
                ? session.metadata as Record<string, unknown>
                : {};
            let flowState = (sessionMetadata.flow_state as FlowState | undefined) || null;

            // If no flow state but we have global triggers, create a minimal state
            if (!flowState) {
                // We might need to initialize vars too if they exist in config
                const initialVars = this.generateSessionVars(config.session_vars || {}, config.variable_rules);
                flowState = FlowEngine.createInitialState({
                    ...this.toFlowConfig(config),
                    flow_steps: [],
                });
                flowState.vars = initialVars;
            }

            // Execute ONLY global triggers (empty flow_steps prevents flow engine from advancing main flow)
            const globalCheckConfig: FlowConfig = {
                ...this.toFlowConfig(config),
                flow_steps: [],
            };

            const result = await FlowEngine.processMessage(globalCheckConfig, userMessage, flowState, false, {
                collect_trigger_audit: true,
                phrase_model_fallback: phraseModelFallback
            });

            // If a trigger fired, it returns a response. WE MUST STOP HERE.
            if (result.response) {
                // Save state (vars might have changed, or ended status)
                await this.updateSessionMetadataPreservingAudit({
                    sessionId,
                    ended: result.ended,
                    patch: {
                        flow_state: result.newState as unknown as Record<string, unknown>,
                        session_vars: (result.newState.vars || {}) as unknown as Record<string, unknown>,
                    },
                });

                if (result.triggerAudit?.length) {
                    await this.appendTriggerTraces(sessionId, result.triggerAudit);
                }

                const blockerContent = this.formatDeterministicReply(result.response, config.image_triggers);
                await this.persistDeterministicReply({
                    sessionId,
                    userLogContent,
                    assistantContent: blockerContent,
                });
                return {
                    content: blockerContent,
                    bypass: true,
                    ended: result.ended,
                    flowState: result.newState
                };
            }

            if (result.useLLM && result.llmContext) {
                const blockerResult = await this.runFlowLlmStep({
                    sessionId,
                    apiKey,
                    config,
                    rag,
                    flowRagAction: result.ragAction,
                    llmContext: result.llmContext,
                    sessionVars: result.newState?.vars || {},
                    userMessage,
                    userImages,
                    model: runtimeModel,
                    promptId,
                    promptVersion,
                    historyLimit,
                    responseControls: responseModelControls,
                });

                const nextFlowState: FlowState = {
                    ...(result.newState || FlowEngine.createInitialState({
                        ...this.toFlowConfig(config),
                        flow_steps: [],
                    })),
                    vars: blockerResult.sessionVars,
                };

                await this.updateSessionMetadataPreservingAudit({
                    sessionId,
                    ended: result.ended,
                    patch: {
                        flow_state: nextFlowState as unknown as Record<string, unknown>,
                        session_vars: blockerResult.sessionVars as unknown as Record<string, unknown>,
                    },
                });

                if (result.triggerAudit?.length) {
                    await this.appendTriggerTraces(sessionId, result.triggerAudit);
                }

                const tokensIn = blockerResult.usage?.prompt_tokens || 0;
                const tokensOut = blockerResult.usage?.completion_tokens || 0;
                const blockerContent = blockerResult.content;
                await this.persistModelReply({
                    sessionId,
                    userLogContent,
                    assistantContent: blockerContent,
                    model: runtimeModel,
                    tokensIn,
                    tokensOut,
                    costUsd: blockerResult.costUsd,
                });

                return {
                    content: blockerContent,
                    bypass: true,
                    ended: result.ended,
                    ...(blockerResult.ragNoEvidence ? { rag_no_evidence: true } : {}),
                };
            }

            // If no trigger fired, update our local sessionVars with any changes (e.g. captured inputs)
            // and continue to strategy.
            // Note: We don't persist state here to avoid partial updates, unless necessary?
            // If a trigger captured a var but didn't return a response (silent capture?), we should probably persist.
            // But usually triggers either match+respond or don't match. 
            // If `result` has no response, `FlowEngine` returns response: null. 
            // `newState` is returned.
            // Let's adopt the new vars locally.
            if (result.newState?.vars) {
                sessionVars = result.newState.vars;
            }
        }


        if (strategy === 'EXAMINER' && hasExaminerQuestionBank(config)) {
            return await this.processExaminerMessage({
                sessionId,
                userLogContent,
                userMessage,
                config,
                apiKey,
                rag,
                llmModel: runtimeModel,
                promptId,
                promptVersion,
                historyLimit,
                responseControls: responseModelControls,
                phraseModelFallback,
            });
        }

        if (strategy === 'DETECTOR') {
            return await this.processDetectorMessage({
                sessionId,
                userLogContent,
                userMessage,
                userImages,
                config,
                apiKey,
                rag,
                model: runtimeModel,
            });
        }

        // Conversational runtime path shared by:
        // - GENERIC
        // - SIMULATOR
        // - EXAMINER without question_bank (legacy compatibility)

        // =====================================================================
        // FLOW ENGINE INTEGRATION
        // =====================================================================
        if (hasFlowEngine) {
            // Get current session to retrieve flow state
            // Reusing session fetched at the start of the method

            const sessionMetadata = (session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata))
                ? session.metadata as Record<string, unknown>
                : {};
            const currentFlowState = (sessionMetadata.flow_state as FlowState | undefined) || null;

            // If no flow state, initialize it
            let flowState = currentFlowState;
            if (!flowState) {
                const init = await this.initSession(sessionId, botId);
                flowState = init.flowState;
            }

            // Check if session already ended
            if (flowState.ended) {
                return {
                    content: this.SESSION_ALREADY_ENDED_REPLY,
                    bypass: true,
                    ended: true,
                    end_reason: this.SESSION_ALREADY_ENDED_REASON,
                };
            }

            const flowConfig = this.toFlowConfig(config);

            // Process message through flow engine
            const flowResult = await FlowEngine.processMessage(flowConfig, userMessage, flowState, false, {
                phrase_model_fallback: phraseModelFallback,
                collect_trigger_audit: true,
            });

            // Update session with new flow state AND ended status
            await this.updateSessionMetadataPreservingAudit({
                sessionId,
                ended: flowResult.ended,
                patch: {
                    flow_state: flowResult.newState as unknown as Record<string, unknown>,
                    session_vars: (flowResult.newState.vars || {}) as unknown as Record<string, unknown>,
                },
            });
            if (flowResult.triggerAudit?.length) {
                await this.appendTriggerTraces(sessionId, flowResult.triggerAudit);
            }

            // If SCRIPTED step matched, return the response directly (no LLM)
            if (!flowResult.useLLM && flowResult.response) {
                let scriptedContent = this.processImageTriggers(flowResult.response, config.image_triggers);
                scriptedContent = sanitizeResponse(scriptedContent);

                await this.persistDeterministicReply({
                    sessionId,
                    userLogContent,
                    assistantContent: scriptedContent,
                });
                return {
                    content: scriptedContent,
                    bypass: true,
                    ended: flowResult.ended,
                    flowState: flowResult.newState,
                };
            }

            if (flowResult.useLLM && flowResult.llmContext && strategy === 'GENERIC') {
                const llmFlowResult = await this.runFlowLlmStep({
                    sessionId,
                    apiKey,
                    config,
                    rag,
                    flowRagAction: flowResult.ragAction,
                    llmContext: flowResult.llmContext,
                    sessionVars: flowResult.newState.vars || {},
                    userMessage,
                    userImages,
                    model: runtimeModel,
                    promptId,
                    promptVersion,
                    historyLimit,
                    responseControls: responseModelControls,
                });

                await this.updateSessionMetadataPreservingAudit({
                    sessionId,
                    ended: flowResult.ended,
                    patch: {
                        flow_state: {
                            ...flowResult.newState,
                            vars: llmFlowResult.sessionVars,
                        } as unknown as Record<string, unknown>,
                        session_vars: llmFlowResult.sessionVars as unknown as Record<string, unknown>,
                    },
                });

                const tokensIn = llmFlowResult.usage?.prompt_tokens || 0;
                const tokensOut = llmFlowResult.usage?.completion_tokens || 0;
                await this.persistModelReply({
                    sessionId,
                    userLogContent,
                    assistantContent: llmFlowResult.content,
                    model: runtimeModel,
                    tokensIn,
                    tokensOut,
                    costUsd: llmFlowResult.costUsd,
                });

                return {
                    content: llmFlowResult.content,
                    bypass: true,
                    ended: flowResult.ended,
                    ...(llmFlowResult.ragNoEvidence ? { rag_no_evidence: true } : {}),
                };
            }

            // If LLM mode, inject additional context from the step
            if (flowResult.useLLM && flowResult.llmContext) {
                // Append flow context to instructions
                const enhancedParts = [
                    config.instructions_prefix || '',
                    '',
                    '--- CONTEXTO DEL PASO ACTUAL ---',
                    flowResult.llmContext,
                ];
                const stepVars = this.promptSessionVars(flowResult.newState.vars || {});
                if (Object.keys(stepVars).length > 0) {
                    enhancedParts.push(
                        '',
                        '--- VARIABLES DE SESIÓN ---',
                        JSON.stringify(stepVars),
                    );
                }
                const enhancedInstructions = enhancedParts.join('\n');

                // Continue to LLM call with enhanced instructions
                config.instructions_prefix = enhancedInstructions;
            }

            flowRagAction = flowResult.ragAction;
            sessionVars = flowResult.newState.vars || {};
        } else {
            const sessionWithMeta = await readRuntimeSession(sessionId);
            const sessionMeta = (sessionWithMeta?.metadata && typeof sessionWithMeta.metadata === 'object' && !Array.isArray(sessionWithMeta.metadata))
                ? sessionWithMeta.metadata as Record<string, unknown>
                : {};
            const flowState = (sessionMeta.flow_state && typeof sessionMeta.flow_state === 'object')
                ? sessionMeta.flow_state as { vars?: SessionVars }
                : undefined;
            sessionVars = flowState?.vars || (sessionMeta.session_vars as SessionVars | undefined) || {};

            const shouldBootstrapVars = Object.keys(sessionVars).length === 0
                && Boolean(config.session_vars && typeof config.session_vars === 'object' && Object.keys(config.session_vars).length > 0);
            if (shouldBootstrapVars) {
                sessionVars = this.generateSessionVars(config.session_vars || {}, config.variable_rules);
                await this.syncSessionVars(sessionId, sessionVars);
            }
        }
        // =====================================================================
        // END FLOW ENGINE INTEGRATION
        // =====================================================================

        if (strategy === 'GENERIC') {
            const genericIntent = this.detectGenericTerminalIntent(userMessage, config);
            if (genericIntent) {
                const baseMessage = genericIntent === 'GOODBYE'
                    ? this.getGenericGoodbyeMessage(config)
                    : this.getGenericClosingMessage(config);
                if (baseMessage) {
                    const terminalContent = this.formatDeterministicReply(baseMessage, config.image_triggers);

                    await this.updateSessionMetadataPreservingAudit({ sessionId, ended: true, patch: {} });
                    await this.persistDeterministicReply({
                        sessionId,
                        userLogContent,
                        assistantContent: terminalContent,
                    });

                    return {
                        content: terminalContent,
                        bypass: true,
                        ended: true,
                    };
                }
            }
        }

        // 1. Universal Bypass Logic (legacy, still supported)
        const bypassMap = config.bypass_logic || {};
        for (const [pattern, responseText] of Object.entries(bypassMap)) {
            const bypassRegex = safeRegex(pattern);
            if (bypassRegex && bypassRegex.test(userMessage)) {
                const bypassContent = this.formatDeterministicReply(responseText, config.image_triggers);
                await this.persistDeterministicReply({
                    sessionId,
                    userLogContent,
                    assistantContent: bypassContent,
                });
                return { content: bypassContent, bypass: true };
            }
        }

        // 2. Prepare History
        const history = await prisma.message.findMany({
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' },
            take: historyLimit,
        });

        const formattedHistory: HistoryItem[] = history.reverse().map((msg) => ({
            role: msg.role as 'user' | 'assistant' | 'system',
            content: msg.content,
        }));

        // 3. LLM Call Strategy
        let assistantContent = '';
        let usage: UsageSummary = null;
        const modelUsed = runtimeModel;

        // =====================================================================
        // RAG RETRIEVAL (GLOBAL + STEP-LEVEL CONTROL)
        // =====================================================================
        let ragContext = '';
        const hasStepRagAction = Boolean(flowRagAction && flowRagAction.enabled !== false);
        const ragPurpose = flowRagAction?.purpose || 'context';
        const shouldRunForMode = shouldRunRagForChat(rag.mode, hasStepRagAction, ragPurpose === 'evaluate_conversation');
        const strictMode = (flowRagAction?.strict ?? rag.strict_mode) || false;
        const ragStrategy = flowRagAction?.strategy || rag.wrapper.strategy;
        const ragTopK = flowRagAction?.top_k || (rag.owner === 'platform' ? rag.platform.max_num_results : rag.wrapper.top_k) || 4;
        const rawStepQueryTemplate = typeof flowRagAction?.query_template === 'string'
            ? flowRagAction.query_template.trim()
            : '';
        const interpolatedStepQuery = rawStepQueryTemplate
            ? this.interpolateVars(rawStepQueryTemplate, sessionVars).trim()
            : '';
        const ragQuery = interpolatedStepQuery || userMessage;
        const ragMetadataFilters = Object.fromEntries(
            Object.entries({
                ...(rag.wrapper.metadata_filters || {}),
                ...(rag.platform.filters || {}),
                ...(flowRagAction?.metadata_filters || {}),
            }).filter(([, value]) => value !== '' && value !== null && value !== undefined)
        ) as Record<string, string | number | boolean>;
        const ragFiltersOrUndefined = Object.keys(ragMetadataFilters).length > 0 ? ragMetadataFilters : undefined;
        const shouldRunRag = shouldRunForMode && rag.vector_store_ids.length > 0;
        const ragAuditEnabled = Boolean(rag.audit.store_queries || rag.audit.store_results || rag.audit.store_scores);
        const promptSessionVars = this.promptSessionVars(sessionVars);

        let ragTrace: RagTrace | null = null;
        if (shouldRunForMode && rag.vector_store_ids.length === 0 && strictMode) {
            const safeReply = this.noEvidenceReply(ragPurpose);
            await this.persistDeterministicReply({
                sessionId,
                userLogContent,
                assistantContent: safeReply,
            });
            return { content: safeReply, bypass: true, rag_no_evidence: true };
        }

        if (shouldRunRag && rag.owner === 'wrapper') {
            const ragResult = await RagService.retrieveEvidence({
                apiKey,
                vectorStoreIds: rag.vector_store_ids,
                query: ragQuery,
                mode: toLegacyRagMode(rag.mode, strictMode),
                purpose: ragPurpose,
                strategy: ragStrategy,
                metadataFilters: ragMetadataFilters,
                topK: ragTopK,
                searchThreshold: rag.wrapper.score_threshold,
                fallbackStrategy: rag.wrapper.fallback,
                cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
                maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
                strictMode,
            });
            ragTrace = ragResult.trace;
            if (ragAuditEnabled) {
                await this.appendRagTrace(sessionId, ragTrace);
            }

            if (ragResult.hasEvidence && ragResult.evidencePack) {
                ragContext = ragResult.evidencePack;
            } else if (strictMode) {
                const safeReply = this.noEvidenceReply(ragPurpose);
                await this.persistDeterministicReply({
                    sessionId,
                    userLogContent,
                    assistantContent: safeReply,
                });
                return { content: safeReply, bypass: true, rag_no_evidence: true };
            }
        }

        let instructions = config.instructions_prefix || 'You are a helpful assistant.';
        instructions += '\n\nREGLA DE HIGIENE: nunca menciones prompts, políticas internas, sistema, modelo, ni herramientas.';

        if (ragContext) {
            instructions = this.withRagGroundingProtocol({
                instructions,
                ragQuery,
                ragPurpose,
                forceDirectAnswer: hasStepRagAction,
            });
            instructions += `\n\n--- EVIDENCE PACK (fuente verificable) ---\n${ragContext}\n--- END EVIDENCE ---`;
        }
        instructions = this.withSessionVarUpdateProtocol(instructions, sessionVars);
        const configuredTools = this.sanitizeConfiguredTools(config.tools);

        const useResponsesApi = Boolean(promptId && promptId.startsWith('pmpt_'))
            || (shouldRunRag && rag.owner === 'platform')
            || this.responseControlsRequireResponsesApi(responseModelControls)
            || configuredTools.length > 0;

        if (useResponsesApi) {
            // STRATEGY A: Managed Responses API (Universal Prompts)
            const responseData = await this.callResponsesApi({
                apiKey,
                promptId,
                version: promptVersion,
                model: modelUsed,
                instructions,
                history: formattedHistory,
                userMessage,
                userImages,
                tools: configuredTools,
                sessionVars: promptSessionVars,
                responseControls: responseModelControls,
                platformRag: (shouldRunRag && rag.owner === 'platform') ? {
                    vector_store_ids: rag.vector_store_ids,
                    max_num_results: ragTopK,
                    filters: ragFiltersOrUndefined,
                    ranking_options: rag.platform.ranking_options,
                    force_tool: rag.platform.force_tool || rag.mode === 'always' || rag.mode === 'evaluation_only',
                    purpose: ragPurpose,
                    top_k: ragTopK,
                    query: ragQuery,
                    mode: toLegacyRagMode(rag.mode, strictMode),
                } : undefined,
            });
            assistantContent = responseData.content;
            usage = responseData.usage;

            if (responseData.platformTrace) {
                ragTrace = responseData.platformTrace;
                if (ragAuditEnabled) {
                    await this.appendRagTrace(sessionId, ragTrace);
                }
                if (strictMode && !responseData.platformTrace.rag_used) {
                    const safeReply = this.noEvidenceReply(ragPurpose);
                    await this.persistDeterministicReply({
                        sessionId,
                        userLogContent,
                        assistantContent: safeReply,
                    });
                    return { content: safeReply, bypass: true, rag_no_evidence: true };
                }
            }
        } else {
            // STRATEGY B: Standard Chat Completions (Fallback)
            const openai = createOpenAIClient(apiKey);

            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                { role: 'system', content: instructions },
                ...formattedHistory,
                userImages.length > 0
                    ? {
                        role: 'user',
                        content: [
                            { type: 'text', text: userMessage },
                            ...userImages.map((img) => ({
                                type: 'image_url' as const,
                                image_url: { url: img.data_url },
                            })),
                        ],
                    }
                    : { role: 'user', content: userMessage },
            ];

            const response = await openai.chat.completions.create({
                model: modelUsed,
                messages,
                temperature: 0.7,
            });

            assistantContent = response.choices[0].message.content || '';
            usage = {
                prompt_tokens: response.usage?.prompt_tokens,
                completion_tokens: response.usage?.completion_tokens
            };
        }

        const { cleanContent, updates } = this.extractSessionVarUpdates(assistantContent, sessionVars);
        assistantContent = cleanContent;
        if (Object.keys(updates).length > 0) {
            sessionVars = { ...sessionVars, ...updates };
            sessionVarsChangedByAssistant = true;
        }

        // 4. Dynamic Pricing from Database
        const tokensIn = usage?.prompt_tokens || 0;
        const tokensOut = usage?.completion_tokens || 0;
        const costUsd = await PricingService.calculateCost(modelUsed, tokensIn, tokensOut);

        const historyChars = formattedHistory.reduce((sum, item) => sum + (item.content?.length || 0), 0);
        const sessionVarsKeys = Object.keys(promptSessionVars).length;
        const sessionVarsInjected = sessionVarsKeys > 0;
        const sessionVarsChars = sessionVarsInjected ? JSON.stringify(promptSessionVars).length : 0;
        const promptTrace = {
            source: 'main_llm',
            model: modelUsed,
            via: useResponsesApi ? 'responses' : 'chat_completions',
            rag_mode: rag.mode,
            rag_owner: rag.owner,
            rag_used: Boolean(ragContext),
            has_step_rag_action: hasStepRagAction,
            strict_mode: strictMode,
            history_limit: historyLimit,
            history_messages: formattedHistory.length,
            history_chars: historyChars,
            base_instructions_chars: (config.instructions_prefix || '').length,
            llm_context_chars: 0,
            session_vars_keys: sessionVarsKeys,
            session_vars_chars: sessionVarsChars,
            session_vars_injected: sessionVarsInjected,
            response_controls: responseModelControls,
            evidence_chars: ragContext.length,
            prompt_tokens: tokensIn,
            completion_tokens: tokensOut,
        };
        try {
            await this.appendLlmPromptTrace(sessionId, promptTrace);
        } catch {
            // Do not block response path if prompt trace logging fails.
        }

        // 5. Process Image Triggers (universal for all bot types)
        assistantContent = this.processImageTriggers(assistantContent, config.image_triggers);

        // 6. Security Sanitization
        assistantContent = sanitizeResponse(assistantContent);

        await this.persistModelReply({
            sessionId,
            userLogContent,
            assistantContent,
            model: modelUsed,
            tokensIn,
            tokensOut,
            costUsd,
            userImages,
        });
        if (sessionVarsChangedByAssistant) {
            await this.syncSessionVars(sessionId, sessionVars);
        }

        return { content: assistantContent, bypass: false, usage, costUsd };
    }

    /**
     * Process image triggers - appends matching images to the response
     */
    private static processImageTriggers(
        response: string,
        triggers?: Array<{ pattern: string; image_url: string; caption?: string }>
    ): string {
        return processImageTriggers(response, triggers);
    }

    // calculateCost removed (moved to PricingService)

    private static async logMessage(sessionId: string, role: ChatRole, content: string, tin = 0, tout = 0, cost = 0, images: UserImageAttachment[] = []) {
        const storedImages = await this.toStoredImageAttachments(images);
        const operation = currentSessionOperation(sessionId);
        if (!operation || operation.initiallyEnded) throw new SessionOperationError('No se puede escribir fuera de un turno activo.');
        const data = {
            id: randomUUID(), session_id: sessionId, role, content,
            tokens_in: tin, tokens_out: tout, cost_usd: cost,
            images: storedImages as unknown as Prisma.InputJsonValue,
            created_at: new Date(),
        };
        operation.writes.push((tx) => tx.message.create({ data }));
        return data;
    }

    private static async toStoredImageAttachments(images: UserImageAttachment[]) {
        return toStoredImageAttachments(images);
    }

    private static noEvidenceReply(purpose: string): string {
        if (purpose === 'validate_user_response') {
            return 'No tengo evidencia suficiente para validar esa respuesta con precisión. Reintentá con más detalle.';
        }
        if (purpose === 'evaluate_conversation') {
            return 'No hay evidencia suficiente para evaluar la conversación con este criterio.';
        }
        return 'No tengo evidencia suficiente para responder con seguridad en este momento.';
    }

    private static async appendRagTrace(sessionId: string, trace: RagTrace) {
        await appendRagTrace(sessionId, trace);
    }

    private static async appendTriggerTraces(sessionId: string, traces: unknown[]) {
        await appendTriggerTraces(sessionId, traces);
    }

    private static async appendLlmPromptTrace(sessionId: string, trace: Record<string, unknown>) {
        await appendLlmPromptTrace(sessionId, trace);
    }

    private static async runFlowLlmStep(params: {
        sessionId: string;
        apiKey: string;
        config: BotConfig;
        rag: NormalizedRagConfig;
        flowRagAction?: FlowRagAction;
        llmContext: string;
        sessionVars: SessionVars;
        userMessage: string;
        userImages: UserImageAttachment[];
        model: string;
        promptId: string;
        promptVersion: string;
        historyLimit: number;
        responseControls: ResponseModelControls;
    }): Promise<{
        content: string;
        usage: UsageSummary;
        costUsd: number;
        ragNoEvidence: boolean;
        sessionVars: SessionVars;
    }> {
        const {
            sessionId,
            apiKey,
            config,
            rag,
            flowRagAction,
            llmContext,
            sessionVars,
            userMessage,
            userImages,
            model,
            promptId,
            promptVersion,
            historyLimit,
            responseControls,
        } = params;

        const hasStepRagAction = Boolean(flowRagAction && flowRagAction.enabled !== false);
        const ragPurpose = flowRagAction?.purpose || 'context';
        const shouldRunForMode = shouldRunRagForChat(rag.mode, hasStepRagAction, ragPurpose === 'evaluate_conversation');
        const strictMode = (flowRagAction?.strict ?? rag.strict_mode) || false;
        const ragStrategy = flowRagAction?.strategy || rag.wrapper.strategy;
        const ragTopK = flowRagAction?.top_k || (rag.owner === 'platform' ? rag.platform.max_num_results : rag.wrapper.top_k) || 4;
        const rawStepQueryTemplate = typeof flowRagAction?.query_template === 'string'
            ? flowRagAction.query_template.trim()
            : '';
        const interpolatedStepQuery = rawStepQueryTemplate
            ? this.interpolateVars(rawStepQueryTemplate, sessionVars).trim()
            : '';
        const ragQuery = interpolatedStepQuery || userMessage;
        const ragMetadataFilters = Object.fromEntries(
            Object.entries({
                ...(rag.wrapper.metadata_filters || {}),
                ...(rag.platform.filters || {}),
                ...(flowRagAction?.metadata_filters || {}),
            }).filter(([, value]) => value !== '' && value !== null && value !== undefined)
        ) as Record<string, string | number | boolean>;
        const shouldRunRag = shouldRunForMode && rag.vector_store_ids.length > 0;
        const ragAuditEnabled = Boolean(rag.audit.store_queries || rag.audit.store_results || rag.audit.store_scores);
        const promptSessionVars = this.promptSessionVars(sessionVars);

        if (shouldRunForMode && rag.vector_store_ids.length === 0 && strictMode) {
            return {
                content: this.noEvidenceReply(ragPurpose),
                usage: null,
                costUsd: 0,
                ragNoEvidence: true,
                sessionVars,
            };
        }

        let ragContext = '';
        if (shouldRunRag) {
            const retrieval = rag.owner === 'platform'
                ? await RagService.retrieveEvidencePlatform({
                    apiKey,
                    model,
                    vectorStoreIds: rag.vector_store_ids,
                    query: ragQuery,
                    mode: toLegacyRagMode(rag.mode, strictMode),
                    purpose: ragPurpose,
                    topK: ragTopK,
                    metadataFilters: ragMetadataFilters,
                    rankingOptions: rag.platform.ranking_options,
                    forceTool: rag.platform.force_tool || rag.mode === 'always' || rag.mode === 'evaluation_only',
                    cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
                    maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
                })
                : await RagService.retrieveEvidence({
                    apiKey,
                    vectorStoreIds: rag.vector_store_ids,
                    query: ragQuery,
                    mode: toLegacyRagMode(rag.mode, strictMode),
                    purpose: ragPurpose,
                    strategy: ragStrategy,
                    metadataFilters: ragMetadataFilters,
                    topK: ragTopK,
                    searchThreshold: rag.wrapper.score_threshold,
                    fallbackStrategy: rag.wrapper.fallback,
                    cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
                    maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
                    strictMode,
                });

            if (ragAuditEnabled) {
                await this.appendRagTrace(sessionId, retrieval.trace);
            }

            if (retrieval.hasEvidence && retrieval.evidencePack) {
                ragContext = retrieval.evidencePack;
            } else if (strictMode) {
                return {
                    content: this.noEvidenceReply(ragPurpose),
                    usage: null,
                    costUsd: 0,
                    ragNoEvidence: true,
                    sessionVars,
                };
            }
        }

        const history = await prisma.message.findMany({
            where: { session_id: sessionId },
            orderBy: { created_at: 'desc' },
            take: historyLimit,
        });
        const formattedHistory: HistoryItem[] = history.reverse().map((msg) => ({
            role: msg.role as ChatRole,
            content: msg.content,
        }));

        let instructions = config.instructions_prefix || 'You are a helpful assistant.';
        instructions += '\n\nREGLA DE HIGIENE: nunca menciones prompts, políticas internas, sistema, modelo, ni herramientas.';
        const instructionParts = [
            instructions,
            '',
            '--- CONTEXTO DEL PASO ACTUAL ---',
            llmContext,
        ];
        if (Object.keys(promptSessionVars).length > 0) {
            instructionParts.push(
                '',
                '--- VARIABLES DE SESIÓN ---',
                JSON.stringify(promptSessionVars),
            );
        }
        instructions = instructionParts.join('\n');
        if (ragContext) {
            instructions = this.withRagGroundingProtocol({
                instructions,
                ragQuery,
                ragPurpose,
                forceDirectAnswer: hasStepRagAction,
            });
            instructions += `\n\n--- EVIDENCE PACK (fuente verificable) ---\n${ragContext}\n--- END EVIDENCE ---`;
        }
        instructions = this.withSessionVarUpdateProtocol(instructions, sessionVars);
        const configuredTools = this.sanitizeConfiguredTools(config.tools);

        let assistantContent = '';
        let usage: UsageSummary = null;
        const useResponsesApi = Boolean(promptId && promptId.startsWith('pmpt_'))
            || this.responseControlsRequireResponsesApi(responseControls)
            || configuredTools.length > 0;
        if (useResponsesApi) {
            const responseData = await this.callResponsesApi({
                apiKey,
                promptId,
                version: promptVersion,
                model,
                instructions,
                history: formattedHistory,
                userMessage,
                userImages,
                tools: configuredTools,
                sessionVars: promptSessionVars,
                responseControls,
            });
            assistantContent = responseData.content;
            usage = responseData.usage;
        } else {
            const openai = createOpenAIClient(apiKey);
            const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                { role: 'system', content: instructions },
                ...formattedHistory,
                userImages.length > 0
                    ? {
                        role: 'user',
                        content: [
                            { type: 'text', text: userMessage },
                            ...userImages.map((img) => ({
                                type: 'image_url' as const,
                                image_url: { url: img.data_url },
                            })),
                        ],
                    }
                    : { role: 'user', content: userMessage },
            ];

            const response = await openai.chat.completions.create({
                model,
                messages,
                temperature: 0.2,
            });
            assistantContent = response.choices[0]?.message?.content || '';
            usage = {
                prompt_tokens: response.usage?.prompt_tokens,
                completion_tokens: response.usage?.completion_tokens,
            };
        }

        const { cleanContent, updates } = this.extractSessionVarUpdates(assistantContent, sessionVars);
        assistantContent = this.processImageTriggers(cleanContent, config.image_triggers);
        assistantContent = sanitizeResponse(assistantContent);
        const nextSessionVars = Object.keys(updates).length > 0
            ? { ...sessionVars, ...updates }
            : sessionVars;

        const tokensIn = usage?.prompt_tokens || 0;
        const tokensOut = usage?.completion_tokens || 0;
        const costUsd = await PricingService.calculateCost(model, tokensIn, tokensOut);

        const historyChars = formattedHistory.reduce((sum, item) => sum + (item.content?.length || 0), 0);
        const sessionVarsKeys = Object.keys(promptSessionVars).length;
        const sessionVarsInjected = sessionVarsKeys > 0;
        const sessionVarsChars = sessionVarsInjected ? JSON.stringify(promptSessionVars).length : 0;
        const promptTrace = {
            source: 'flow_llm_step',
            model,
            via: useResponsesApi ? 'responses' : 'chat_completions',
            rag_mode: rag.mode,
            rag_owner: rag.owner,
            rag_used: Boolean(ragContext),
            has_step_rag_action: hasStepRagAction,
            strict_mode: strictMode,
            history_limit: historyLimit,
            history_messages: formattedHistory.length,
            history_chars: historyChars,
            base_instructions_chars: (config.instructions_prefix || '').length,
            llm_context_chars: llmContext.length,
            session_vars_keys: sessionVarsKeys,
            session_vars_chars: sessionVarsChars,
            session_vars_injected: sessionVarsInjected,
            response_controls: responseControls,
            evidence_chars: ragContext.length,
            prompt_tokens: tokensIn,
            completion_tokens: tokensOut,
        };
        try {
            await this.appendLlmPromptTrace(sessionId, promptTrace);
        } catch {
            // Do not block response path if prompt trace logging fails.
        }

        return {
            content: assistantContent,
            usage,
            costUsd,
            ragNoEvidence: false,
            sessionVars: nextSessionVars,
        };
    }

    private static shouldRunRagForExaminer(rag: NormalizedRagConfig): boolean {
        if (rag.mode === 'never') return false;
        if (rag.mode === 'always') return true;
        if (rag.mode === 'evaluation_only') return true;
        return false;
    }

    private static async retrieveExaminerRagEvidence(params: {
        apiKey: string;
        rag: NormalizedRagConfig;
        query: string;
        purpose: 'context' | 'validate_user_response' | 'evaluate_conversation';
        model: string;
    }): Promise<RagRetrievalResult | null> {
        const { apiKey, rag, query, purpose, model } = params;
        if (!this.shouldRunRagForExaminer(rag)) return null;
        if (!rag.vector_store_ids.length) return null;

        const metadataFilters = {
            ...(rag.wrapper.metadata_filters || {}),
            ...(rag.platform.filters || {}),
        };
        const mode = toLegacyRagMode(rag.mode, rag.strict_mode);
        const topK = rag.owner === 'platform'
            ? (rag.platform.max_num_results || rag.wrapper.top_k || 4)
            : (rag.wrapper.top_k || 4);

        if (rag.owner === 'platform') {
            return RagService.retrieveEvidencePlatform({
                apiKey,
                model,
                vectorStoreIds: rag.vector_store_ids,
                query,
                mode,
                purpose,
                topK,
                metadataFilters,
                rankingOptions: rag.platform.ranking_options,
                forceTool: rag.platform.force_tool || rag.mode === 'always' || rag.mode === 'evaluation_only',
                cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
                maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
            });
        }

        return RagService.retrieveEvidence({
            apiKey,
            vectorStoreIds: rag.vector_store_ids,
            query,
            mode,
            purpose,
            strategy: rag.wrapper.strategy,
            metadataFilters,
            topK,
            searchThreshold: rag.wrapper.score_threshold,
            fallbackStrategy: rag.wrapper.fallback,
            cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
            maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
            strictMode: false,
        });
    }

    private static async evaluateExaminerAnswerWithModel(params: {
        apiKey: string;
        question: Question;
        userAnswer: string;
        deterministic: DeterministicExamEvaluation;
        expectedKeys: string[];
        rag: NormalizedRagConfig;
        model: string;
        sessionId: string;
    }): Promise<ExaminerSemanticEvaluation | null> {
        const { apiKey, question, userAnswer, deterministic, expectedKeys, rag, model, sessionId } = params;
        let ragEvidence = '';

        try {
            const retrieval = await this.retrieveExaminerRagEvidence({
                apiKey,
                rag,
                query: [
                    `Pregunta: ${question.question}`,
                    `Respuesta del usuario: ${userAnswer}`,
                    expectedKeys.length > 0 ? `Puntos esperados: ${expectedKeys.join(', ')}` : '',
                ].filter(Boolean).join('\n'),
                purpose: 'validate_user_response',
                model,
            });

            if (retrieval) {
                ragEvidence = retrieval.evidencePack || '';
                if (rag.audit.store_queries || rag.audit.store_results || rag.audit.store_scores) {
                    await this.appendRagTrace(sessionId, retrieval.trace);
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'RAG retrieval error';
            throw new Error(`No se pudo obtener evidencia RAG para evaluación semántica: ${message}`);
        }

        try {
            const openai = createOpenAIClient(apiKey);
            const completion = await openai.chat.completions.create({
                model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Sos un corrector estricto de respuestas de examen.',
                            'Clasificá SOLO en una de estas etiquetas: correct, incomplete, incorrect.',
                            'Respondé SOLO JSON válido con este formato exacto:',
                            '{"status":"correct|incomplete|incorrect","feedback":"texto corto","missing_keys":["..."],"confidence":0..1}',
                            'feedback debe ser breve y accionable.',
                            'No inventes criterios fuera de la pregunta, claves esperadas y evidencia.',
                        ].join(' '),
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            question: question.question,
                            expected_keys: expectedKeys,
                            deterministic,
                            user_answer: userAnswer,
                            rag_evidence: ragEvidence || undefined,
                        }),
                    },
                ],
            });

            const raw = completion.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(raw) as {
                status?: unknown;
                feedback?: unknown;
                missing_keys?: unknown;
                confidence?: unknown;
            };

            const status = parsed.status === 'correct' || parsed.status === 'incomplete' || parsed.status === 'incorrect'
                ? parsed.status
                : null;
            if (!status) {
                throw new Error('Respuesta semántica inválida: status ausente o no permitido.');
            }

            const tokensIn = completion.usage?.prompt_tokens || 0;
            const tokensOut = completion.usage?.completion_tokens || 0;
            const costUsd = await PricingService.calculateCost(model, tokensIn, tokensOut);

            return {
                status,
                feedback: typeof parsed.feedback === 'string' ? parsed.feedback.trim() : '',
                missing_keys: Array.isArray(parsed.missing_keys)
                    ? parsed.missing_keys.filter((item): item is string => typeof item === 'string')
                    : [],
                confidence: typeof parsed.confidence === 'number'
                    ? Math.max(0, Math.min(1, parsed.confidence))
                    : 0,
                model,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                cost_usd: costUsd,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'semantic evaluator error';
            throw new Error(`Falló la evaluación semántica auxiliar: ${message}`);
        }
    }

    private static async answerExaminerPostCloseWithModel(params: {
        apiKey: string;
        userQuestion: string;
        topic: string | null;
        rag: NormalizedRagConfig;
        model: string;
        sessionId: string;
    }): Promise<{
        text: string;
        model?: string;
        tokens_in?: number;
        tokens_out?: number;
        cost_usd?: number;
    } | null> {
        const { apiKey, userQuestion, topic, rag, model, sessionId } = params;
        let ragEvidence = '';

        try {
            const retrieval = await this.retrieveExaminerRagEvidence({
                apiKey,
                rag,
                query: [
                    topic ? `Tema detectado: ${topic}` : '',
                    `Duda del usuario: ${userQuestion}`,
                ].filter(Boolean).join('\n'),
                purpose: 'context',
                model,
            });

            if (retrieval) {
                ragEvidence = retrieval.evidencePack || '';
                if (rag.audit.store_queries || rag.audit.store_results || rag.audit.store_scores) {
                    await this.appendRagTrace(sessionId, retrieval.trace);
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'RAG retrieval error';
            throw new Error(`No se pudo obtener evidencia RAG para respuesta post-cierre: ${message}`);
        }

        try {
            const openai = createOpenAIClient(apiKey);
            const completion = await openai.chat.completions.create({
                model,
                temperature: 0.2,
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Sos un asistente de seguridad y capacitación.',
                            'Respondé en español rioplatense, breve y claro.',
                            'Usá solo la evidencia disponible; si no alcanza, decilo sin inventar.',
                            'No muestres metadatos, citas internas ni IDs de archivos.',
                        ].join(' '),
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            topic: topic || undefined,
                            user_question: userQuestion,
                            rag_evidence: ragEvidence || undefined,
                        }),
                    },
                ],
            });

            const text = completion.choices[0]?.message?.content?.trim();
            if (!text) {
                throw new Error('Respuesta post-cierre vacía.');
            }
            const tokensIn = completion.usage?.prompt_tokens || 0;
            const tokensOut = completion.usage?.completion_tokens || 0;
            const costUsd = await PricingService.calculateCost(model, tokensIn, tokensOut);
            return {
                text,
                model,
                tokens_in: tokensIn,
                tokens_out: tokensOut,
                cost_usd: costUsd,
            };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'post-close responder error';
            throw new Error(`Falló la respuesta post-cierre del examinador: ${message}`);
        }
    }

    private static async processExaminerMessage(params: {
        sessionId: string;
        userLogContent: string;
        userMessage: string;
        config: BotConfig;
        apiKey: string;
        rag: NormalizedRagConfig;
        llmModel: string;
        promptId: string;
        promptVersion: string;
        historyLimit: number;
        responseControls: ResponseModelControls;
        phraseModelFallback?: (input: PhraseModelFallbackInput) => Promise<PhraseModelFallbackResult>;
    }) {
        const {
            sessionId,
            userLogContent,
            userMessage,
            config,
            apiKey,
            rag,
            llmModel,
            promptId,
            promptVersion,
            historyLimit,
            responseControls,
            phraseModelFallback
        } = params;

        const session = await readRuntimeSession(sessionId);

        if (session?.ended) {
            return {
                content: this.SESSION_ALREADY_ENDED_REPLY,
                bypass: true,
                ended: true,
                end_reason: this.SESSION_ALREADY_ENDED_REASON,
            };
        }

        const metadata = (session?.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata))
            ? { ...(session.metadata as Record<string, unknown>) }
            : {};

        const hasFlowEngine = this.hasFlowEngineConfig(config);

        if (hasFlowEngine) {
            const flowConfig = this.toFlowConfig(config);

            const currentFlowState = (metadata.flow_state && typeof metadata.flow_state === 'object')
                ? metadata.flow_state as FlowState
                : (() => {
                    const initial = FlowEngine.createInitialState(flowConfig);
                    initial.vars = this.generateSessionVars(config.session_vars || {}, config.variable_rules);
                    return initial;
                })();

            const flowResult = await FlowEngine.processMessage(flowConfig, userMessage, currentFlowState, false, {
                phrase_model_fallback: phraseModelFallback,
                collect_trigger_audit: true,
            });

            if (flowResult.triggerAudit?.length) {
                await this.appendTriggerTraces(sessionId, flowResult.triggerAudit);
            }

            if (!flowResult.useLLM && flowResult.response) {
                await this.updateSessionMetadataPreservingAudit({
                    sessionId,
                    ended: flowResult.ended,
                    patch: {
                        flow_state: flowResult.newState as unknown as Record<string, unknown>,
                        session_vars: (flowResult.newState?.vars || {}) as unknown as Record<string, unknown>,
                    },
                });

                let assistantContent = this.processImageTriggers(flowResult.response, config.image_triggers);
                assistantContent = sanitizeResponse(assistantContent);

                await this.persistDeterministicReply({
                    sessionId,
                    userLogContent,
                    assistantContent,
                });

                return {
                    content: assistantContent,
                    bypass: true,
                    ended: flowResult.ended,
                };
            }

            if (flowResult.useLLM && flowResult.llmContext) {
                const blockerResult = await this.runFlowLlmStep({
                    sessionId,
                    apiKey,
                    config,
                    rag,
                    flowRagAction: flowResult.ragAction,
                    llmContext: flowResult.llmContext,
                    sessionVars: flowResult.newState?.vars || {},
                    userMessage,
                    userImages: [],
                    model: llmModel,
                    promptId,
                    promptVersion,
                    historyLimit,
                    responseControls,
                });

                await this.updateSessionMetadataPreservingAudit({
                    sessionId,
                    ended: flowResult.ended,
                    patch: {
                        flow_state: {
                            ...flowResult.newState,
                            vars: blockerResult.sessionVars,
                        } as unknown as Record<string, unknown>,
                        session_vars: blockerResult.sessionVars as unknown as Record<string, unknown>,
                    },
                });

                const tokensIn = blockerResult.usage?.prompt_tokens || 0;
                const tokensOut = blockerResult.usage?.completion_tokens || 0;
                await this.persistModelReply({
                    sessionId,
                    userLogContent,
                    assistantContent: blockerResult.content,
                    model: llmModel,
                    tokensIn,
                    tokensOut,
                    costUsd: blockerResult.costUsd,
                });

                return {
                    content: blockerResult.content,
                    bypass: true,
                    ended: flowResult.ended,
                    usage: blockerResult.usage,
                    costUsd: blockerResult.costUsd,
                    ...(blockerResult.ragNoEvidence ? { rag_no_evidence: true } : {}),
                };
            }

            if (flowResult.ended) {
                await this.updateSessionMetadataPreservingAudit({
                    sessionId,
                    ended: true,
                    patch: metadata,
                });
                return {
                    content: this.SESSION_ALREADY_ENDED_REPLY,
                    bypass: true,
                    ended: true,
                    end_reason: this.SESSION_ALREADY_ENDED_REASON,
                };
            }
        }

        const currentState = ensureExaminerState(metadata.examiner_state);
        let turn: Awaited<ReturnType<typeof processExaminerTurn>>;
        try {
            turn = await processExaminerTurn(config, currentState, userMessage, {
                semanticEvaluator: async ({ question, user_answer, deterministic, expected_keys }) => {
                    return this.evaluateExaminerAnswerWithModel({
                        apiKey,
                        question,
                        userAnswer: user_answer,
                        deterministic,
                        expectedKeys: expected_keys.length > 0 ? expected_keys : parseExpectedKeys(question),
                        rag,
                        model: llmModel,
                        sessionId,
                    });
                },
                semanticMode: config.evaluation_config?.selection?.semantic_mode === 'always'
                    ? 'always'
                    : 'ambiguous_only',
                topicClassifier: async (text) => {
                    return Director.classifyExaminerTopicWithModel({
                        apiKey,
                        model: llmModel,
                        sessionId,
                        text,
                        topics: config.question_bank?.topics || [],
                        config,
                    });
                },
                intentChecker: async (text) => {
                    return Director.checkIntentWithModel({ apiKey, text, model: llmModel, sessionId });
                },
                postCloseResponder: async ({ user_question, topic }) => {
                    return this.answerExaminerPostCloseWithModel({
                        apiKey,
                        userQuestion: user_question,
                        topic,
                        rag,
                        model: llmModel,
                        sessionId,
                    });
                },
            });
        } catch (error: unknown) {
            const safeMessage = (error instanceof Error ? error.message : 'examiner runtime error').slice(0, 500);
            await this.updateSessionMetadataPreservingAudit({
                sessionId,
                ended: true,
                patch: {
                    examiner_state: currentState as unknown as Record<string, unknown>,
                    examiner_error: {
                        timestamp: new Date().toISOString(),
                        message: safeMessage,
                    } as unknown as Record<string, unknown>,
                },
            });
            await this.persistDeterministicReply({
                sessionId,
                userLogContent,
                assistantContent: this.EXAMINER_RUNTIME_FAILURE_REPLY,
            });
            return {
                content: this.EXAMINER_RUNTIME_FAILURE_REPLY,
                bypass: true,
                ended: true,
            };
        }

        await this.updateSessionMetadataPreservingAudit({
            sessionId,
            ended: turn.ended,
            patch: {
                examiner_state: turn.newState as unknown as Record<string, unknown>,
            },
        });

        let assistantContent = this.processImageTriggers(turn.response, config.image_triggers);
        assistantContent = sanitizeResponse(assistantContent);

        const semanticTokensIn = turn.semantic?.tokens_in || 0;
        const semanticTokensOut = turn.semantic?.tokens_out || 0;
        const semanticCost = turn.semantic?.cost_usd || 0;
        const postCloseTokensIn = turn.postCloseUsage?.tokens_in || 0;
        const postCloseTokensOut = turn.postCloseUsage?.tokens_out || 0;
        const postCloseCost = turn.postCloseUsage?.cost_usd || 0;

        await this.persistModelReply({
            sessionId,
            userLogContent,
            assistantContent,
            model: llmModel,
            tokensIn: semanticTokensIn + postCloseTokensIn,
            tokensOut: semanticTokensOut + postCloseTokensOut,
            costUsd: semanticCost + postCloseCost,
            skipCostAudit: true,
        });

        if (turn.semantic?.model && (semanticTokensIn > 0 || semanticTokensOut > 0)) {
            await incrementSessionCostAudit({
                sessionId,
                scope: SessionCostScope.CHAT,
                model: turn.semantic.model,
                tokensIn: semanticTokensIn,
                tokensOut: semanticTokensOut,
                messages: 1,
                costUsd: semanticCost,
            });
        }
        if (turn.postCloseUsage?.model && (postCloseTokensIn > 0 || postCloseTokensOut > 0)) {
            await incrementSessionCostAudit({
                sessionId,
                scope: SessionCostScope.CHAT,
                model: turn.postCloseUsage.model,
                tokensIn: postCloseTokensIn,
                tokensOut: postCloseTokensOut,
                messages: 1,
                costUsd: postCloseCost,
            });
        }

        return {
            content: assistantContent,
            bypass: true,
            ended: turn.ended,
            usage: turn.semantic || turn.postCloseUsage
                ? {
                    prompt_tokens: semanticTokensIn + postCloseTokensIn,
                    completion_tokens: semanticTokensOut + postCloseTokensOut,
                }
                : null,
            costUsd: semanticCost + postCloseCost,
        };
    }

    private static async classifyPhraseFallback(
        apiKey: string,
        input: PhraseModelFallbackInput,
        model: string,
        sessionId?: string
    ): Promise<PhraseModelFallbackResult> {
        const cacheKey = JSON.stringify({
            trigger: input.trigger_id,
            scope_mode: input.scope_mode,
            scoped_text: input.scoped_text,
            phrases: input.phrases,
            flags: input.guardrail_flags,
        });
        const cached = this.getPhraseFallbackCache(cacheKey);
        if (cached) return cached;

        try {
            const openai = createOpenAIClient(apiKey);
            const completion = await openai.chat.completions.create({
                model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role: 'system',
                        content: [
                            'Clasificá si el texto activa el intent dado.',
                            'Respondé SOLO JSON: {"match": boolean, "confidence": number}.',
                            'No agregues explicaciones.',
                        ].join(' '),
                    },
                    {
                        role: 'user',
                        content: JSON.stringify({
                            intent_name: input.intent_name,
                            trigger_id: input.trigger_id,
                            scope_mode: input.scope_mode,
                            scoped_text: input.scoped_text,
                            phrases: input.phrases,
                            guardrail_flags: input.guardrail_flags,
                        }),
                    },
                ],
            });
            await this.auditAuxModelCall({
                sessionId,
                model,
                tokensIn: completion.usage?.prompt_tokens || 0,
                tokensOut: completion.usage?.completion_tokens || 0,
            });

            const raw = completion.choices[0]?.message?.content || '{}';
            const parsed = JSON.parse(raw) as { match?: unknown; confidence?: unknown };
            const result: PhraseModelFallbackResult = {
                match: Boolean(parsed.match),
                confidence: typeof parsed.confidence === 'number'
                    ? Math.max(0, Math.min(1, parsed.confidence))
                    : 0,
            };
            this.setPhraseFallbackCache(cacheKey, result);
            return result;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'phrase fallback error';
            throw new Error(`Falló el clasificador semántico de trigger: ${message}`);
        }
    }

    private static async callResponsesApi(params: {
        apiKey: string;
        promptId?: string;
        version?: string;
        model?: string;
        instructions: string;
        history: HistoryItem[];
        userMessage: string;
        userImages?: UserImageAttachment[];
        tools?: Array<Record<string, unknown>>;
        sessionVars?: SessionVars;
        responseControls?: ResponseModelControls;
        platformRag?: {
            vector_store_ids: string[];
            max_num_results: number;
            filters?: Record<string, string | number | boolean>;
            ranking_options?: { score_threshold?: number };
            force_tool: boolean;
            purpose: 'context' | 'validate_user_response' | 'evaluate_conversation';
            top_k: number;
            query: string;
            mode: 'OFF' | 'AUTO' | 'FORCED';
        };
    }) {
        const openai = createOpenAIClient(params.apiKey);

        // Build the input array with history and user message
        const input: Array<{ role: string; content: string | Array<Record<string, unknown>> }> = [];

        // 1. Inject high-level instructions first.
        if (params.instructions && params.instructions.trim()) {
            input.push({
                role: 'system',
                content: params.instructions,
            });
        }

        // 2. Inject Session Context (System Message)
        const promptSessionVars = this.promptSessionVars(params.sessionVars || {});
        if (Object.keys(promptSessionVars).length > 0) {
            const contextLines = ['[CONTEXTO DE LA SESIÓN ACTUAL]'];
            contextLines.push('Por favor, mantén la consistencia con los siguientes datos del usuario/rol:');

            for (const [key, value] of Object.entries(promptSessionVars)) {
                // Format key slightly for readability (e.g. medio_pago -> medio pago)
                const readableKey = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                contextLines.push(`- ${readableKey}: ${value}`);
            }

            input.push({
                role: 'system', // or 'developer' for newer models if needed
                content: contextLines.join('\n')
            });
        }

        // 2.b. Hint retrieval query so per-step overrides affect platform file_search behavior.
        if (params.platformRag?.query?.trim()) {
            input.push({
                role: 'system',
                content: [
                    '[RAG RETRIEVAL HINT]',
                    `Purpose: ${params.platformRag.purpose}`,
                    `If file_search is needed, prioritize this exact search intent: ${params.platformRag.query}`,
                ].join('\n'),
            });
        }

        // 3. Add History
        input.push(...params.history.map(msg => ({
            role: msg.role,
            content: msg.content
        })));

        // 4. Add User Message
        if (params.userImages && params.userImages.length > 0) {
            input.push({
                role: 'user',
                content: [
                    { type: 'input_text', text: params.userMessage },
                    ...params.userImages.map((img) => ({
                        type: 'input_image',
                        image_url: img.data_url,
                    })),
                ],
            });
        } else {
            input.push({ role: 'user', content: params.userMessage });
        }

        const responseControls = this.normalizeResponseModelControls(params.responseControls);
        const responsePayload: Record<string, unknown> = {
            input,
            store: responseControls.store_logs,
            text: {
                format: { type: responseControls.text_format },
                verbosity: responseControls.verbosity,
            },
        };
        if (params.model && params.model.trim()) {
            responsePayload.model = params.model.trim();
        }
        if (!responsePayload.model && !(params.promptId && params.promptId.startsWith('pmpt_'))) {
            throw new Error('Modelo no configurado para Responses API.');
        }

        if (this.isLikelyReasoningModel(params.model || '')) {
            responsePayload.reasoning = {
                effort: responseControls.reasoning_effort,
                summary: responseControls.summary,
            };
        }

        if (params.promptId && params.promptId.startsWith('pmpt_')) {
            const promptPayload: { id: string; version?: string } = { id: params.promptId };
            if (params.version && params.version.trim() !== '') {
                promptPayload.version = params.version;
            }
            responsePayload.prompt = promptPayload;
        }

        const tools: Array<Record<string, unknown>> = this.sanitizeConfiguredTools(params.tools);
        if (params.platformRag) {
            tools.push({
                type: 'file_search',
                vector_store_ids: params.platformRag.vector_store_ids,
                max_num_results: params.platformRag.max_num_results,
                ...(params.platformRag.filters ? { filters: params.platformRag.filters } : {}),
                ...(params.platformRag.ranking_options ? { ranking_options: params.platformRag.ranking_options } : {}),
            });
            responsePayload.include = ['file_search_call.results'];
            if (params.platformRag.force_tool) {
                responsePayload.tool_choice = 'required';
            }
        }
        if (tools.length > 0) {
            responsePayload.tools = tools;
        }

        const readUsage = (raw: RawResponsesCreateResult): { input: number; output: number } => {
            const usage = raw?.usage;
            if (!usage) return { input: 0, output: 0 };
            const input = typeof usage.input_tokens === 'number'
                ? usage.input_tokens
                : (typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0);
            const output = typeof usage.output_tokens === 'number'
                ? usage.output_tokens
                : (typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0);
            return {
                input: Number.isFinite(input) ? Math.max(0, input) : 0,
                output: Number.isFinite(output) ? Math.max(0, output) : 0,
            };
        };

        const startedAt = Date.now();
        let response = await openai.responses.create(
            responsePayload as Parameters<typeof openai.responses.create>[0]
        ) as unknown as RawResponsesCreateResult;
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        {
            const usage = readUsage(response);
            totalInputTokens += usage.input;
            totalOutputTokens += usage.output;
        }

        let toolRound = 0;
        while (toolRound < this.TOOL_CALL_MAX_ROUNDS) {
            const toolCalls = this.extractRuntimeToolCalls(response);
            if (toolCalls.length === 0) break;
            if (!response.id) break;

            const toolOutputs = toolCalls.map((call) => ({
                type: 'function_call_output',
                call_id: call.call_id,
                output: this.executeRuntimeToolCall(call, params.sessionVars || {}),
            }));

            response = await openai.responses.create({
                previous_response_id: response.id,
                input: toolOutputs,
            } as Parameters<typeof openai.responses.create>[0]) as unknown as RawResponsesCreateResult;
            const usage = readUsage(response);
            totalInputTokens += usage.input;
            totalOutputTokens += usage.output;
            toolRound += 1;
        }
        const latency = Date.now() - startedAt;

        // Extract content from response
        let content = response?.output_text || '';
        if (!content && response?.output && Array.isArray(response.output)) {
            const output = response.output as PlatformTraceOutputEntry[];
            content = output
                .filter((o) => o.type === 'message' && o.role === 'assistant')
                .map((o) => o.content?.map((c) => c.text || '').join('') || '')
                .join('');
        }

        const platformTrace = params.platformRag
            ? this.extractPlatformTrace(response, {
                query: params.platformRag.query,
                purpose: params.platformRag.purpose,
                vector_store_ids: params.platformRag.vector_store_ids,
                top_k: params.platformRag.top_k,
                filters: params.platformRag.filters || {},
                mode: params.platformRag.mode,
                latency_ms: latency,
            })
            : undefined;

        return {
            content: content || 'Lo siento, no pude conectar con el asistente. (Error de Contexto/API)',
            usage: response.usage
                ? {
                    // Aggregate all rounds (initial + tool outputs) to avoid hidden under-counting.
                    prompt_tokens: totalInputTokens,
                    completion_tokens: totalOutputTokens,
                    // Preserve original fields while exposing aggregated token totals.
                    ...response.usage,
                    input_tokens: totalInputTokens,
                    output_tokens: totalOutputTokens,
                    total_tokens: totalInputTokens + totalOutputTokens,
                }
                : null,
            platformTrace,
        };
    }

    private static extractPlatformTrace(
        response: unknown,
        params: {
            query: string;
            purpose: 'context' | 'validate_user_response' | 'evaluate_conversation';
            vector_store_ids: string[];
            top_k: number;
            filters: Record<string, string | number | boolean>;
            mode: 'OFF' | 'AUTO' | 'FORCED';
            latency_ms: number;
        }
    ): RagTrace {
        const results: Array<{ file_id: string; filename: string; score: number; excerpt: string }> = [];
        const responseValue = response as { output?: unknown };
        const output = Array.isArray(responseValue.output) ? responseValue.output as PlatformTraceOutputEntry[] : [];
        for (const item of output) {
            if (item?.type !== 'file_search_call') continue;
            const entries = Array.isArray(item?.results) ? item.results : [];
            for (const entry of entries) {
                const excerpt = (entry?.content || [])
                    .filter((c) => c?.type === 'text')
                    .map((c) => c?.text || '')
                    .join('\n')
                    .trim();
                results.push({
                    file_id: entry?.file_id || '',
                    filename: entry?.filename || 'unknown',
                    score: typeof entry?.score === 'number' ? entry.score : 0,
                    excerpt: excerpt.slice(0, 300),
                });
            }
        }

        return {
            rag_used: results.length > 0,
            rag_owner: 'platform',
            rag_mode: params.mode,
            purpose: params.purpose,
            strategy: 'similarity',
            query: params.query,
            vector_store_ids: params.vector_store_ids,
            filters_applied: params.filters,
            top_k: params.top_k,
            evidence_count: results.length,
            latency_ms: params.latency_ms,
            top_results: results.slice(0, 5),
        };
    }



    // ========================================================================
    // EXAMINER HELPERS (SEMANTIC ROUTER)
    // ========================================================================

    private static async classifyExaminerTopicWithModel(params: {
        apiKey: string;
        text: string;
        topics: string[];
        config: BotConfig;
        model: string;
        sessionId?: string;
    }): Promise<string | null> {
        const { apiKey, text, topics, config, model, sessionId } = params;

        if (!topics || topics.length === 0) return null;

        const openai = createOpenAIClient(apiKey);

        const customPrompt = config.evaluation_config?.topic_config?.router_prompt;
        const systemPrompt = customPrompt || `Sos un clasificador de temas para un examen.
Tu tarea es identificar a cuál de los siguientes temas corresponde el input del usuario:
${topics.map(t => `- ${t}`).join('\n')}

Si el input no parece corresponder claramente a ninguno, respondé null.
Si el input es ambiguo, elegí el más probable.

Responde SOLO un JSON con este formato:
{"topic": "nombre_del_tema_exacto" | null}`;

        try {
            const completion = await openai.chat.completions.create({
                model,
                temperature: 0,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: text }
                ],
                response_format: { type: 'json_object' }
            });
            await this.auditAuxModelCall({
                sessionId,
                model,
                tokensIn: completion.usage?.prompt_tokens || 0,
                tokensOut: completion.usage?.completion_tokens || 0,
            });

            const content = completion.choices[0].message.content;
            if (!content) {
                throw new Error('Respuesta vacía del clasificador de temas.');
            }

            const parsed = JSON.parse(content);
            const topic = parsed.topic;

            if (typeof topic === 'string' && topic.trim()) {
                const normalize = (value: string) => value
                    .toLocaleLowerCase('es')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .trim();

                const exactMatch = topics.find((candidate) => normalize(candidate) === normalize(topic));
                if (exactMatch) return exactMatch;
            }
            return null;

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'topic classification error';
            throw new Error(`Falló el clasificador semántico de tema: ${message}`);
        }
    }

    private static async checkIntentWithModel(params: {
        apiKey: string;
        text: string;
        model: string;
        sessionId?: string;
    }): Promise<'CONTINUE' | 'STOP' | 'UNKNOWN'> {
        const { apiKey, text, model, sessionId } = params;
        const openai = createOpenAIClient(apiKey);

        try {
            const completion = await openai.chat.completions.create({
                model,
                temperature: 0,
                messages: [
                    {
                        role: 'system',
                        content: `Analiza si el usuario quiere CONTINUAR o DETENERSE/NEGAR.
Input: "${text}"

Responde SOLO JSON: {"intent": "CONTINUE" | "STOP" | "UNKNOWN"}
UNKNOWN es si no es clara la intención de avanzar o parar.`
                    }
                ],
                response_format: { type: 'json_object' }
            });
            await this.auditAuxModelCall({
                sessionId,
                model,
                tokensIn: completion.usage?.prompt_tokens || 0,
                tokensOut: completion.usage?.completion_tokens || 0,
            });

            const content = completion.choices[0].message.content;
            if (!content) {
                throw new Error('Respuesta vacía del verificador de intención.');
            }
            const parsed = JSON.parse(content);
            const intent = parsed.intent;
            if (intent === 'CONTINUE' || intent === 'STOP' || intent === 'UNKNOWN') {
                return intent;
            }
            throw new Error('Intent inválido devuelto por el modelo.');
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'intent checker error';
            throw new Error(`Falló el verificador de intención: ${message}`);
        }
    }

    private static async auditAuxModelCall(params: {
        sessionId?: string;
        model: string;
        tokensIn: number;
        tokensOut: number;
    }): Promise<void> {
        const { sessionId, model, tokensIn, tokensOut } = params;
        if (!sessionId) return;
        if (tokensIn <= 0 && tokensOut <= 0) return;

        const costUsd = await PricingService.calculateCost(model, tokensIn, tokensOut);
        await incrementSessionCostAudit({
            sessionId,
            scope: SessionCostScope.CHAT,
            model,
            tokensIn,
            tokensOut,
            messages: 1,
            costUsd,
        });
    }

    // ========================================================================
    // DETECTOR ENGINE
    // ========================================================================

    private static async processDetectorMessage(params: {
        sessionId: string;
        userLogContent: string;
        userMessage: string;
        userImages: UserImageAttachment[];
        config: BotConfig;
        apiKey: string;
        rag: NormalizedRagConfig;
        model: string;
    }) {
        const { sessionId, userLogContent, userMessage, userImages, config, apiKey, rag, model } = params;
        const shouldRunForMode = shouldRunRagForChat(rag.mode, false, false);
        const strictMode = rag.strict_mode;

        if (shouldRunForMode && rag.vector_store_ids.length === 0 && strictMode) {
            const safeReply = this.noEvidenceReply('context');
            await this.persistDeterministicReply({
                sessionId,
                userLogContent,
                assistantContent: safeReply,
            });
            return { content: safeReply, bypass: true, rag_no_evidence: true, ended: false };
        }

        let runtimeConfig: BotConfig = config;
        if (shouldRunForMode && rag.vector_store_ids.length > 0) {
            try {
                const detectorSession = await readRuntimeSession(sessionId);
                const metadata = (detectorSession?.metadata && typeof detectorSession.metadata === 'object' && !Array.isArray(detectorSession.metadata))
                    ? detectorSession.metadata as Record<string, unknown>
                    : {};
                const detectorState = (metadata.detector_state && typeof metadata.detector_state === 'object' && !Array.isArray(metadata.detector_state))
                    ? metadata.detector_state as { currentStepIndex?: unknown }
                    : {};
                const currentStepIndexRaw = detectorState.currentStepIndex;
                const currentStepIndex = typeof currentStepIndexRaw === 'number' && Number.isFinite(currentStepIndexRaw)
                    ? Math.max(0, Math.floor(currentStepIndexRaw))
                    : 0;
                const detectionSteps = Array.isArray(config.detection_steps)
                    ? config.detection_steps as Array<Record<string, unknown>>
                    : [];
                const currentStep = detectionSteps[currentStepIndex];
                const currentStepInstruction = typeof currentStep?.instruction === 'string' ? currentStep.instruction : '';
                const currentStepCriteria = typeof currentStep?.criteria === 'string' ? currentStep.criteria : '';
                const currentStepType = currentStep?.type === 'image' || currentStep?.type === 'text' ? currentStep.type : '';

                const ragQuery = [
                    currentStepType ? `Paso detector (${currentStepType}): ${currentStepInstruction}` : '',
                    currentStepCriteria ? `Criterio del paso: ${currentStepCriteria}` : '',
                    typeof config.detection_criteria === 'string' && config.detection_criteria.trim()
                        ? `Criterio global detector: ${config.detection_criteria.trim()}`
                        : '',
                    userImages.length > 0 ? 'El usuario adjuntó imagen en este turno.' : '',
                    `Entrada del usuario: ${userMessage}`,
                ].filter(Boolean).join('\n');

                const metadataFilters = {
                    ...(rag.wrapper.metadata_filters || {}),
                    ...(rag.platform.filters || {}),
                };

                const retrieval = rag.owner === 'platform'
                    ? await RagService.retrieveEvidencePlatform({
                        apiKey,
                        model,
                        vectorStoreIds: rag.vector_store_ids,
                        query: ragQuery,
                        mode: toLegacyRagMode(rag.mode, strictMode),
                        purpose: 'context',
                        topK: rag.platform.max_num_results || rag.wrapper.top_k || 4,
                        metadataFilters,
                        rankingOptions: rag.platform.ranking_options,
                        forceTool: rag.platform.force_tool || rag.mode === 'always',
                        cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
                        maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
                    })
                    : await RagService.retrieveEvidence({
                        apiKey,
                        vectorStoreIds: rag.vector_store_ids,
                        query: ragQuery,
                        mode: toLegacyRagMode(rag.mode, strictMode),
                        purpose: 'context',
                        strategy: rag.wrapper.strategy,
                        metadataFilters,
                        topK: rag.wrapper.top_k || 4,
                        searchThreshold: rag.wrapper.score_threshold,
                        fallbackStrategy: rag.wrapper.fallback,
                        cacheTtlSeconds: rag.wrapper.cache_ttl_seconds,
                        maxEvidenceTokens: rag.wrapper.max_evidence_tokens,
                        strictMode,
                    });

                if (rag.audit.store_queries || rag.audit.store_results || rag.audit.store_scores) {
                    await this.appendRagTrace(sessionId, retrieval.trace);
                }

                if (retrieval.hasEvidence && retrieval.evidencePack) {
                    const evidenceBlock = `--- EVIDENCE PACK (fuente verificable) ---\n${retrieval.evidencePack}\n--- END EVIDENCE ---`;
                    const baseInstructions = typeof config.instructions_prefix === 'string' ? config.instructions_prefix.trim() : '';
                    runtimeConfig = {
                        ...config,
                        instructions_prefix: baseInstructions
                            ? `${baseInstructions}\n\n${evidenceBlock}`
                            : evidenceBlock,
                    };
                } else if (strictMode) {
                    const safeReply = this.noEvidenceReply('context');
                    await this.persistDeterministicReply({
                        sessionId,
                        userLogContent,
                        assistantContent: safeReply,
                    });
                    return { content: safeReply, bypass: true, rag_no_evidence: true, ended: false };
                }
            } catch {
                if (strictMode) {
                    const safeReply = this.noEvidenceReply('context');
                    await this.persistDeterministicReply({
                        sessionId,
                        userLogContent,
                        assistantContent: safeReply,
                    });
                    return { content: safeReply, bypass: true, rag_no_evidence: true, ended: false };
                }
            }
        }

        const openai = createOpenAIClient(apiKey);
        return await processDetectorMessageRuntime(
            {
                sessionId,
                userLogContent,
                userMessage,
                userImages,
                config: runtimeConfig,
                openai,
                model,
            },
            {
                readSession: async (targetSessionId) => {
                    return readRuntimeSession(targetSessionId);
                },
                writeSession: async ({ sessionId: targetSessionId, ended, metadata }) => {
                    await this.updateSessionMetadataPreservingAudit({
                        sessionId: targetSessionId,
                        ended,
                        patch: metadata,
                    });
                },
                logUserMessage: async ({ sessionId: targetSessionId, content, images }) => {
                    await this.logMessage(targetSessionId, 'user', content, 0, 0, 0, images);
                },
                logAssistantMessage: async ({ sessionId: targetSessionId, content, promptTokens, completionTokens, cost }) => {
                    await this.logMessage(targetSessionId, 'assistant', content, promptTokens, completionTokens, cost);
                },
                calculateCost: async (modelName, promptTokens, completionTokens) => {
                    return PricingService.calculateCost(modelName, promptTokens, completionTokens);
                },
                incrementCostAudit: async ({ sessionId: targetSessionId, model: modelName, tokensIn, tokensOut, costUsd }) => {
                    await incrementSessionCostAudit({
                        sessionId: targetSessionId,
                        scope: 'CHAT',
                        model: modelName,
                        tokensIn,
                        tokensOut,
                        costUsd,
                    });
                },
            }
        );
    }
}
