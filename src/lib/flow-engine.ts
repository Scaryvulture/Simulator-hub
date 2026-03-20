
import { parseCSV } from './utils';
import { safeRegex } from './safe-regex';
import {
    evaluatePhraseListTrigger,
    type PhraseListConfig,
    type PhraseModelFallbackResolver,
} from './trigger-matcher';

type SessionVarValue = string | number | boolean | null;
type SessionVarMap = Record<string, SessionVarValue>;

// ============================================================================
// FLOW ENGINE - Universal State Machine for Bot Flows
// ============================================================================

// Types for session variables configuration
export interface SessionVarConfig {
    type: 'random' | 'random_by' | 'fixed' | 'computed';
    options?: (string | number)[];
    source_var?: string;
    mapping?: Record<string, (string | number)[]>;
    value?: SessionVarValue;
    formula?: string;
}

export interface SessionVarsConfig {
    [varName: string]: SessionVarConfig;
}

// Types for flow triggers
export interface FlowTrigger {
    type: 'START' | 'REGEX' | 'AFTER_STEP' | 'CONDITION' | 'DEFAULT' | 'PHRASE_LIST';
    priority?: number;
    pattern?: string;
    flags?: string;
    step_id?: string;
    condition?: {
        var: string;
        op: 'contains' | 'not_contains' | 'equals' | 'not_equals' | 'ends_with' | 'not_ends_with' | 'gt' | 'lt';
        value: string | number;
    };
    phrase_list?: PhraseListConfig;
}

// Types for flow actions
export interface FlowAction {
    type: 'SET_VAR' | 'END_SESSION' | 'INCREMENT';
    var?: string;
    value?: SessionVarValue;
}

export interface FlowRagAction {
    enabled?: boolean;
    purpose?: 'context' | 'validate_user_response' | 'evaluate_conversation';
    strategy?: 'metadata_first' | 'similarity' | 'hybrid';
    query_template?: string;
    metadata_filters?: Record<string, string | number | boolean>;
    strict?: boolean;
    top_k?: number;
}

// Flow step definition
export interface FlowStep {
    id: string;
    priority?: number;
    mode: 'SCRIPTED' | 'LLM';
    message?: string;
    llm_context?: string;
    rag_action?: FlowRagAction;
    triggers: FlowTrigger[];
    next_step?: string;
    actions?: FlowAction[];
}

// Full flow configuration
export interface FlowConfig {
    session_vars?: SessionVarsConfig;
    global_triggers?: FlowStep[];
    flow_steps?: FlowStep[];
}

// Session flow state (stored in Session.metadata)
export interface FlowState {
    current_step: string;
    completed_steps: string[];
    vars: SessionVarMap;
    ended: boolean;
}

export interface TriggerAuditEntry {
    step_id: string;
    trigger_index: number;
    trigger_type: FlowTrigger['type'];
    matched: boolean;
    layer: 'start' | 'regex' | 'after_step' | 'condition' | 'default' | 'exact' | 'fuzzy' | 'model' | 'none';
    reason?: string;
    candidate?: string;
    score?: number;
    distance?: number;
    max_distance?: number;
    guardrails_applied?: string[];
    model_used?: boolean;
    model_confidence?: number;
    scoped_text?: string;
    scoped_text_normalized?: string;
    ambiguous?: boolean;
}

export interface FlowProcessOptions {
    phrase_model_fallback?: PhraseModelFallbackResolver;
    collect_trigger_audit?: boolean;
}

interface TriggerEvaluation {
    matched: boolean;
    layer: TriggerAuditEntry['layer'];
    reason?: string;
    candidate?: string;
    score?: number;
    distance?: number;
    max_distance?: number;
    guardrails_applied?: string[];
    model_used?: boolean;
    model_confidence?: number;
    scoped_text?: string;
    scoped_text_normalized?: string;
    ambiguous?: boolean;
}

interface EvaluatedTriggerRecord {
    trigger: FlowTrigger;
    triggerIndex: number;
    evaluation: TriggerEvaluation;
}

interface StepEvaluationResult {
    step: FlowStep;
    stepIndex: number;
    allMatched: boolean;
    configuredTriggers: EvaluatedTriggerRecord[];
    fallbackEligible: boolean;
    fallbackScore: number;
    priorityGroup: number;
    explicitPriority: number;
}

