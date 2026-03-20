import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    createInitialExaminerState,
    evaluateQuestionDeterministic,
    needsTopicSelection,
    processExaminerTurn,
    type ExaminerState,
} from '@/lib/examiner-engine';
import type { BotConfig } from '@/lib/schemas/bot-config';

function buildExaminerConfig(overrides: Partial<BotConfig> = {}): BotConfig {
    return {
        question_bank: {
            topics: ['electricista', 'soldador'],
            questions: [
                {
                    id: 'q-electricidad',
                    topic: 'electricista',
                    type: 'teorica',
                    question: '¿Qué controles eléctricos previos verificás en tablero?',
                    expected_keys: 'bloqueo y etiquetado, ausencia de tension, epp dielectrico',
                    is_mandatory: true,
                },
                {
                    id: 'q-soldadura',
                    topic: 'soldador',
                    type: 'teorica',
                    question: '¿Qué verificás antes de soldar en caliente?',
                    expected_keys: 'permiso en caliente, extintor, vigia de fuego',
                    is_mandatory: true,
                },
            ],
        },
        evaluation_config: {
            teoricas: { mandatory: 1, random: 0 },
            practicas: { count: 0, by_topic: true },
            selection: {
                mandatory_count: 1,
                random_count: 0,
                by_topic: true,
                order_mode: 'mandatory_first',
                semantic_mode: 'ambiguous_only',
            },
            mode: 'standard',
            sequence: [],
        },
        ...overrides,
    };
}

