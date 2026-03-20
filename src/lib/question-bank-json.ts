import { parseListInput } from './utils';
import type { MarkdownQuestionRow, MarkdownQuestionType, ParsedQuestionBankMarkdown } from './question-bank-markdown';

function normalizeText(input: string): string {
    return (input || '')
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function slugify(input: string): string {
    const normalized = normalizeText(input);
    const slug = normalized
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '');
    return slug || 'general';
}

function pushUniqueTopic(topics: string[], topic: string) {
    const clean = (topic || '').trim();
    if (!clean) return;
    if (!topics.includes(clean)) topics.push(clean);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

function asBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value !== 'string') return undefined;
    const normalized = normalizeText(value);
    if (!normalized) return undefined;
    if (['si', 'sí', 'true', '1', 'yes', 'y', 'obligatoria', 'mandatory'].includes(normalized)) return true;
    if (['no', 'false', '0', 'nop', 'opcional', 'optional'].includes(normalized)) return false;
    return undefined;
}

function asPositiveInt(value: unknown): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return undefined;
    const intVal = Math.trunc(parsed);
    if (intVal <= 0) return undefined;
    return intVal;
}

function normalizeType(value: unknown): MarkdownQuestionType {
    const normalized = normalizeText(asString(value));
    if (
        normalized === 'practica'
        || normalized === 'practico'
        || normalized === 'practico'
        || normalized === 'practical'
        || normalized === 'case'
        || normalized === 'caso'
    ) {
        return 'practica';
    }
    return 'teorica';
}

function normalizeContinueMode(value: unknown): 'ask_confirm' | 'auto_next' | undefined {
    const normalized = normalizeText(asString(value));
    if (!normalized) return undefined;
    if (normalized === 'auto_next' || normalized === 'auto' || normalized === 'automatico' || normalized === 'automatic') {
        return 'auto_next';
    }
    if (normalized === 'ask_confirm' || normalized === 'ask' || normalized === 'confirm') {
        return 'ask_confirm';
    }
    return undefined;
}

function collectStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.flatMap((item) => collectStringList(item)).map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string') return parseListInput(value);
    if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
    const record = asRecord(value);
    if (record) {
        return Object.values(record).flatMap((item) => collectStringList(item));
    }
    return [];
}

function readFirstString(record: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = asString(record[key]);
        if (value) return value;
    }
    return '';
}

function readFirstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = asPositiveInt(record[key]);
        if (typeof value === 'number') return value;
    }
    return undefined;
}

function readFirstBoolean(record: Record<string, unknown>, keys: string[]): boolean | undefined {
    for (const key of keys) {
        const value = asBoolean(record[key]);
        if (typeof value === 'boolean') return value;
    }
    return undefined;
}

function uniqueQuestionId(baseId: string, usedIds: Set<string>): string {
    let candidate = baseId;
    let suffix = 2;
    while (usedIds.has(candidate)) {
        candidate = `${baseId}_${suffix}`;
        suffix += 1;
    }
    usedIds.add(candidate);
    return candidate;
}

