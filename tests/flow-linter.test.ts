import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lintFlowConfig, formatCriticalFlowLintError } from '@/lib/flow-linter';
import type { BotConfig } from '@/lib/schemas/bot-config';

function asBotConfig(value: Partial<BotConfig>): BotConfig {
    return value as BotConfig;
}

describe('flow-linter', () => {
    it('detects critical flow issues that should block publish', () => {
        const report = lintFlowConfig(asBotConfig({
            session_vars: {},
            flow_steps: [
                {
                    id: 'step_1',
                    mode: 'SCRIPTED',
                    message: 'hola',
                    triggers: [{ type: 'REGEX', pattern: '([a-z]+', flags: 'i' }],
                    next_step: 'missing_step',
                },
            ],
        }));

        assert.equal(report.critical_count >= 2, true);
        assert.equal(report.issues.some((issue) => issue.code === 'REGEX_INVALID'), true);
        assert.equal(report.issues.some((issue) => issue.code === 'NEXT_STEP_UNKNOWN'), true);
    });

    it('detects warnings without blocking save', () => {
        const report = lintFlowConfig(asBotConfig({
            session_vars: {
                name: { type: 'fixed', value: 'Ana' },
            },
            flow_steps: [
                {
                    id: 'step_warn',
                    mode: 'SCRIPTED',
                    message: 'Hola {name} {unknown_var}',
                    triggers: [{ type: 'REGEX', pattern: '.*hola.*chau.*', flags: 'i' }],
                },
            ],
        }));

        assert.equal(report.warning_count > 0, true);
        assert.equal(report.issues.some((issue) => issue.code === 'TEMPLATE_VAR_UNDEFINED'), true);
        assert.equal(report.issues.some((issue) => issue.code === 'REGEX_RISKY'), true);
    });

    it('formats critical error summary for publish', () => {
        const report = {
            critical_count: 2,
            warning_count: 1,
            issues: [
                { severity: 'critical' as const, code: 'A', message: 'Error A' },
                { severity: 'critical' as const, code: 'B', message: 'Error B' },
                { severity: 'warning' as const, code: 'W', message: 'Warning W' },
            ],
        };

        const message = formatCriticalFlowLintError(report, 'Bloqueado');
        assert.equal(message.includes('Bloqueado'), true);
        assert.equal(message.includes('Error A'), true);
        assert.equal(message.includes('Error B'), true);
        assert.equal(message.includes('Warning W'), false);
    });

    it('lints global triggers and warns about global default interceptors', () => {
        const report = lintFlowConfig(asBotConfig({
            session_vars: {},
            global_triggers: [
                {
                    id: 'global_default',
                    mode: 'SCRIPTED',
                    message: 'global',
                    triggers: [{ type: 'DEFAULT' }],
                    next_step: 'missing_step',
                },
            ],
        }));

        assert.equal(report.issues.some((issue) => issue.code === 'NEXT_STEP_UNKNOWN'), true);
        assert.equal(report.issues.some((issue) => issue.code === 'GLOBAL_DEFAULT_TRIGGER'), true);
    });

    it('blocks publish when regex trigger count exceeds configured limit', () => {
        const previousLimit = process.env.FLOW_MAX_REGEX_TRIGGERS;
        try {
            process.env.FLOW_MAX_REGEX_TRIGGERS = '2';
            const report = lintFlowConfig(asBotConfig({
                session_vars: {},
                flow_steps: [
                    {
                        id: 'r1',
                        mode: 'SCRIPTED',
                        message: 'one',
                        triggers: [{ type: 'REGEX', pattern: 'uno', flags: 'i' }],
                    },
                    {
                        id: 'r2',
                        mode: 'SCRIPTED',
                        message: 'two',
                        triggers: [{ type: 'REGEX', pattern: 'dos', flags: 'i' }],
                    },
                    {
                        id: 'r3',
                        mode: 'SCRIPTED',
                        message: 'three',
                        triggers: [{ type: 'REGEX', pattern: 'tres', flags: 'i' }],
                    },
                ],
            }));

            assert.equal(report.issues.some((issue) => issue.code === 'REGEX_TRIGGER_LIMIT_EXCEEDED'), true);
            assert.equal(report.critical_count > 0, true);
        } finally {
            if (previousLimit === undefined) {
                delete process.env.FLOW_MAX_REGEX_TRIGGERS;
            } else {
                process.env.FLOW_MAX_REGEX_TRIGGERS = previousLimit;
            }
        }
    });
});
