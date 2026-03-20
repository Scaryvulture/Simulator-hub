import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectBotConfigCompatibilityWarningMessages } from '@/lib/bot-config-compat';

describe('bot-config-compat', () => {
    it('flags unknown top-level keys', () => {
        const warnings = collectBotConfigCompatibilityWarningMessages({
            intro_message: 'hola',
            regex_patterns: { default: '.*' },
        });

        assert.ok(warnings.some((warning) => warning.includes('Unknown top-level key "regex_patterns"')));
    });

    it('flags non-object tool parameters', () => {
        const warnings = collectBotConfigCompatibilityWarningMessages({
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'ping',
                        parameters: 'invalid',
                    },
                },
            ],
        });

        assert.ok(warnings.some((warning) => warning.includes('tools.0.function.parameters')));
    });

    it('flags non-primitive flow action value', () => {
        const warnings = collectBotConfigCompatibilityWarningMessages({
            flow_steps: [
                {
                    id: 'step_1',
                    mode: 'SCRIPTED',
                    triggers: [],
                    actions: [
                        {
                            type: 'SET_VAR',
                            var: 'foo',
                            value: { nested: true },
                        },
                    ],
                },
            ],
        });

        assert.ok(warnings.some((warning) => warning.includes('flow_steps.0.actions.0.value')));
    });
});
