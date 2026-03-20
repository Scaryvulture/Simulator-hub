import { z } from 'zod';

// ============================================================================
// SHARED / UTILS
// ============================================================================

const ImageTriggerSchema = z.object({
    pattern: z.string().describe("Regex pattern to trigger image display"),
    image_url: z.string().url(),
    caption: z.string().optional(),
});

const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(JsonValueSchema),
        z.record(z.string(), JsonValueSchema),
    ])
);

const ToolSchema = z.object({
    type: z.literal('function'),
    function: z.object({
        name: z.string(),
        description: z.string().optional(),
        parameters: z.record(z.string(), JsonValueSchema).optional(),
    }),
});

const PrimitiveFilterValueSchema = z.union([z.string(), z.number(), z.boolean()]);

const ChatFeaturesSchema = z.object({
    allow_image_upload: z.boolean().default(false),
    allow_voice_input: z.boolean().default(true),
    allow_voice_output: z.boolean().default(true),
    tts_settings: z.object({
        speed: z.number().min(0.7).max(1.5).optional(),
        voice: z.string().optional(),
        accent: z.string().optional(),
        gender: z.enum(['female', 'male', 'neutral', 'random']).optional(),
        style: z.string().optional(),
        use_archetype: z.boolean().optional(),
    }).partial().optional(),
}).partial();

// ============================================================================
// RAG CONFIGURATION (NEW)
// ============================================================================

const RagModeSchema = z.enum([
    'never',
    'always',
    'by_step',
    'evaluation_only',
    // Legacy compatibility:
    'OFF',
    'AUTO',
    'FORCED',
]);

const RagOwnerSchema = z.enum(['wrapper', 'platform']);

const RagWrapperSchema = z.object({
    strategy: z.enum(['metadata_first', 'similarity', 'hybrid']).default('similarity'),
    fallback: z.enum(['rewrite_retry', 'secondary_store', 'safe_reply', 'none']).default('none'),
    score_threshold: z.number().min(0).max(1).optional(),
    cache_ttl: z.number().min(0).max(3600).default(120),
    metadata_filters: z.record(z.string(), PrimitiveFilterValueSchema).optional(),
    top_k: z.number().min(1).max(50).default(4),
    max_evidence_tokens: z.number().min(200).max(8000).default(1200),
}).partial();

const RagPlatformSchema = z.object({
    max_num_results: z.number().min(1).max(50).default(6),
    filters: z.record(z.string(), PrimitiveFilterValueSchema).optional(),
    ranking_options: z.object({
        score_threshold: z.number().min(0).max(1).optional(),
    }).partial().optional(),
    force_tool: z.boolean().default(false),
}).partial();

const RagAuditSchema = z.object({
    store_results: z.boolean().default(true),
    store_queries: z.boolean().default(true),
    store_scores: z.boolean().default(true),
}).partial();

export const RagConfigSchema = z.object({
    enabled: z.boolean().optional(),
    mode: RagModeSchema.default('never'),
    owner: RagOwnerSchema.optional(),
    rag_owner: RagOwnerSchema.optional(), // legacy alias
    vector_store_ids: z.array(z.string()).default([]),
    wrapper: RagWrapperSchema.optional(),
    platform: RagPlatformSchema.optional(),
    audit: RagAuditSchema.optional(),

    // Legacy compatibility fields
    top_k: z.number().min(1).max(50).optional(),
    strict_mode: z.boolean().optional().describe("If true, requires evidence to answer"),
    fallback_strategy: z.enum(['rewrite_retry', 'secondary_store', 'safe_reply', 'none']).optional(),
    metadata_filters: z.record(z.string(), PrimitiveFilterValueSchema).optional(),
    search_threshold: z.number().min(0).max(1).optional().describe("Minimum similarity score"),
    cache_ttl_seconds: z.number().min(0).max(3600).optional(),
    max_evidence_tokens: z.number().min(200).max(8000).optional(),
    history_limit: z.number().min(1).max(30).default(10),
}).passthrough();

// ============================================================================
// SESSION VARIABLES & FLOW ENGINE
// ============================================================================

