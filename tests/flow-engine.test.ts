import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FlowEngine, type FlowConfig, type FlowState } from '@/lib/flow-engine';

describe('flow-engine', () => {
    it('resolves dependent session variables (random_by)', () => {
        const vars = FlowEngine.initSessionVars({
            mood: { type: 'fixed', value: 'angry' },
            greeting: {
                type: 'random_by',
                source_var: 'mood',
                mapping: {
                    angry: ['No me gusta nada'],
                },
            },
        });

        assert.equal(vars.mood, 'angry');
        assert.equal(vars.greeting, 'No me gusta nada');
    });

    it('matches a scripted step and ends session through actions', async () => {
        const config: FlowConfig = {
            flow_steps: [
                {
                    id: 'bye_step',
                    mode: 'SCRIPTED',
                    message: 'Sesion finalizada',
                    triggers: [{ type: 'REGEX', pattern: 'chau|adios', flags: 'i' }],
                    actions: [{ type: 'END_SESSION' }],
                },
            ],
        };

        const state: FlowState = {
            current_step: 'START',
            completed_steps: [],
            vars: {},
            ended: false,
        };

        const result = await FlowEngine.processMessage(config, 'chau', state, false);

        assert.equal(result.useLLM, false);
        assert.equal(result.response, 'Sesion finalizada');
        assert.equal(result.ended, true);
    });

    it('supports list-based contains condition with CSV values', async () => {
        const config: FlowConfig = {
            flow_steps: [
                {
                    id: 'list_match',
                    mode: 'SCRIPTED',
                    message: 'match',
                    triggers: [
                        {
                            type: 'CONDITION',
                            condition: { var: 'user_message', op: 'contains', value: 'adios,chau,chao' },
                        },
                    ],
                },
            ],
        };

        const result = await FlowEngine.processMessage(
            config,
            'nos vemos, chau',
            { current_step: 'START', completed_steps: [], vars: {}, ended: false },
            false
        );

        assert.equal(result.response, 'match');
        assert.equal(result.useLLM, false);
    });

    it('supports PHRASE_LIST trigger with normalization', async () => {
        const config: FlowConfig = {
            flow_steps: [
                {
                    id: 'phrase_close',
                    mode: 'SCRIPTED',
                    message: 'closing',
                    triggers: [
                        {
                            type: 'PHRASE_LIST',
                            phrase_list: {
                                phrases: ['adios', 'hasta luego'],
                                scope: { mode: 'tail_only', end_window_chars: 100, end_window_tokens: 10 },
                                exact_mode: 'token_boundary',
                                fuzzy: { enabled: true },
                            },
                        },
                    ],
                },
            ],
        };

        const result = await FlowEngine.processMessage(
            config,
            'Bueno, adiós!!',
            { current_step: 'START', completed_steps: [], vars: {}, ended: false },
            false
        );

        assert.equal(result.response, 'closing');
        assert.equal(result.useLLM, false);
    });

    it('evaluates global triggers before normal flow steps', async () => {
        const config: FlowConfig = {
            global_triggers: [
                {
                    id: 'global_reset',
                    mode: 'SCRIPTED',
                    message: 'retomemos foco',
                    triggers: [{ type: 'REGEX', pattern: 'reset|reiniciar', flags: 'i' }],
                },
            ],
            flow_steps: [
                {
                    id: 'regular_step',
                    mode: 'SCRIPTED',
                    message: 'paso normal',
                    triggers: [{ type: 'REGEX', pattern: '.*', flags: 'i' }],
                },
            ],
        };

        const result = await FlowEngine.processMessage(
            config,
            'che, reiniciar por favor',
            { current_step: 'START', completed_steps: [], vars: {}, ended: false },
            false
        );

        assert.equal(result.response, 'retomemos foco');
        assert.equal(result.useLLM, false);
        assert.equal(result.newState.current_step, 'global_reset');
    });

    it('falls back to normal flow steps when no global trigger matches', async () => {
        const config: FlowConfig = {
            global_triggers: [
                {
                    id: 'global_reset',
                    mode: 'SCRIPTED',
                    message: 'retomemos foco',
                    triggers: [{ type: 'REGEX', pattern: 'reset|reiniciar', flags: 'i' }],
                },
            ],
            flow_steps: [
                {
                    id: 'regular_step',
                    mode: 'SCRIPTED',
                    message: 'paso normal',
                    triggers: [{ type: 'REGEX', pattern: 'hola', flags: 'i' }],
                },
            ],
        };

        const result = await FlowEngine.processMessage(
            config,
            'hola',
            { current_step: 'START', completed_steps: [], vars: {}, ended: false },
            false
        );

        assert.equal(result.response, 'paso normal');
        assert.equal(result.useLLM, false);
        assert.equal(result.newState.current_step, 'regular_step');
    });

    it('prioritizes model fallback by fuzzy score inside the same business group', async () => {
        const config: FlowConfig = {
            flow_steps: [
                {
                    id: 'low_score_candidate',
                    mode: 'SCRIPTED',
                    message: 'low',
                    triggers: [
                        {
                            type: 'PHRASE_LIST',
                            phrase_list: {
                                intent_name: 'intent_low',
                                phrases: ['muchas gracias hasta luego craque querido'],
                                scope: { mode: 'tail_only', end_window_chars: 120, end_window_tokens: 18 },
                                fuzzy: { enabled: true, min_similarity: 0.99, gray_zone_min_similarity: 0.65 },
                                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                            },
                        },
                    ],
                },
                {
                    id: 'high_score_candidate',
                    mode: 'SCRIPTED',
                    message: 'high',
                    triggers: [
                        {
                            type: 'PHRASE_LIST',
                            phrase_list: {
                                intent_name: 'intent_high',
                                phrases: ['muchas gracias hasta luego crack querido'],
                                scope: { mode: 'tail_only', end_window_chars: 120, end_window_tokens: 18 },
                                fuzzy: { enabled: true, min_similarity: 0.99, gray_zone_min_similarity: 0.65 },
                                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                            },
                        },
                    ],
                },
            ],
        };

        const fallbackOrder: string[] = [];
        const result = await FlowEngine.processMessage(
            config,
            'muchas gracias hasta lugo crak querido',
            { current_step: 'START', completed_steps: [], vars: {}, ended: false },
            false,
            {
                phrase_model_fallback: async (input) => {
                    fallbackOrder.push(input.intent_name);
                    return { match: false, confidence: 0.95 };
                },
            }
        );

        assert.equal(result.useLLM, true);
        assert.equal(result.response, null);
        assert.deepEqual(fallbackOrder, ['intent_high', 'intent_low']);
    });

    it('respects business/state priority before fuzzy score on model fallback', async () => {
        const config: FlowConfig = {
            flow_steps: [
                {
                    id: 'general_candidate',
                    mode: 'SCRIPTED',
                    message: 'general',
                    triggers: [
                        {
                            type: 'PHRASE_LIST',
                            phrase_list: {
                                intent_name: 'intent_general',
                                phrases: ['muchas gracias hasta luego crack querido'],
                                scope: { mode: 'tail_only', end_window_chars: 120, end_window_tokens: 18 },
                                fuzzy: { enabled: true, min_similarity: 0.99, gray_zone_min_similarity: 0.65 },
                                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                            },
                        },
                    ],
                },
                {
                    id: 'state_priority_candidate',
                    mode: 'SCRIPTED',
                    message: 'state',
                    triggers: [
                        {
                            type: 'CONDITION',
                            condition: { var: 'flow_stage', op: 'equals', value: 'payment' },
                        },
                        {
                            type: 'PHRASE_LIST',
                            phrase_list: {
                                intent_name: 'intent_state',
                                phrases: ['muchas gracias hasta luego crac querido'],
                                scope: { mode: 'tail_only', end_window_chars: 120, end_window_tokens: 18 },
                                fuzzy: { enabled: true, min_similarity: 0.99, gray_zone_min_similarity: 0.65 },
                                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                            },
                        },
                    ],
                },
            ],
        };

        const fallbackOrder: string[] = [];
        const result = await FlowEngine.processMessage(
            config,
            'muchas gracias hasta lugo crak querido',
            { current_step: 'START', completed_steps: [], vars: { flow_stage: 'payment' }, ended: false },
            false,
            {
                phrase_model_fallback: async (input) => {
                    fallbackOrder.push(input.intent_name);
                    return { match: true, confidence: 0.95 };
                },
            }
        );

        assert.equal(result.response, 'state');
        assert.deepEqual(fallbackOrder, ['intent_state']);
    });

    it('applies explicit priority before fuzzy score in ambiguous fallback ordering', async () => {
        const config: FlowConfig = {
            flow_steps: [
                {
                    id: 'higher_priority_lower_score',
                    priority: -2,
                    mode: 'SCRIPTED',
                    message: 'prio',
                    triggers: [
                        {
                            type: 'PHRASE_LIST',
                            priority: -2,
                            phrase_list: {
                                intent_name: 'intent_priority',
                                phrases: ['muchas gracias hasta luego craque querido'],
                                scope: { mode: 'tail_only', end_window_chars: 120, end_window_tokens: 18 },
                                fuzzy: { enabled: true, min_similarity: 0.99, gray_zone_min_similarity: 0.65 },
                                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                            },
                        },
                    ],
                },
                {
                    id: 'lower_priority_higher_score',
                    priority: 0,
                    mode: 'SCRIPTED',
                    message: 'score',
                    triggers: [
                        {
                            type: 'PHRASE_LIST',
                            priority: 0,
                            phrase_list: {
                                intent_name: 'intent_score',
                                phrases: ['muchas gracias hasta luego crack querido'],
                                scope: { mode: 'tail_only', end_window_chars: 120, end_window_tokens: 18 },
                                fuzzy: { enabled: true, min_similarity: 0.99, gray_zone_min_similarity: 0.65 },
                                model_fallback: { mode: 'ambiguous_only', min_confidence: 0.7 },
                            },
                        },
                    ],
                },
            ],
        };

        const fallbackOrder: string[] = [];
        const result = await FlowEngine.processMessage(
            config,
            'muchas gracias hasta lugo crak querido',
            { current_step: 'START', completed_steps: [], vars: {}, ended: false },
            false,
            {
                phrase_model_fallback: async (input) => {
                    fallbackOrder.push(input.intent_name);
                    return { match: false, confidence: 0.95 };
                },
            }
        );

        assert.equal(result.useLLM, true);
        assert.deepEqual(fallbackOrder, ['intent_priority', 'intent_score']);
    });

    it('enforces runtime regex evaluation budget per turn', async () => {
        const previousBudget = process.env.FLOW_RUNTIME_MAX_REGEX_EVALS;
        try {
            process.env.FLOW_RUNTIME_MAX_REGEX_EVALS = '1';

            const config: FlowConfig = {
                flow_steps: [
                    {
                        id: 'first_step',
                        mode: 'SCRIPTED',
                        message: 'first',
                        triggers: [{ type: 'REGEX', pattern: '^never-match-this$', flags: 'i' }],
                    },
                    {
                        id: 'second_step',
                        mode: 'SCRIPTED',
                        message: 'second',
                        triggers: [{ type: 'REGEX', pattern: 'hola', flags: 'i' }],
                    },
                ],
            };

            const result = await FlowEngine.processMessage(
                config,
                'hola',
                { current_step: 'START', completed_steps: [], vars: {}, ended: false },
                false
            );

            assert.equal(result.useLLM, true);
            assert.equal(result.response, null);
        } finally {
            if (previousBudget === undefined) {
                delete process.env.FLOW_RUNTIME_MAX_REGEX_EVALS;
            } else {
                process.env.FLOW_RUNTIME_MAX_REGEX_EVALS = previousBudget;
            }
        }
    });
});
