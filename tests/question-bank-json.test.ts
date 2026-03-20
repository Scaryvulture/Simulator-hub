import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseQuestionBankJson } from '@/lib/question-bank-json';

describe('question-bank-json', () => {
    it('parses topics and questions from preguntas/temas payload', () => {
        const source = JSON.stringify({
            temas: ['Oficial Soldador', 'Operador de Amoladora'],
            preguntas: [
                {
                    id: 'Q-1',
                    tema: 'Oficial Soldador',
                    type: 'teorica',
                    pregunta: '¿Qué verificás antes de soldar?',
                    respuesta_esperada: ['Permiso vigente', 'Análisis de riesgo'],
                    obligatoria: true,
                },
                {
                    tema: 'Operador de Amoladora',
                    type: 'practica',
                    pregunta: 'Ves proyección de partículas. ¿Qué hacés?',
                    expected_keys: 'detener tarea, delimitar APyC',
                    mandatory: false,
                },
            ],
        });

        const parsed = parseQuestionBankJson(source);
        assert.deepEqual(parsed.topics, ['Oficial Soldador', 'Operador de Amoladora']);
        assert.equal(parsed.questions.length, 2);
        assert.equal(parsed.questions[0].is_mandatory, true);
        assert.equal(parsed.questions[1].type, 'practica');
        assert.match(parsed.questions[0].expected_keys, /Permiso vigente/);
        assert.match(parsed.questions[1].expected_keys, /delimitar APyC/i);
    });

    it('supports nested question_bank payload and preserves optional policy fields', () => {
        const source = JSON.stringify({
            question_bank: {
                topics: ['Andamios'],
                questions: [
                    {
                        question: 'Mencioná controles previos.',
                        expectedKeys: ['Permiso', 'EPP', 'ATS'],
                        minAnswerWords: 20,
                        minAnswerSentences: 2,
                        maxAttempts: 2,
                        continueMode: 'auto_next',
                    },
                ],
            },
        });

        const parsed = parseQuestionBankJson(source);
        assert.equal(parsed.questions.length, 1);
        assert.equal(parsed.questions[0].id, 'andamios_t_1');
        assert.equal(parsed.questions[0].min_answer_words, 20);
        assert.equal(parsed.questions[0].min_answer_sentences, 2);
        assert.equal(parsed.questions[0].continue_mode, 'auto_next');
    });

    it('throws clear error on invalid json', () => {
        assert.throws(() => parseQuestionBankJson('{invalid-json'), /JSON inválido/i);
    });
});