const SessionVarSchema = z.union([
    // Simple array of values (legacy)
    z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    // Complex config
    z.object({
        type: z.enum(['random', 'fixed', 'computed', 'random_by']),
        value: JsonValueSchema.optional(), // for fixed
        options: z.array(JsonValueSchema).optional(), // for random
        formula: z.string().optional(), // for computed
        source_var: z.string().optional(), // for random_by
        mapping: z.record(z.string(), z.array(JsonValueSchema)).optional(), // for random_by mapping
        // Legacy support for simple object with 'values'
        values: z.array(JsonValueSchema).optional(),
    }),
    // Simple value
    z.string(),
    z.number(),
    z.boolean(),
    z.null()
]);

const VariableRuleSchema = z.object({
    depends_on: z.string(),
    mappings: z.record(z.string(), z.array(z.string())),
});

const PhraseListScopeSchema = z.object({
    mode: z.enum(['full_message', 'tail_only']).default('full_message'),
    end_window_chars: z.number().min(1).max(2000).default(90),
    end_window_tokens: z.number().min(1).max(200).default(10),
}).partial();

const PhraseListFuzzySchema = z.object({
    enabled: z.boolean().default(true),
    min_similarity: z.number().min(0).max(1).default(0.84),
    max_edits_short: z.number().min(0).max(5).default(1),
    max_edits_medium: z.number().min(0).max(8).default(2),
    max_edits_long: z.number().min(0).max(10).default(3),
    gray_zone_min_similarity: z.number().min(0).max(1).default(0.7),
}).partial();

const PhraseListGuardrailsSchema = z.object({
    block_on_question: z.boolean().default(false),
    block_on_continuation_words: z.boolean().default(false),
    continuation_words: z.array(z.string()).optional(),
    allow_only_in_flow_states: z.array(z.string()).optional(),
}).partial();

const PhraseListModelFallbackSchema = z.object({
    mode: z.enum(['off', 'ambiguous_only']).default('off'),
    min_confidence: z.number().min(0).max(1).default(0.75),
}).partial();

const PhraseListConfigSchema = z.object({
    phrases: z.array(z.string()).default([]),
    negative_phrases: z.array(z.string()).optional(),
    scope: PhraseListScopeSchema.optional(),
    exact_mode: z.enum(['token_boundary', 'suffix', 'substring']).default('token_boundary').optional(),
    fuzzy: PhraseListFuzzySchema.optional(),
    guardrails: PhraseListGuardrailsSchema.optional(),
    model_fallback: PhraseListModelFallbackSchema.optional(),
    intent_name: z.string().optional(),
}).partial();

const FlowTriggerSchema = z.object({
    type: z.enum(['START', 'REGEX', 'AFTER_STEP', 'CONDITION', 'DEFAULT', 'PHRASE_LIST']),
    priority: z.number().int().min(-1000).max(1000).optional(),
    pattern: z.string().optional(),
    flags: z.string().optional(),
    step_id: z.string().optional(),
    condition: z.object({
        var: z.string(),
        op: z.enum(['contains', 'not_contains', 'equals', 'not_equals', 'ends_with', 'not_ends_with', 'gt', 'lt']),
        value: z.union([z.string(), z.number()]),
    }).optional(),
    phrase_list: PhraseListConfigSchema.optional(),
});

const FlowActionSchema = z.object({
    type: z.enum(['SET_VAR', 'END_SESSION', 'INCREMENT']),
    var: z.string().optional(),
    value: JsonValueSchema.optional(),
});

const FlowRagActionSchema = z.object({
    enabled: z.boolean().default(true),
    purpose: z.enum(['context', 'validate_user_response', 'evaluate_conversation']).default('context'),
    strategy: z.enum(['metadata_first', 'similarity', 'hybrid']).default('similarity'),
    query_template: z.string().optional(),
    metadata_filters: z.record(z.string(), PrimitiveFilterValueSchema).optional(),
    strict: z.boolean().optional(),
    top_k: z.number().min(1).max(50).optional(),
});

const FlowStepSchema = z.object({
    id: z.string(),
    priority: z.number().int().min(-1000).max(1000).optional(),
    mode: z.enum(['SCRIPTED', 'LLM']),
    message: z.string().optional(),
    llm_context: z.string().optional(),
    rag_action: FlowRagActionSchema.optional(),
    triggers: z.array(FlowTriggerSchema).default([]),
    next_step: z.string().optional(),
    actions: z.array(FlowActionSchema).optional(),
});

// ============================================================================
// EXAMINER / QUESTION BANK
// ============================================================================

