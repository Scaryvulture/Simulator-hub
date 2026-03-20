import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseQuestionBankMarkdown } from '@/lib/question-bank-markdown';

describe('question-bank-markdown', () => {
    it('parses topics, theoretical questions and practical cases by role heading', () => {
        const source = `
# Banco

## Oficial Soldador
Preguntas teóricas
1. ¿Qué control aplicás antes de soldar?
   Respuesta esperada:
   - Permiso vigente
   - Análisis de riesgo
2. ¿Qué EPP usás?
   Respuesta esperada:
   - Pantalla facial
   - Guantes

Casos prácticos
1. Ves chispas cerca de inflamables. ¿Qué harías puntualmente?
   Respuesta esperada:
   - Detener tarea
   - Delimitar APyC
`;

        const parsed = parseQuestionBankMarkdown(source);

        assert.deepEqual(parsed.topics, ['Oficial Soldador']);
        assert.equal(parsed.questions.length, 3);

        const teoricas = parsed.questions.filter((q) => q.type === 'teorica');
        const practicas = parsed.questions.filter((q) => q.type === 'practica');

        assert.equal(teoricas.length, 2);
        assert.equal(practicas.length, 1);
        assert.equal(practicas[0].topic, 'Oficial Soldador');
        assert.match(teoricas[0].expected_keys, /Permiso vigente/);
        assert.match(practicas[0].expected_keys, /Delimitar APyC/);
    });

    it('creates deterministic ids and falls back to general topic', () => {
        const source = `
Preguntas teóricas
1) Decí dos controles previos.
   Respuesta esperada:
   - Permiso
   - EPP
`;

        const parsed = parseQuestionBankMarkdown(source);
        assert.deepEqual(parsed.topics, ['general']);
        assert.equal(parsed.questions.length, 1);
        assert.equal(parsed.questions[0].id, 'general_t_1');
    });

    it('collects warning when numbered question appears outside explicit section', () => {
        const source = `
## Topic A
1. Pregunta sin sección
Respuesta esperada:
- A
`;

        const parsed = parseQuestionBankMarkdown(source);
        assert.equal(parsed.questions.length, 1);
        assert.equal(parsed.questions[0].type, 'teorica');
        assert.equal(parsed.warnings.length, 1);
        assert.match(parsed.warnings[0], /se asumió "teórica"/i);
    });
});
