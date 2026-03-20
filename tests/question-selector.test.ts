import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionSelector, type Question } from '@/lib/question-selector';

test('formatQuestion renders image markdown for image media urls', () => {
    const question: Question = {
        id: 'q1',
        topic: 'seguridad',
        type: 'teorica',
        question: '¿Qué ves?',
        expected_keys: 'casco,guantes',
        media_url: 'https://example.com/foto.png',
        is_mandatory: true,
    };

    const rendered = QuestionSelector.formatQuestion(question);
    assert.match(rendered, /!\[\]\(https:\/\/example\.com\/foto\.png\)/);
});

test('formatQuestion renders markdown image block for drive links', () => {
    const question: Question = {
        id: 'q2',
        topic: 'seguridad',
        type: 'practica',
        question: 'Identificá el riesgo.',
        expected_keys: 'riesgo,practica segura',
        media_url: 'https://drive.google.com/file/d/abc123/view',
        is_mandatory: false,
    };

    const rendered = QuestionSelector.formatQuestion(question);
    assert.match(rendered, /!\[\]\(https:\/\/drive\.google\.com\/file\/d\/abc123\/view\)/);
});

test('sequence random_topic supports "all" and keeps branch filtering', () => {
    const bank = {
        topics: ['fijo', 'movil'],
        questions: [
            {
                id: 'q-fijo',
                topic: 'fijo',
                type: 'teorica' as const,
                question: 'Q fijo',
                expected_keys: 'a',
                is_mandatory: false,
            },
            {
                id: 'q-movil',
                topic: 'movil',
                type: 'teorica' as const,
                question: 'Q movil',
                expected_keys: 'b',
                is_mandatory: false,
            },
            {
                id: 'q-bloqueada-branch',
                topic: 'general',
                type: 'teorica' as const,
                question: 'Q branch',
                expected_keys: 'c',
                is_mandatory: false,
                branch_key: 'movil',
            },
        ] satisfies Question[],
    };

    const evalConfig = {
        teoricas: { mandatory: 0, random: 0 },
        practicas: { count: 0, by_topic: false },
        mode: 'sequence' as const,
        sequence: [
            {
                type: 'random_topic' as const,
                topic: 'all',
                count: 10,
            },
        ],
    };

    const selected = QuestionSelector.selectQuestions(bank, evalConfig, 'fijo', []);
    const ids = selected.all.map((q) => q.id);

    assert.equal(ids.includes('q-fijo'), true);
    assert.equal(ids.includes('q-movil'), true);
    assert.equal(ids.includes('q-bloqueada-branch'), false);
});

test('standard mode supports question_type_order grouping', () => {
    const bank = {
        topics: ['general'],
        questions: [
            {
                id: 'q_t1',
                topic: 'general',
                type: 'teorica' as const,
                question: 'Teórica 1',
                expected_keys: 'a',
                is_mandatory: false,
            },
            {
                id: 'q_p1',
                topic: 'general',
                type: 'practica' as const,
                question: 'Práctica 1',
                expected_keys: 'b',
                is_mandatory: false,
            },
            {
                id: 'q_t2',
                topic: 'general',
                type: 'teorica' as const,
                question: 'Teórica 2',
                expected_keys: 'c',
                is_mandatory: false,
            },
        ] satisfies Question[],
    };

    const evalConfig = {
        teoricas: { mandatory: 0, random: 0 },
        practicas: { count: 0, by_topic: false },
        selection: {
            mandatory_count: 0,
            random_count: 3,
            by_topic: false,
            order_mode: 'mixed' as const,
            question_type_order: 'teorica_first' as const,
        },
    };

    const selected = QuestionSelector.selectQuestions(bank, evalConfig, null, []);
    assert.equal(selected.all.length, 3);

    const firstPracticalIndex = selected.all.findIndex((q) => q.type === 'practica');
    const lastTheoreticalIndex = selected.all.map((q) => q.type).lastIndexOf('teorica');
    assert.ok(firstPracticalIndex > lastTheoreticalIndex);
});