const QuestionSchema = z.object({
    id: z.string(),
    topic: z.string(),
    // Legacy field. UI now treats all as "questions" but keeps compatibility.
    type: z.enum(['teorica', 'practica']).default('teorica'),
    question: z.string(),
    expected_keys: z.string(),
    media_url: z.string().optional(),
    is_mandatory: z.boolean().default(false),
    branch_key: z.string().optional(),
    max_attempts: z.number().int().min(1).max(5).optional(),
    continue_mode: z.enum(['ask_confirm', 'auto_next']).optional(),
    min_expected_matches: z.number().int().min(1).max(20).optional(),
    min_answer_words: z.number().int().min(1).max(200).optional(),
    min_answer_sentences: z.number().int().min(1).max(20).optional(),
    retry_incomplete_template: z.string().optional(),
    retry_incorrect_template: z.string().optional(),
    second_fail_template: z.string().optional(),
    correct_feedback_template: z.string().optional(),
    continue_prompt_template: z.string().optional(),
    evaluation_spec: z.record(z.string(), JsonValueSchema).optional(),
});

export const QuestionBankSchema = z.object({
    topics: z.array(z.string()),
    questions: z.array(QuestionSchema),
});
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

const ExamSequenceItemSchema = z.object({
    id: z.string(),
    type: z.enum(['specific', 'random_pool', 'random_topic']),
    // For 'specific'
    question_id: z.string().optional(),
    // For 'random_pool'
    pool_ids: z.array(z.string()).optional(),
    // For 'random_topic'
    topic: z.string().optional(),
    // For both random types
    count: z.number().default(1),
});

const EvaluationConfigSchema = z.object({
    teoricas: z.object({
        mandatory: z.number().default(0),
        random: z.number().default(0),
    }),
    practicas: z.object({
        count: z.number().default(0),
        by_topic: z.boolean().default(false),
    }),
    selection: z.object({
        mandatory_count: z.number().default(0),
        random_count: z.number().default(0),
        by_topic: z.boolean().default(false),
        order_mode: z.enum(['mandatory_first', 'random_first', 'mixed']).default('mandatory_first'),
        question_type_order: z.enum(['any', 'teorica_first', 'practica_first']).optional(),
        show_question_counter: z.boolean().optional(),
        semantic_mode: z.enum(['ambiguous_only', 'always']).default('ambiguous_only'),
    }).optional(),
    topic_config: z.object({
        enabled: z.boolean().default(true),
        ask_template: z.string().optional(),
        no_topic_template: z.string().optional(),
        confirm_template: z.string().optional(),
        correction_prompt_template: z.string().optional(),
        single_task_template: z.string().optional(),
        enforce_single_task: z.boolean().default(false),
        allow_topic_correction: z.boolean().default(true),
        use_router_llm: z.boolean().default(true),
        router_prompt: z.string().optional(),
        topic_aliases: z.record(z.string(), z.array(z.string())).optional(),
        skip_confirmation: z.boolean().default(false),
        topic_feedbacks: z.record(z.string(), z.string()).optional(),
    }).optional(),
    closing_config: z.object({
        post_exam_doubt_prompt_template: z.string().optional(),
        post_exam_doubt_followup_template: z.string().optional(),
    }).optional(),
    interstitial_messages: z.array(z.object({
        id: z.string(),
        after_question_number: z.number().int().min(1).default(1),
        message: z.string(),
        topics: z.array(z.string()).optional(),
        enabled: z.boolean().default(true),
        wait_for_user: z.boolean().optional(),
        continue_prompt: z.string().optional(),
    })).optional(),
    // New Sequence Mode
    mode: z.enum(['standard', 'sequence']).default('standard'),
    sequence: z.array(ExamSequenceItemSchema).default([]),
});

const EvaluatorCriterionSchema = z.object({
    id: z.string(),
    title: z.string(),
    instruction: z.string(),
});

const EvaluatorCriteriaSchema = z.object({
    boolean: z.array(EvaluatorCriterionSchema).default([]),
    qualitative: z.array(EvaluatorCriterionSchema).default([]),
});

// ============================================================================
// DETECTOR CONFIG (NEW V2)
// ============================================================================