type RegexBudgetState = {
    remaining: number;
};

function resolveRuntimeRegexBudget(): number {
    const fallback = 120;
    const raw = Number(process.env.FLOW_RUNTIME_MAX_REGEX_EVALS || fallback);
    if (!Number.isFinite(raw)) return fallback;
    const normalized = Math.trunc(raw);
    if (normalized < 1) return 1;
    if (normalized > 5000) return 5000;
    return normalized;
}

// ============================================================================
// FLOW ENGINE CLASS
// ============================================================================

export class FlowEngine {
    private static normalizePriority(value: unknown): number {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
        return Math.trunc(value);
    }

    /**
     * Initialize session variables at session start
     */
    static initSessionVars(config: SessionVarsConfig): SessionVarMap {
        const vars: SessionVarMap = {};
        const varNames = Object.keys(config);

        // Process in order (dependencies may exist)
        for (const varName of varNames) {
            const varConfig = config[varName];
            vars[varName] = this.generateVarValue(varConfig, vars);
        }

        return vars;
    }

    /**
     * Generate a single variable value based on its config
     */
    private static generateVarValue(config: SessionVarConfig, currentVars: SessionVarMap): SessionVarValue {
        switch (config.type) {
            case 'random':
                if (config.options && config.options.length > 0) {
                    return this.pick(config.options);
                }
                return null;

            case 'random_by':
                if (config.source_var && config.mapping) {
                    const sourceValue = currentVars[config.source_var];
                    const options = config.mapping[String(sourceValue)];
                    if (options && options.length > 0) {
                        return this.pick(options);
                    }
                }
                return null;

            case 'fixed':
                return config.value ?? null;

            case 'computed':
                return this.evaluateFormula(config.formula || '', currentVars);

            default:
                return null;
        }
    }

