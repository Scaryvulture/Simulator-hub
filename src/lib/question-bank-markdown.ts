export type MarkdownQuestionType = 'teorica' | 'practica';

export interface MarkdownQuestionRow {
    id: string;
    topic: string;
    type: MarkdownQuestionType;
    question: string;
    expected_keys: string;
    media_url?: string;
    is_mandatory: boolean;
    branch_key?: string;
    max_attempts?: number;
    continue_mode?: 'ask_confirm' | 'auto_next';
    min_expected_matches?: number;
    min_answer_words?: number;
    min_answer_sentences?: number;
    retry_incomplete_template?: string;
    retry_incorrect_template?: string;
    second_fail_template?: string;
    correct_feedback_template?: string;
    continue_prompt_template?: string;
    evaluation_spec?: Record<string, unknown>;
}

export interface ParsedQuestionBankMarkdown {
    topics: string[];
    questions: MarkdownQuestionRow[];
    warnings: string[];
}

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
    if (!topic) return;
    if (!topics.includes(topic)) topics.push(topic);
}

type SectionType = MarkdownQuestionType | null;

interface BuildContext {
    currentTopic: string | null;
    section: SectionType;
    questionTextParts: string[];
    expectedParts: string[];
    inExpected: boolean;
}

export function parseQuestionBankMarkdown(
    markdown: string,
    options?: { defaultTopic?: string; defaultMandatory?: boolean }
): ParsedQuestionBankMarkdown {
    const raw = (markdown || '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n');

    const defaultTopic = (options?.defaultTopic || 'general').trim() || 'general';
    const defaultMandatory = options?.defaultMandatory ?? false;

    const topics: string[] = [];
    const questions: MarkdownQuestionRow[] = [];
    const warnings: string[] = [];
    const usedIds = new Set<string>();
    const countersByTopic = new Map<string, { teorica: number; practica: number }>();

    const state: BuildContext = {
        currentTopic: null,
        section: null,
        questionTextParts: [],
        expectedParts: [],
        inExpected: false,
    };

    const getTopicCounters = (topic: string) => {
        const existing = countersByTopic.get(topic);
        if (existing) return existing;
        const created = { teorica: 0, practica: 0 };
        countersByTopic.set(topic, created);
        return created;
    };

    const buildUniqueId = (topic: string, type: MarkdownQuestionType): string => {
        const counters = getTopicCounters(topic);
        counters[type] += 1;
        const base = `${slugify(topic)}_${type === 'teorica' ? 't' : 'p'}_${counters[type]}`;

        let candidate = base;
        let suffix = 2;
        while (usedIds.has(candidate)) {
            candidate = `${base}_${suffix}`;
            suffix += 1;
        }
        usedIds.add(candidate);
        return candidate;
    };

    const flushQuestion = () => {
        if (!state.section) return;
        const questionText = state.questionTextParts.join(' ').replace(/\s+/g, ' ').trim();
        if (!questionText) return;

        const topic = (state.currentTopic || defaultTopic).trim() || defaultTopic;
        pushUniqueTopic(topics, topic);

        const expectedClean = state.expectedParts
            .map((item) => item.trim())
            .filter(Boolean);

        const expectedKeys = expectedClean.length > 0
            ? expectedClean.map((item) => `- ${item}`).join('\n')
            : '';

        questions.push({
            id: buildUniqueId(topic, state.section),
            topic,
            type: state.section,
            question: questionText,
            expected_keys: expectedKeys,
            is_mandatory: defaultMandatory,
            max_attempts: 2,
            continue_mode: 'ask_confirm',
        });

        state.questionTextParts = [];
        state.expectedParts = [];
        state.inExpected = false;
    };

    const setSection = (nextSection: SectionType) => {
        flushQuestion();
        state.section = nextSection;
        state.inExpected = false;
    };

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const rawLine = lines[lineIndex];
        const line = rawLine.trim();
        const normalized = normalizeText(line);

        if (!line) continue;

        const topicHeaderMatch = line.match(/^##\s+(.+)$/);
        if (topicHeaderMatch) {
            flushQuestion();
            const topicName = (topicHeaderMatch[1] || '').trim();
            if (topicName) {
                state.currentTopic = topicName;
                pushUniqueTopic(topics, topicName);
                state.section = null;
                state.inExpected = false;
            }
            continue;
        }

        if (normalized.startsWith('preguntas teoricas')) {
            setSection('teorica');
            continue;
        }

        if (normalized.startsWith('casos practicos')) {
            setSection('practica');
            continue;
        }

        if (line === '---') {
            flushQuestion();
            continue;
        }

        const numberedQuestionMatch = line.match(/^\d+[\.\)]\s+(.+)$/);
        if (numberedQuestionMatch) {
            flushQuestion();
            if (!state.section) {
                // If the source omitted an explicit section, assume theoretical.
                state.section = 'teorica';
                warnings.push(`Línea ${lineIndex + 1}: se detectó pregunta numerada fuera de sección explícita. Se asumió "teórica".`);
            }
            state.questionTextParts = [(numberedQuestionMatch[1] || '').trim()];
            state.expectedParts = [];
            state.inExpected = false;
            continue;
        }

        if (normalized.startsWith('respuesta esperada')) {
            state.inExpected = true;
            const inline = line.split(':').slice(1).join(':').trim();
            if (inline) {
                const bullet = inline.replace(/^[-*•]\s*/, '').trim();
                if (bullet) state.expectedParts.push(bullet);
            }
            continue;
        }

        if (state.questionTextParts.length > 0) {
            if (state.inExpected) {
                const bulletMatch = line.match(/^[-*•]\s+(.+)$/);
                if (bulletMatch) {
                    state.expectedParts.push((bulletMatch[1] || '').trim());
                } else {
                    state.expectedParts.push(line);
                }
            } else {
                state.questionTextParts.push(line);
            }
        }
    }

    flushQuestion();

    if (topics.length === 0 && questions.length > 0) {
        pushUniqueTopic(topics, defaultTopic);
    }

    return {
        topics,
        questions,
        warnings,
    };
}
