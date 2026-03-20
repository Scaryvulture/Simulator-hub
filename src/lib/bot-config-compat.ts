type BotConfigCompatibilityWarning = {
    code: string;
    path: string;
    message: string;
};

const KNOWN_TOP_LEVEL_KEYS = new Set([
    'config_schema_version',
    'instructions_prefix',
    'intro_message',
    'goodbye_message',
    'closing_message',
    'llm_model',
    'model_controls',
    'chat_features',
    'rag_config',
    'session_vars',
    'variable_rules',
    'global_triggers',
    'flow_steps',
    'scenarios',
    'bypass_logic',
    'generic_interaction',
    'image_triggers',
    'flow_rules',
    'criteria',
    'evaluation_instruction',
    'question_bank',
    'evaluation_config',
    'evaluator_bot_id',
    'detection_criteria',
    'detection_steps',
    'detector_options',
    'tools',
    'metadata',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
    return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function collectBotConfigCompatibilityWarnings(rawConfig: unknown): BotConfigCompatibilityWarning[] {
    const warnings: BotConfigCompatibilityWarning[] = [];
    const record = asRecord(rawConfig);
    if (!record) return warnings;

    const unknownKeys = Object.keys(record).filter((key) => !KNOWN_TOP_LEVEL_KEYS.has(key));
    for (const key of unknownKeys) {
        warnings.push({
            code: 'unknown_top_level_key',
            path: key,
            message: `Unknown top-level key "${key}". Consider moving it into metadata/extensions.`,
        });
    }

    const tools = Array.isArray(record.tools) ? record.tools : [];
    for (let index = 0; index < tools.length; index += 1) {
        const tool = asRecord(tools[index]);
        const fn = asRecord(tool?.function);
        if (!fn) continue;
        if (fn.parameters !== undefined && !asRecord(fn.parameters)) {
            warnings.push({
                code: 'tool_parameters_not_object',
                path: `tools.${index}.function.parameters`,
                message: 'Tool function parameters should be a JSON object.',
            });
        }
    }

    const flowSteps = Array.isArray(record.flow_steps) ? record.flow_steps : [];
    for (let stepIndex = 0; stepIndex < flowSteps.length; stepIndex += 1) {
        const step = asRecord(flowSteps[stepIndex]);
        const actions = Array.isArray(step?.actions) ? step.actions : [];
        for (let actionIndex = 0; actionIndex < actions.length; actionIndex += 1) {
            const action = asRecord(actions[actionIndex]);
            if (!action || !Object.prototype.hasOwnProperty.call(action, 'value')) continue;
            if (!isPrimitive(action.value)) {
                warnings.push({
                    code: 'flow_action_non_primitive_value',
                    path: `flow_steps.${stepIndex}.actions.${actionIndex}.value`,
                    message: 'Flow action value should be primitive to keep runtime deterministic.',
                });
            }
        }
    }

    const sessionVars = asRecord(record.session_vars);
    if (sessionVars) {
        for (const [varName, value] of Object.entries(sessionVars)) {
            if (Array.isArray(value)) {
                if (!value.every((item) => isPrimitive(item))) {
                    warnings.push({
                        code: 'session_var_array_non_primitive',
                        path: `session_vars.${varName}`,
                        message: 'Session variable arrays should contain primitive values only.',
                    });
                }
                continue;
            }
            if (!isPrimitive(value) && !asRecord(value)) {
                warnings.push({
                    code: 'session_var_unsupported_type',
                    path: `session_vars.${varName}`,
                    message: 'Session variable uses unsupported value type.',
                });
            }
        }
    }

    return warnings;
}

export function collectBotConfigCompatibilityWarningMessages(rawConfig: unknown): string[] {
    return collectBotConfigCompatibilityWarnings(rawConfig).map((warning) => `${warning.path}: ${warning.message}`);
}
