import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRuntimeSignalsSummary } from '@/lib/evaluation-runtime-signals';

describe('evaluation-runtime-signals', () => {
    it('summarizes deterministic runtime state from metadata', () => {
        const summary = buildRuntimeSignalsSummary({
            session_vars: {
                cliente_confirmado: true,
                prioridad: 'alta',
                intentos: 0,
                ignorar: { nested: true },
            },
            flow_state: {
                current_step: 'verificacion_final',
                ended: false,
                completed_steps: ['inicio', 'validacion'],
                vars: {
                    pregunta_1_ok: true,
                    pregunta_2_ok: false,
                    score_total: 8,
                },
            },
            examiner_state: {
                phase: 'await_answer',
                topic: 'logistica',
                pending_topic: null,
                current_index: 2,
                current_attempt: 1,
                last_result: 'correct',
                selected_question_ids: ['q1', 'q2', 'q3'],
                shown_interstitial_ids: ['mid-1'],
            },
        });

        assert.equal(summary.has_runtime_signals, true);
        assert.deepEqual(summary.session_vars, {
            cliente_confirmado: true,
            prioridad: 'alta',
            intentos: 0,
        });
        assert.deepEqual(summary.flow_state, {
            current_step: 'verificacion_final',
            ended: false,
            completed_steps: ['inicio', 'validacion'],
            vars: {
                pregunta_1_ok: true,
                pregunta_2_ok: false,
                score_total: 8,
            },
        });
        assert.deepEqual(summary.examiner_state, {
            phase: 'await_answer',
            topic: 'logistica',
            pending_topic: null,
            current_index: 2,
            current_attempt: 1,
            last_result: 'correct',
            selected_questions: 3,
            shown_interstitial_ids: 1,
        });
        assert.deepEqual(summary.activated_variables, ['cliente_confirmado', 'pregunta_1_ok', 'prioridad', 'score_total']);
    });

    it('returns an empty summary when metadata has no runtime state', () => {
        const summary = buildRuntimeSignalsSummary({
            foo: 'bar',
            arr: [1, 2, 3],
        });

        assert.equal(summary.has_runtime_signals, false);
        assert.deepEqual(summary.session_vars, {});
        assert.equal(summary.flow_state, undefined);
        assert.equal(summary.examiner_state, undefined);
        assert.deepEqual(summary.activated_variables, []);
    });
});