describe('examiner-engine', () => {
    it('ends immediately if user declines to start', async () => {
        const config = buildExaminerConfig();
        const state = createInitialExaminerState();

        const first = await processExaminerTurn(config, state, 'no');
        assert.equal(first.ended, true);
        assert.equal(first.newState.phase, 'completed');
        assert.match(first.response.toLowerCase(), /gracias por tu tiempo/);
    });

    it('selects topic-specific questions when by_topic is enabled', async () => {
        const config = buildExaminerConfig();
        const state: ExaminerState = createInitialExaminerState();

        const start = await processExaminerTurn(config, state, 'sí');
        assert.equal(start.newState.phase, 'await_topic');

        const detect = await processExaminerTurn(config, start.newState, 'voy a trabajar como electricista');
        assert.equal(detect.newState.phase, 'await_topic_confirm');
        assert.match(detect.response.toLowerCase(), /electricista/);

        const confirm = await processExaminerTurn(config, detect.newState, 'si');
        assert.equal(confirm.newState.phase, 'await_answer');
        assert.equal(confirm.newState.selected_question_ids.length, 1);
        assert.equal(confirm.newState.selected_question_ids[0], 'q-electricidad');
        assert.match(confirm.response.toLowerCase(), /controles eléctricos previos/);
    });

    it('fails closed when a selected topic has no questions', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: ['electricista', 'soldador'],
                questions: [
                    {
                        id: 'q-only-soldador',
                        topic: 'soldador',
                        type: 'teorica',
                        question: '¿Qué verificás antes de soldar?',
                        expected_keys: 'permiso, extintor',
                        is_mandatory: true,
                    },
                ],
            },
        });
        const state = createInitialExaminerState();

        const start = await processExaminerTurn(config, state, 'sí');
        assert.equal(start.newState.phase, 'await_topic');

        const detect = await processExaminerTurn(config, start.newState, 'trabajo como electricista');
        assert.equal(detect.newState.phase, 'await_topic_confirm');
        assert.equal(detect.newState.pending_topic, 'electricista');

        const confirm = await processExaminerTurn(config, detect.newState, 'sí');
        assert.equal(confirm.ended, true);
        assert.equal(confirm.newState.phase, 'completed');
        assert.match(confirm.response.toLowerCase(), /no encontr[ée] preguntas para ese tema/);
    });

    it('skips topic selection when topic router is disabled', async () => {
        const config = buildExaminerConfig({
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: true },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: true,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                topic_config: {
                    enabled: false,
                    enforce_single_task: false,
                    allow_topic_correction: true,
                    use_router_llm: true,
                    skip_confirmation: false,
                },
                mode: 'standard',
                sequence: [],
            },
        });

        assert.equal(needsTopicSelection(config), false);

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');
    });

    it('enforces single-task guard before topic detection when configured', async () => {
        const config = buildExaminerConfig({
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: true },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: true,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                topic_config: {
                    enabled: true,
                    enforce_single_task: true,
                    allow_topic_correction: true,
                    single_task_template: 'ELEGÍ UNA TAREA',
                    use_router_llm: false,
                    skip_confirmation: false,
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_topic');

        const guarded = await processExaminerTurn(
            config,
            start.newState,
            'Primero voy a soldar y después voy a amolar.'
        );
        assert.equal(guarded.newState.phase, 'await_topic');
        assert.match(guarded.response, /ELEGÍ UNA TAREA/);
    });

    it('allows direct topic correction at confirmation step', async () => {
        const config = buildExaminerConfig({
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: true },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: true,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                topic_config: {
                    enabled: true,
                    enforce_single_task: false,
                    allow_topic_correction: true,
                    use_router_llm: false,
                    skip_confirmation: false,
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_topic');

        const firstTopic = await processExaminerTurn(config, start.newState, 'electricista');
        assert.equal(firstTopic.newState.phase, 'await_topic_confirm');
        assert.equal(firstTopic.newState.pending_topic, 'electricista');

        const corrected = await processExaminerTurn(config, firstTopic.newState, 'No, soy soldador');
        assert.equal(corrected.newState.phase, 'await_topic_confirm');
        assert.equal(corrected.newState.pending_topic, 'soldador');
        assert.match(corrected.response.toLowerCase(), /soldador/);
    });

    it('detects topic aliases configured in topic router', async () => {
        const config = buildExaminerConfig({
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: true },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: true,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                topic_config: {
                    enabled: true,
                    enforce_single_task: false,
                    allow_topic_correction: true,
                    use_router_llm: false,
                    skip_confirmation: false,
                    topic_aliases: {
                        soldador: ['oxigenista'],
                    },
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_topic');

        const detected = await processExaminerTurn(config, start.newState, 'Voy a trabajar como oxigenista');
        assert.equal(detected.newState.phase, 'await_topic_confirm');
        assert.equal(detected.newState.pending_topic, 'soldador');
    });

    it('does not request a third attempt after second failed answer', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-epp',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Mencioná al menos dos EPP para trabajo en altura.',
                        expected_keys: 'casco, arnes, guantes',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');

        const firstFail = await processExaminerTurn(config, start.newState, 'casco');
        assert.equal(firstFail.newState.phase, 'await_answer');
        assert.equal(firstFail.newState.current_attempt, 1);
        assert.match(firstFail.response.toLowerCase(), /incompleta/);

        const secondFail = await processExaminerTurn(config, firstFail.newState, 'no sé');
        assert.equal(secondFail.newState.phase, 'await_post_close_intent');
        assert.equal(secondFail.ended, false);
        assert.match(secondFail.response.toLowerCase(), /respuesta esperada|puntos/);

        const close = await processExaminerTurn(config, secondFail.newState, 'no');
        assert.equal(close.newState.phase, 'completed');
        assert.equal(close.ended, true);
    });

    it('applies minimum expected count parsed from question text', () => {
        const result = evaluateQuestionDeterministic(
            {
                id: 'q1',
                topic: 'general',
                type: 'teorica',
                question: 'Para iniciar, mencioná al menos dos controles de seguridad.',
                expected_keys: 'permiso vigente, epp completo, analisis de riesgos',
                is_mandatory: true,
            },
            'Verifico permiso vigente y el EPP completo.'
        );

        assert.equal(result.required_count, 2);
        assert.equal(result.status, 'correct');
    });

    it('parses expected_keys from bullets/new lines/semicolon formats', () => {
        const result = evaluateQuestionDeterministic(
            {
                id: 'q-flex-keys',
                topic: 'general',
                type: 'teorica',
                question: 'Antes de iniciar, mencioná al menos dos controles.',
                expected_keys: '- permiso vigente\n- análisis de riesgo; EPP completo',
                is_mandatory: true,
            },
            'Primero verifico permiso vigente y también el análisis de riesgo.'
        );

        assert.equal(result.required_count, 2);
        assert.equal(result.total_expected, 3);
        assert.equal(result.status, 'correct');
    });

    it('marks answer as incomplete when it does not meet minimum words', () => {
        const result = evaluateQuestionDeterministic(
            {
                id: 'q-min-words',
                topic: 'general',
                type: 'teorica',
                question: 'Mencioná al menos dos controles críticos previos.',
                expected_keys: 'permiso vigente, epp completo, analisis de riesgos',
                is_mandatory: true,
                min_answer_words: 10,
            },
            'Permiso vigente, EPP completo y análisis de riesgos.'
        );

        assert.equal(result.status, 'incomplete');
        assert.equal(result.failed_min_requirements, true);
        assert.equal(result.min_answer_words, 10);
        assert.ok(result.answer_word_count < 10);
    });

    it('does not call semantic evaluator when deterministic minimums fail', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-min-gate',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Decí al menos una medida clave.',
                        expected_keys: 'permiso vigente',
                        is_mandatory: true,
                        min_answer_words: 5,
                        retry_incomplete_template: 'INCOMPLETA ({answer_word_count}/{min_answer_words})',
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'always',
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');

        let called = 0;
        const firstFail = await processExaminerTurn(config, start.newState, 'permiso vigente', {
            semanticMode: 'always',
            semanticEvaluator: async () => {
                called += 1;
                return {
                    status: 'correct',
                    feedback: 'Semánticamente correcto.',
                };
            },
        });

        assert.equal(called, 0);
        assert.equal(firstFail.newState.phase, 'await_answer');
        assert.equal(firstFail.newState.current_attempt, 1);
        assert.match(firstFail.response, /INCOMPLETA \(\d+\/5\)/);
    });

    it('uses semantic evaluator on every failed answer when semantic_mode is always', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-epp',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Mencioná al menos dos EPP para trabajo en altura.',
                        expected_keys: 'casco, arnes, guantes',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'always',
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');

        let called = 0;
        const turn = await processExaminerTurn(config, start.newState, 'casco', {
            semanticMode: 'always',
            semanticEvaluator: async () => {
                called += 1;
                return {
                    status: 'correct',
                    feedback: 'Gracias por tu respuesta. Es correcta en este contexto.',
                    confidence: 0.9,
                };
            },
        });

        assert.equal(called, 1);
        assert.equal(turn.newState.phase, 'await_post_close_intent');
        assert.equal(turn.ended, false);
        assert.match(turn.response.toLowerCase(), /correcta|duda/);
    });

    it('renders scripted retry and second-fail templates from question policy', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-scripted',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Mencioná al menos dos controles críticos.',
                        expected_keys: 'permiso vigente, epp completo, analisis de riesgos',
                        is_mandatory: true,
                        max_attempts: 2,
                        retry_incomplete_template: 'INCOMPLETA: intentá de nuevo. Pregunta: {question}',
                        retry_incorrect_template: 'INCORRECTA: intentá de nuevo. Pregunta: {question}',
                        second_fail_template: 'SEGUNDO_FALLO: puntos esperados:\n{expected_keys_bullets}',
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');

        const firstFail = await processExaminerTurn(config, start.newState, 'permiso vigente');
        assert.equal(firstFail.newState.current_attempt, 1);
        assert.match(firstFail.response, /INCOMPLETA: intentá de nuevo/);

        const secondFail = await processExaminerTurn(config, firstFail.newState, 'nada');
        assert.equal(secondFail.ended, false);
        assert.match(secondFail.response, /SEGUNDO_FALLO:/);
    });

    it('auto-continues to next question when continue_mode is auto_next', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-1',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Decí un EPP obligatorio.',
                        expected_keys: 'casco',
                        is_mandatory: true,
                        continue_mode: 'auto_next',
                        correct_feedback_template: 'OK_1',
                    },
                    {
                        id: 'q-2',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Decí otro EPP obligatorio.',
                        expected_keys: 'arnes',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 2, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 2,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');

        const firstCorrect = await processExaminerTurn(config, start.newState, 'casco');
        assert.equal(firstCorrect.newState.phase, 'await_answer');
        assert.equal(firstCorrect.newState.current_index, 1);
        assert.match(firstCorrect.response, /OK_1/);
        assert.match(firstCorrect.response.toLowerCase(), /decí otro epp obligatorio/);
    });

    it('handles post-close doubts with llm responder and then closes', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-1',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Decí un EPP obligatorio.',
                        expected_keys: 'casco',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                mode: 'standard',
                sequence: [],
            },
            closing_message: 'CIERRE_FINAL',
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        const done = await processExaminerTurn(config, start.newState, 'casco');
        assert.equal(done.newState.phase, 'await_post_close_intent');
        assert.equal(done.ended, false);

        const askDoubt = await processExaminerTurn(config, done.newState, 'sí');
        assert.equal(askDoubt.newState.phase, 'await_post_close_question');
        assert.equal(askDoubt.ended, false);

        const reply = await processExaminerTurn(config, askDoubt.newState, '¿Cuál es el EPP mínimo?', {
            postCloseResponder: async () => ({
                text: 'Debés usar casco, anteojos, guantes y calzado de seguridad.',
                model: 'gpt-4o-mini',
                tokens_in: 10,
                tokens_out: 5,
                cost_usd: 0.001,
            }),
        });

        assert.equal(reply.newState.phase, 'completed');
        assert.equal(reply.ended, true);
        assert.match(reply.response, /Debés usar casco/);
        assert.match(reply.response, /CIERRE_FINAL/);
        assert.equal(reply.postCloseUsage?.model, 'gpt-4o-mini');
    });

    it('uses configurable post-close prompts from evaluation config', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-1',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Decí un EPP obligatorio.',
                        expected_keys: 'casco',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 1, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 1,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                closing_config: {
                    post_exam_doubt_prompt_template: 'CLOSE_STEP_1',
                    post_exam_doubt_followup_template: 'CLOSE_STEP_1B',
                },
                mode: 'standard',
                sequence: [],
            },
            closing_message: 'CLOSE_STEP_2',
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        const done = await processExaminerTurn(config, start.newState, 'casco');
        assert.match(done.response, /CLOSE_STEP_1/);

        const affirmative = await processExaminerTurn(config, done.newState, 'sí');
        assert.equal(affirmative.newState.phase, 'await_post_close_question');
        assert.match(affirmative.response, /CLOSE_STEP_1B/);

        const close = await processExaminerTurn(config, affirmative.newState, 'No tengo dudas');
        assert.equal(close.newState.phase, 'completed');
        assert.match(close.response, /CLOSE_STEP_2/);
    });

    it('injects interstitial message after configured question number', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-1',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Pregunta 1',
                        expected_keys: 'a',
                        is_mandatory: true,
                        continue_mode: 'auto_next',
                    },
                    {
                        id: 'q-2',
                        topic: 'general',
                        type: 'practica',
                        question: 'Pregunta 2',
                        expected_keys: 'b',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 2, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 2,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                interstitial_messages: [
                    {
                        id: 'break_1',
                        after_question_number: 1,
                        message: 'TRANSICION_A_CASOS',
                        enabled: true,
                    },
                ],
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        assert.equal(start.newState.phase, 'await_answer');

        const first = await processExaminerTurn(config, start.newState, 'a');
        assert.equal(first.newState.phase, 'await_answer');
        assert.match(first.response, /TRANSICION_A_CASOS/);
        assert.match(first.response, /Pregunta 2/);
    });

    it('waits for confirmation when interstitial wait_for_user is enabled', async () => {
        const config = buildExaminerConfig({
            question_bank: {
                topics: [],
                questions: [
                    {
                        id: 'q-1',
                        topic: 'general',
                        type: 'teorica',
                        question: 'Pregunta teórica 1',
                        expected_keys: 'a',
                        is_mandatory: true,
                        continue_mode: 'auto_next',
                    },
                    {
                        id: 'q-2',
                        topic: 'general',
                        type: 'practica',
                        question: 'Caso práctico 2',
                        expected_keys: 'b',
                        is_mandatory: true,
                    },
                ],
            },
            evaluation_config: {
                teoricas: { mandatory: 2, random: 0 },
                practicas: { count: 0, by_topic: false },
                selection: {
                    mandatory_count: 2,
                    random_count: 0,
                    by_topic: false,
                    order_mode: 'mandatory_first',
                    semantic_mode: 'ambiguous_only',
                },
                interstitial_messages: [
                    {
                        id: 'break_wait',
                        after_question_number: 1,
                        message: 'MENSAJE_DESCANSO',
                        wait_for_user: true,
                        continue_prompt: '¿Continuamos con el caso?',
                        enabled: true,
                    },
                ],
                mode: 'standard',
                sequence: [],
            },
        });

        const start = await processExaminerTurn(config, createInitialExaminerState(), 'sí');
        const first = await processExaminerTurn(config, start.newState, 'a');

        assert.equal(first.newState.phase, 'await_interstitial_continue');
        assert.match(first.response, /MENSAJE_DESCANSO/);
        assert.match(first.response, /¿Continuamos con el caso\?/);

        const continueFlow = await processExaminerTurn(config, first.newState, 'sí');
        assert.equal(continueFlow.newState.phase, 'await_answer');
        assert.equal(continueFlow.newState.current_index, 1);
        assert.match(continueFlow.response, /Caso práctico 2/);
    });
});