    /**
     * Evaluate simple formulas like "random(18, 55)"
     */
    private static evaluateFormula(formula: string, vars: SessionVarMap): SessionVarValue {
        // Handle random(min, max)
        const randomMatch = formula.match(/random\((\d+),\s*(\d+)\)/);
        if (randomMatch) {
            const min = parseInt(randomMatch[1], 10);
            const max = parseInt(randomMatch[2], 10);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // Handle variable references
        if (vars[formula] !== undefined) {
            return vars[formula] ?? null;
        }

        // Return as-is if no formula matched
        return formula;
    }

    /**
     * Pick a random element from an array
     */
    private static pick<T>(arr: T[]): T {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /**
     * Interpolate variables in a template string
     * Replaces {varName} with the actual value
     */
    static interpolate(template: string, vars: SessionVarMap): string {
        return template.replace(/\{(\w+)\}/g, (match, varName) => {
            return vars[varName] !== undefined ? String(vars[varName]) : match;
        });
    }

    /**
     * Evaluate if a trigger matches the current context
     */
    static async evaluateTrigger(
        trigger: FlowTrigger,
        userMessage: string,
        flowState: FlowState,
        isStart: boolean,
        options?: FlowProcessOptions,
        context?: { stepId?: string; triggerIndex?: number },
        allowPhraseModelFallback: boolean = true,
        regexBudget?: RegexBudgetState
    ): Promise<TriggerEvaluation> {
        switch (trigger.type) {
            case 'START':
                return { matched: isStart, layer: 'start' };

            case 'REGEX':
                if (trigger.pattern) {
                    if (regexBudget) {
                        if (regexBudget.remaining <= 0) {
                            return { matched: false, layer: 'none', reason: 'regex_budget_exceeded' };
                        }
                        regexBudget.remaining -= 1;
                    }
                    const regex = safeRegex(trigger.pattern, trigger.flags || 'i');
                    return { matched: regex ? regex.test(userMessage) : false, layer: 'regex' };
                }
                return { matched: false, layer: 'none', reason: 'regex_empty_pattern' };

            case 'AFTER_STEP':
                return {
                    matched: flowState.completed_steps.includes(trigger.step_id || ''),
                    layer: 'after_step',
                };

            case 'CONDITION':
                return {
                    matched: this.evaluateCondition(trigger.condition!, userMessage, flowState),
                    layer: 'condition',
                };

            case 'PHRASE_LIST': {
                const phraseList = trigger.phrase_list;
                const evaluated = await evaluatePhraseListTrigger(
                    phraseList || { phrases: [] },
                    {
                        raw_message: userMessage,
                        current_flow_step: flowState.current_step,
                        trigger_id: context?.stepId
                            ? `${context.stepId}#${context.triggerIndex ?? 0}`
                            : undefined,
                    },
                    allowPhraseModelFallback ? options?.phrase_model_fallback : undefined
                );
                return {
                    matched: evaluated.matched,
                    layer: evaluated.layer,
                    reason: evaluated.reason,
                    candidate: evaluated.candidate,
                    score: evaluated.score,
                    distance: evaluated.distance,
                    max_distance: evaluated.max_distance,
                    guardrails_applied: evaluated.guardrails_applied,
                    model_used: evaluated.model_used,
                    model_confidence: evaluated.model_confidence,
                    scoped_text: evaluated.scoped_text,
                    scoped_text_normalized: evaluated.scoped_text_normalized,
                    ambiguous: evaluated.ambiguous,
                };
            }

            case 'DEFAULT':
                return { matched: true, layer: 'default' };

            default:
                return { matched: false, layer: 'none', reason: 'unknown_trigger_type' };
        }
    }

    /**
     * Evaluate a condition against the current state
     */
    private static evaluateCondition(
        condition: { var: string; op: string; value: string | number },
        userMessage: string,
        flowState: FlowState
    ): boolean {
        // Get the value to test
        let testValue: SessionVarValue | string;
        if (condition.var === 'user_message') {
            testValue = userMessage;
        } else {
            testValue = flowState.vars[condition.var];
        }

        const condValue = condition.value;

        switch (condition.op) {
            case 'contains': {
                // Support comma-separated values: "adiós, chao, chau" → matches if ANY term is found
                const searchTerms = parseCSV(String(condValue)).map(s => s.trim().toLowerCase()).filter(s => s);
                const testLower = String(testValue).toLowerCase();
                return searchTerms.some(term => testLower.includes(term));
            }

            case 'not_contains': {
                // Returns true only if NONE of the comma-separated terms are found
                const excludeTerms = parseCSV(String(condValue)).map(s => s.trim().toLowerCase()).filter(s => s);
                const testLowerNc = String(testValue).toLowerCase();
                return !excludeTerms.some(term => testLowerNc.includes(term));
            }

            case 'equals':
                return testValue === condValue;

            case 'not_equals':
                return testValue !== condValue;

            case 'ends_with':
                return String(testValue).trim().endsWith(String(condValue));

            case 'not_ends_with':
                return !String(testValue).trim().endsWith(String(condValue));

            case 'gt':
                return Number(testValue) > Number(condValue);

            case 'lt':
                return Number(testValue) < Number(condValue);

            default:
                return false;
        }
    }

    /**
     * Check if a trigger is properly configured (has meaningful data)
     */
    private static isTriggerConfigured(trigger: FlowTrigger): boolean {
        switch (trigger.type) {
            case 'REGEX':
                return !!trigger.pattern && trigger.pattern.trim() !== '';
            case 'AFTER_STEP':
                return !!trigger.step_id && trigger.step_id.trim() !== '';
            case 'CONDITION':
                return !!trigger.condition && trigger.condition.value !== undefined && trigger.condition.value !== '';
            case 'PHRASE_LIST':
                return Boolean(trigger.phrase_list?.phrases?.some((phrase) => phrase.trim() !== ''));
            case 'START':
            case 'DEFAULT':
                return true; // These are always "configured"
            default:
                return false;
        }
    }

    private static canUseModelFallbackForTrigger(record: EvaluatedTriggerRecord): boolean {
        if (record.trigger.type !== 'PHRASE_LIST') return false;
        if (record.evaluation.matched) return false;
        if (!record.evaluation.ambiguous) return false;
        if (record.evaluation.guardrails_applied && record.evaluation.guardrails_applied.length > 0) return false;

        const reason = record.evaluation.reason || '';
        return reason === 'no_clear_match' || reason === 'model_fallback_rejected';
    }

    private static deriveStepPriorityGroup(step: FlowStep): number {
        const hasStatePriorityTrigger = step.triggers.some((trigger) => {
            if (trigger.type === 'AFTER_STEP') {
                return Boolean(trigger.step_id && trigger.step_id.trim() !== '');
            }

            if (trigger.type === 'CONDITION') {
                return Boolean(trigger.condition && trigger.condition.var !== 'user_message');
            }

            if (trigger.type === 'PHRASE_LIST') {
                const allowedStates = trigger.phrase_list?.guardrails?.allow_only_in_flow_states;
                return Array.isArray(allowedStates) && allowedStates.length > 0;
            }

            return false;
        });

        return hasStatePriorityTrigger ? 0 : 1;
    }

    private static appendAuditEntries(
        audit: TriggerAuditEntry[],
        stepId: string,
        records: EvaluatedTriggerRecord[]
    ) {
        for (const record of records) {
            audit.push({
                step_id: stepId,
                trigger_index: record.triggerIndex,
                trigger_type: record.trigger.type,
                matched: record.evaluation.matched,
                layer: record.evaluation.layer,
                reason: record.evaluation.reason,
                candidate: record.evaluation.candidate,
                score: record.evaluation.score,
                distance: record.evaluation.distance,
                max_distance: record.evaluation.max_distance,
                guardrails_applied: record.evaluation.guardrails_applied,
                model_used: record.evaluation.model_used,
                model_confidence: record.evaluation.model_confidence,
                scoped_text: record.evaluation.scoped_text,
                scoped_text_normalized: record.evaluation.scoped_text_normalized,
                ambiguous: record.evaluation.ambiguous,
            });
        }
    }

    private static async evaluateStep(
        step: FlowStep,
        stepIndex: number,
        userMessage: string,
        flowState: FlowState,
        isStart: boolean,
        options?: FlowProcessOptions,
        allowPhraseModelFallback: boolean = false,
        regexBudget?: RegexBudgetState
    ): Promise<StepEvaluationResult> {
        const configuredRaw = step.triggers
            .map((trigger, triggerIndex) => ({ trigger, triggerIndex }))
            .filter((item) => this.isTriggerConfigured(item.trigger));

        if (configuredRaw.length === 0) {
            return {
                step,
                stepIndex,
                allMatched: false,
                configuredTriggers: [],
                fallbackEligible: false,
                fallbackScore: 0,
                priorityGroup: this.deriveStepPriorityGroup(step),
                explicitPriority: this.normalizePriority(step.priority),
            };
        }

        let allMatched = true;
        let allNonPhraseMatched = true;
        let hasFallbackCandidate = false;
        let fallbackBlocked = false;
        let fallbackScore = -1;
        let explicitPriority = this.normalizePriority(step.priority);
        const configuredTriggers: EvaluatedTriggerRecord[] = [];

        for (const item of configuredRaw) {
            explicitPriority = Math.min(explicitPriority, this.normalizePriority(item.trigger.priority));
            const evaluation = await this.evaluateTrigger(
                item.trigger,
                userMessage,
                flowState,
                isStart,
                options,
                { stepId: step.id, triggerIndex: item.triggerIndex },
                allowPhraseModelFallback,
                regexBudget
            );

            const record: EvaluatedTriggerRecord = {
                trigger: item.trigger,
                triggerIndex: item.triggerIndex,
                evaluation,
            };
            configuredTriggers.push(record);

            if (!evaluation.matched) {
                allMatched = false;
            }

            if (item.trigger.type !== 'PHRASE_LIST') {
                if (!evaluation.matched) {
                    allNonPhraseMatched = false;
                }
                continue;
            }

            if (evaluation.matched) continue;

            if (this.canUseModelFallbackForTrigger(record)) {
                hasFallbackCandidate = true;
                if (typeof evaluation.score === 'number') {
                    fallbackScore = Math.max(fallbackScore, evaluation.score);
                }
            } else {
                fallbackBlocked = true;
            }
        }

        const fallbackEligible = !allMatched
            && allNonPhraseMatched
            && hasFallbackCandidate
            && !fallbackBlocked;

        return {
            step,
            stepIndex,
            allMatched,
            configuredTriggers,
            fallbackEligible,
            fallbackScore: fallbackScore >= 0 ? fallbackScore : 0,
            priorityGroup: this.deriveStepPriorityGroup(step),
            explicitPriority,
        };
    }

    static async findMatchingStep(
        steps: FlowStep[],
        userMessage: string,
        flowState: FlowState,
        isStart: boolean,
        options?: FlowProcessOptions
    ): Promise<{ step: FlowStep | null; audit: TriggerAuditEntry[] }> {
        const audit: TriggerAuditEntry[] = [];
        const fallbackCandidates: StepEvaluationResult[] = [];
        const regexBudget: RegexBudgetState = {
            remaining: resolveRuntimeRegexBudget(),
        };

        // Pass 1: deterministic layers only (exact/fuzzy/no model fallback)
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
            const step = steps[stepIndex];
            const evaluated = await this.evaluateStep(
                step,
                stepIndex,
                userMessage,
                flowState,
                isStart,
                options,
                false,
                regexBudget
            );

            if (options?.collect_trigger_audit) {
                this.appendAuditEntries(audit, step.id, evaluated.configuredTriggers);
            }

            if (evaluated.allMatched) {
                return { step, audit };
            }

            if (evaluated.fallbackEligible && options?.phrase_model_fallback) {
                fallbackCandidates.push(evaluated);
            }
        }

        // Pass 2: model fallback only for eligible ambiguous candidates.
        // Priority: business/state group first, then fuzzy score, then step order.
        if (fallbackCandidates.length > 0 && options?.phrase_model_fallback) {
            const orderedCandidates = [...fallbackCandidates].sort((a, b) => {
                if (a.priorityGroup !== b.priorityGroup) return a.priorityGroup - b.priorityGroup;
                if (a.explicitPriority !== b.explicitPriority) return a.explicitPriority - b.explicitPriority;
                if (a.fallbackScore !== b.fallbackScore) return b.fallbackScore - a.fallbackScore;
                return a.stepIndex - b.stepIndex;
            });

            for (const candidate of orderedCandidates) {
                const evaluatedWithFallback = await this.evaluateStep(
                    candidate.step,
                    candidate.stepIndex,
                    userMessage,
                    flowState,
                    isStart,
                    options,
                    true,
                    regexBudget
                );

                if (options?.collect_trigger_audit) {
                    this.appendAuditEntries(audit, candidate.step.id, evaluatedWithFallback.configuredTriggers);
                }

                if (evaluatedWithFallback.allMatched) {
                    return { step: candidate.step, audit };
                }
            }
        }

        // Fallback: find a DEFAULT step
        const defaultStep = steps.find(step =>
            step.triggers.some(t => t.type === 'DEFAULT')
        );

        if (defaultStep && options?.collect_trigger_audit) {
            audit.push({
                step_id: defaultStep.id,
                trigger_index: defaultStep.triggers.findIndex(t => t.type === 'DEFAULT'),
                trigger_type: 'DEFAULT',
                matched: true,
                layer: 'default',
                reason: 'fallback_default_step',
            });
        }

        return { step: defaultStep || null, audit };
    }

    /**
     * Execute a step and return the result
     */
    static executeStep(
        step: FlowStep,
        flowState: FlowState
    ): { message: string | null; newState: FlowState; useLLM: boolean; llmContext?: string; ragAction?: FlowRagAction } {
        const newState: FlowState = {
            ...flowState,
            current_step: step.id,
            completed_steps: [...flowState.completed_steps, step.id],
        };

        // Process actions
        if (step.actions) {
            for (const action of step.actions) {
                switch (action.type) {
                    case 'END_SESSION':
                        newState.ended = true;
                        break;
                    case 'SET_VAR':
                        if (action.var) {
                            newState.vars[action.var] = action.value ?? null;
                        }
                        break;
                    case 'INCREMENT':
                        if (action.var) {
                            const currentRaw = newState.vars[action.var];
                            const currentValue: number = typeof currentRaw === 'number'
                                ? currentRaw
                                : Number(currentRaw ?? 0) || 0;
                            const incrementBy = typeof action.value === 'number'
                                ? action.value
                                : Number(action.value ?? 1) || 1;
                            newState.vars[action.var] = currentValue + incrementBy;
                        }
                        break;
                }
            }
        }

        // Set next step
        if (step.next_step) {
            newState.current_step = step.next_step;
        }

        if (step.mode === 'SCRIPTED') {
            // Interpolate message with variables
            const message = step.message ? this.interpolate(step.message, newState.vars) : '';
            return { message, newState, useLLM: false };
        } else {
            // LLM mode - return context for the LLM
            const llmContext = step.llm_context ? this.interpolate(step.llm_context, newState.vars) : '';
            const ragAction = step.rag_action ? this.interpolateRagAction(step.rag_action, newState.vars) : undefined;
            return { message: null, newState, useLLM: true, llmContext, ragAction };
        }
    }

    private static interpolateRagAction(ragAction: FlowRagAction, vars: SessionVarMap): FlowRagAction {
        const interpolatedFilters: Record<string, string | number | boolean> = {};
        const sourceFilters = ragAction.metadata_filters || {};

        for (const [key, value] of Object.entries(sourceFilters)) {
            if (typeof value === 'string') {
                interpolatedFilters[key] = this.interpolate(value, vars);
            } else {
                interpolatedFilters[key] = value;
            }
        }

        return {
            ...ragAction,
            query_template: ragAction.query_template ? this.interpolate(ragAction.query_template, vars) : ragAction.query_template,
            metadata_filters: interpolatedFilters,
        };
    }

    /**
     * Create initial flow state for a new session
     */
    static createInitialState(config: FlowConfig): FlowState {
        const vars = config.session_vars ? this.initSessionVars(config.session_vars) : {};

        return {
            current_step: 'START',
            completed_steps: [],
            vars,
            ended: false,
        };
    }

    /**
     * Main entry point: process a message through the flow engine
     */
    static async processMessage(
        config: FlowConfig,
        userMessage: string,
        currentState: FlowState | null,
        isStart: boolean = false,
        options?: FlowProcessOptions
    ): Promise<{
        response: string | null;
        newState: FlowState;
        useLLM: boolean;
        llmContext?: string;
        ragAction?: FlowRagAction;
        ended: boolean;
        triggerAudit?: TriggerAuditEntry[];
    }> {
        // Initialize state if not exists
        const state = currentState || this.createInitialState(config);
        const accumulatedAudit: TriggerAuditEntry[] = [];

        // If session already ended, return early
        if (state.ended) {
            return {
                response: null,
                newState: state,
                useLLM: false,
                ended: true,
                triggerAudit: accumulatedAudit,
            };
        }

        // Global triggers can intercept from any step before normal flow.
        const globalSteps = config.global_triggers || [];
        if (globalSteps.length > 0) {
            const globalMatching = await this.findMatchingStep(globalSteps, userMessage, state, isStart, options);
            if (globalMatching.audit.length > 0) {
                accumulatedAudit.push(...globalMatching.audit);
            }

            if (globalMatching.step) {
                const globalResult = this.executeStep(globalMatching.step, state);
                return {
                    response: globalResult.message,
                    newState: globalResult.newState,
                    useLLM: globalResult.useLLM,
                    llmContext: globalResult.llmContext,
                    ragAction: globalResult.ragAction,
                    ended: globalResult.newState.ended,
                    triggerAudit: accumulatedAudit,
                };
            }
        }

        const steps = config.flow_steps || [];
        // Find matching step
        const matching = await this.findMatchingStep(steps, userMessage, state, isStart, options);
        const matchingStep = matching.step;
        if (matching.audit.length > 0) {
            accumulatedAudit.push(...matching.audit);
        }

        if (!matchingStep) {
            // No step matched, let LLM handle it
            return {
                response: null,
                newState: state,
                useLLM: true,
                ended: false,
                triggerAudit: accumulatedAudit,
            };
        }

        // Execute the step
        const result = this.executeStep(matchingStep, state);

        return {
            response: result.message,
            newState: result.newState,
            useLLM: result.useLLM,
            llmContext: result.llmContext,
            ragAction: result.ragAction,
            ended: result.newState.ended,
            triggerAudit: accumulatedAudit,
        };
    }
}
