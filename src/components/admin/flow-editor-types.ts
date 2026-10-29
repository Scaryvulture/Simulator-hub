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
    phrase_list?: {
        phrases?: string[];
        negative_phrases?: string[];
        scope?: {
            mode?: 'full_message' | 'tail_only';
            end_window_chars?: number;
            end_window_tokens?: number;
        };
        exact_mode?: 'token_boundary' | 'suffix' | 'substring';
        fuzzy?: {
            enabled?: boolean;
            min_similarity?: number;
            max_edits_short?: number;
            max_edits_medium?: number;
            max_edits_long?: number;
            gray_zone_min_similarity?: number;
        };
        guardrails?: {
            block_on_question?: boolean;
            block_on_continuation_words?: boolean;
            continuation_words?: string[];
            allow_only_in_flow_states?: string[];
        };
        model_fallback?: {
            mode?: 'off' | 'ambiguous_only';
            min_confidence?: number;
        };
        intent_name?: string;
    };
}

export interface FlowAction {
    type: 'SET_VAR' | 'END_SESSION' | 'INCREMENT';
    var?: string;
    value?: string | number | boolean | null;
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

export interface SessionVarConfig {
    type: 'random' | 'random_by' | 'fixed' | 'computed';
    options?: (string | number | boolean)[];
    source_var?: string;
    mapping?: Record<string, (string | number | boolean)[]>;
    value?: string | number | boolean;
    formula?: string;
}