export function parseQuestionBankJson(
    rawJson: string,
    options?: { defaultTopic?: string; defaultMandatory?: boolean }
): ParsedQuestionBankMarkdown {
    const defaultTopic = (options?.defaultTopic || 'general').trim() || 'general';
    const defaultMandatory = options?.defaultMandatory ?? false;

    let parsedInput: unknown;
    try {
        parsedInput = JSON.parse(rawJson || '');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'JSON inválido';
        throw new Error(`JSON inválido: ${message}`);
    }

    const warnings: string[] = [];
    const topics: string[] = [];
    const questions: MarkdownQuestionRow[] = [];
    const usedIds = new Set<string>();
    const countersByTopic = new Map<string, { teorica: number; practica: number }>();

    const root = asRecord(parsedInput);
    const sourceQuestions: unknown[] = (() => {
        if (Array.isArray(parsedInput)) return parsedInput;
        if (!root) return [];

        const nestedQuestionBank = asRecord(root.question_bank) || asRecord(root.banco_preguntas) || asRecord(root.bank);
        if (nestedQuestionBank) {
            return Array.isArray(nestedQuestionBank.questions)
                ? nestedQuestionBank.questions
                : Array.isArray(nestedQuestionBank.preguntas)
                    ? nestedQuestionBank.preguntas
                    : [];
        }

        if (Array.isArray(root.questions)) return root.questions;
        if (Array.isArray(root.preguntas)) return root.preguntas;
        if (Array.isArray(root.items)) return root.items;
        return [];
    })();

    const sourceTopics: string[] = (() => {
        if (!root) return [];
        const nestedQuestionBank = asRecord(root.question_bank) || asRecord(root.banco_preguntas) || asRecord(root.bank);
        const topicSource = nestedQuestionBank || root;
        const rawTopics = topicSource.topics ?? topicSource.temas;
        return collectStringList(rawTopics);
    })();

    sourceTopics.forEach((topic) => pushUniqueTopic(topics, topic));
    const fallbackTopic = sourceTopics[0] || defaultTopic;

    const getTopicCounters = (topic: string) => {
        const existing = countersByTopic.get(topic);
        if (existing) return existing;
        const created = { teorica: 0, practica: 0 };
        countersByTopic.set(topic, created);
        return created;
    };

    const buildGeneratedId = (topic: string, type: MarkdownQuestionType) => {
        const counters = getTopicCounters(topic);
        counters[type] += 1;
        const base = `${slugify(topic)}_${type === 'teorica' ? 't' : 'p'}_${counters[type]}`;
        return uniqueQuestionId(base, usedIds);
    };

    sourceQuestions.forEach((item, index) => {
        const record = asRecord(item);
        if (!record) {
            warnings.push(`Entrada ${index + 1}: ignorada porque no es un objeto válido.`);
            return;
        }

        const questionText = readFirstString(record, ['question', 'pregunta', 'prompt', 'texto', 'title']);
        if (!questionText) {
            warnings.push(`Entrada ${index + 1}: ignorada porque no tiene texto de pregunta.`);
            return;
        }

        const topic = readFirstString(record, ['topic', 'tema', 'role', 'rol']) || fallbackTopic;
        pushUniqueTopic(topics, topic);

        const type = normalizeType(record.type ?? record.question_type ?? record.kind);

        const expectedList = collectStringList(
            record.expected_keys
            ?? record.expected
            ?? record.expectedKeys
            ?? record.respuesta_esperada
            ?? record.respuestaEsperada
            ?? record.answer
        );
        const expectedKeys = expectedList.length > 0
            ? expectedList.map((value) => `- ${value}`).join('\n')
            : '';

        const providedId = readFirstString(record, ['id', 'external_id', 'externalId', 'qid']);
        const id = providedId
            ? uniqueQuestionId(slugify(providedId), usedIds)
            : buildGeneratedId(topic, type);

        const continueMode = normalizeContinueMode(record.continue_mode ?? record.continueMode);
        const isMandatory = readFirstBoolean(record, ['is_mandatory', 'mandatory', 'obligatoria']) ?? defaultMandatory;

        const row: MarkdownQuestionRow = {
            id,
            topic,
            type,
            question: questionText,
            expected_keys: expectedKeys,
            media_url: readFirstString(record, ['media_url', 'mediaUrl', 'media', 'url', 'resource_url']) || undefined,
            is_mandatory: isMandatory,
            branch_key: readFirstString(record, ['branch_key', 'branchKey']) || undefined,
            max_attempts: readFirstNumber(record, ['max_attempts', 'maxAttempts']),
            continue_mode: continueMode,
            min_expected_matches: readFirstNumber(record, ['min_expected_matches', 'minExpectedMatches', 'required_count']),
            min_answer_words: readFirstNumber(record, ['min_answer_words', 'minAnswerWords', 'min_words']),
            min_answer_sentences: readFirstNumber(record, ['min_answer_sentences', 'minAnswerSentences', 'min_sentences']),
            retry_incomplete_template: readFirstString(record, ['retry_incomplete_template', 'retryIncompleteTemplate']) || undefined,
            retry_incorrect_template: readFirstString(record, ['retry_incorrect_template', 'retryIncorrectTemplate']) || undefined,
            second_fail_template: readFirstString(record, ['second_fail_template', 'secondFailTemplate']) || undefined,
            correct_feedback_template: readFirstString(record, ['correct_feedback_template', 'correctFeedbackTemplate']) || undefined,
            continue_prompt_template: readFirstString(record, ['continue_prompt_template', 'continuePromptTemplate']) || undefined,
            evaluation_spec: asRecord(record.evaluation_spec ?? record.evaluationSpec) || undefined,
        };

        questions.push(row);
    });

    if (topics.length === 0 && questions.length > 0) {
        pushUniqueTopic(topics, defaultTopic);
    }

    return {
        topics,
        questions,
        warnings,
    };
}