const DetectionStepSchema = z.object({
    id: z.string(),
    order: z.number().default(0),
    type: z.enum(['text', 'image']),
    instruction: z.string(),
    required: z.boolean().default(true),
    example_image_url: z.string().optional().describe("URL of an example image to show the user"),
    // For Text Steps
    keywords: z.array(z.string()).optional(),
    // For Image Steps
    criteria: z.string().optional(),
    // Logic - FAIL ACTION REMOVED (V4 Smart Flow handles this via severity)

    // V4 Smart Flow Fields
    feedback_ok: z.string().optional().describe("Message to show when step passes"),
    feedback_warn: z.string().optional().describe("Message to show when step has warning"),
    feedback_block: z.string().optional().describe("Message to show when step fails (Critical)"),
    feedback_uncertain: z.string().optional().describe("Message to show when step is uncertain"),

    show_ref_on_warn: z.boolean().optional(),
    show_ref_on_block: z.boolean().optional(),
    allow_critical_retry: z.boolean().optional().describe("If true, allows user to retry once on CRITICAL failure instead of blocking immediately"),
    show_ref_on_uncertain: z.boolean().default(false), // Usually we want them to just retake, but maybe show ref?
    on_critical: z.enum(['block', 'continue_flagged']).default('block').optional(),
    run_if: z.object({
        var: z.string(),
        operator: z.enum(['equals', 'contains_any', 'in']).default('equals'),
        value: z.string().optional(),
        values: z.array(z.string()).optional(),
    }).optional(),
});

const DetectorOptionsSchema = z.object({
    reference_mode: z.enum(['step_flags', 'single_priority', 'none']).optional(),
    include_reference_in_final_report: z.boolean().optional(),
    correction_reclassify_enabled: z.boolean().optional(),
    correction_requires_new_image: z.boolean().optional(),
    correction_patterns: z.array(z.string()).optional(),
    final_verdict_template: z.string().optional(),
    verdict_labels: z.object({
        habilitado: z.string().optional(),
        habilitado_con_observaciones: z.string().optional(),
        no_habilitado: z.string().optional(),
        informacion_insuficiente: z.string().optional(),
    }).partial().optional(),
}).partial();

const GenericInteractionSchema = z.object({
    goodbye_intent_phrases: z.array(z.string()).optional(),
    closing_intent_phrases: z.array(z.string()).optional(),
    ignore_question_messages: z.boolean().optional(),
}).partial();

const ModelControlsSchema = z.object({
    text_format: z.enum(['text', 'json_object']).default('text'),
    reasoning_effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('medium'),
    verbosity: z.enum(['low', 'medium', 'high']).default('medium'),
    summary: z.enum(['auto', 'concise', 'detailed']).default('auto'),
    store_logs: z.boolean().default(true),
}).partial();

// ============================================================================
// MAIN BOT CONFIG
// ============================================================================

export const BotConfigSchema = z.object({
    // Core
    config_schema_version: z.number().optional(),
    instructions_prefix: z.string().optional(),
    intro_message: z.string().optional(),
    goodbye_message: z.string().optional(),
    closing_message: z.string().optional(),
    llm_model: z.string().optional(),
    model_controls: ModelControlsSchema.optional(),
    chat_features: ChatFeaturesSchema.optional(),

    // RAG (New)
    rag_config: RagConfigSchema.optional(),

    // Flow Engine
    session_vars: z.record(z.string(), SessionVarSchema).optional(),
    variable_rules: z.record(z.string(), VariableRuleSchema).optional(),
    global_triggers: z.array(FlowStepSchema).optional(),
    flow_steps: z.array(FlowStepSchema).optional(),

    // Simulator Specifics (Legacy/Hybrid)
    scenarios: z.array(JsonValueSchema).optional(), // Keeping loose for now
    bypass_logic: z.record(z.string(), z.string()).optional(),
    generic_interaction: GenericInteractionSchema.optional(),
    image_triggers: z.array(ImageTriggerSchema).optional(),
    flow_rules: z.record(z.string(), JsonValueSchema).optional(), // max_idx, thresholds, etc.

    // Evaluator Specifics
    criteria: EvaluatorCriteriaSchema.optional(),
    evaluation_instruction: z.string().optional(),
    question_bank: QuestionBankSchema.optional(),
    evaluation_config: EvaluationConfigSchema.optional(),
    evaluator_bot_id: z.string().optional(),
    detection_criteria: z.string().optional(), // Legacy or global fallback
    detection_steps: z.array(DetectionStepSchema).optional(),
    detector_options: DetectorOptionsSchema.optional(),

    // Tools & Metadata
    tools: z.array(ToolSchema).optional(),
    metadata: z.record(z.string(), JsonValueSchema).optional(),
}).passthrough();

export type BotConfig = z.infer<typeof BotConfigSchema>;
export type RagConfig = z.infer<typeof RagConfigSchema>;
