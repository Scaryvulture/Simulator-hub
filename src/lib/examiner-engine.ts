import type { BotConfig } from './schemas/bot-config';
import { QuestionSelector, type EvaluationConfig, type Question, type QuestionBankConfig } from './question-selector';

export type ExaminerPhase =
    | 'await_start'
    | 'await_topic'
    | 'await_topic_confirm'
    | 'await_answer'
    | 'await_continue'
    | 'await_interstitial_continue'
    | 'await_post_close_intent'
    | 'await_post_close_question'
    | 'completed';

export interface ExaminerState {
    phase: ExaminerPhase;
    intro_attempts: number;
    topic: string | null;
    pending_topic: string | null;
    selected_question_ids: string[];
    current_index: number;
    current_attempt: number;
    last_result: 'correct' | 'incomplete' | 'incorrect' | null;
    shown_interstitial_ids: string[];
}

export interface DeterministicExamEvaluation {
    status: 'correct' | 'incomplete' | 'incorrect';
    matched_keys: string[];
    missing_keys: string[];
    expected_keys: string[];
    required_count: number;
    matched_count: number;
    total_expected: number;
    ambiguous: boolean;
    answer_word_count: number;
    answer_sentence_count: number;
    min_answer_words: number;
    min_answer_sentences: number;
    failed_min_requirements: boolean;
    min_requirement_reasons: string[];
}

export interface ExaminerSemanticEvaluation {
    status: 'correct' | 'incomplete' | 'incorrect';
    feedback?: string;
    missing_keys?: string[];
    confidence?: number;
    model?: string;
    tokens_in?: number;
    tokens_out?: number;
    cost_usd?: number;
}

export type ExaminerSemanticEvaluator = (input: {
    question: Question;
    user_answer: string;
    deterministic: DeterministicExamEvaluation;
    expected_keys: string[];
    topic: string | null;
    attempt: number;
}) => Promise<ExaminerSemanticEvaluation | null>;

export interface ExaminerTurnResult {
    response: string;
    newState: ExaminerState;
    ended: boolean;
    semantic?: ExaminerSemanticEvaluation;
    postCloseUsage?: {
        model?: string;
        tokens_in?: number;
        tokens_out?: number;
        cost_usd?: number;
    };
}

const DEFAULT_INTRO = [
    'Hola, te doy la bienvenida al examen guiado.',
    'Voy a hacerte preguntas teóricas y prácticas en orden.',
    'Responde con claridad y, si hace falta, te voy a pedir que amplíes.',
    '¿Comenzamos?',
].join('\n\n');

const DEFAULT_GOODBYE = 'Gracias por tu tiempo. Cuando quieras retomamos este entrenamiento. ¡Hasta luego!';
const DEFAULT_CLOSE = '¡Felicitaciones! Completaste el examen. Presiona el botón "Evaluar" para finalizar.';
const DEFAULT_POST_CLOSE_ASK = 'Hemos terminado las preguntas. ¿Tenés alguna duda?';
const DEFAULT_POST_CLOSE_ASK_DETAIL = 'Perfecto. Contame tu duda y te respondo.';
const AUTO_NEXT_BLOCK_SEPARATOR = '---';

const AFFIRMATIVES = [
    'si', 'sí', 'sii', 'sip', 'sipi', 'ok', 'okay', 'okey', 'dale', 'vamos', 'va', 'claro', 'obvio', 'listo', 'de una', 'por supuesto', '👍', 'perfecto',
];

const NEGATIVES = [
    'no', 'nop', 'negativo', 'para', 'detener', 'cancelar', 'salir', 'nope', 'nada',
];

const NUMBER_WORDS: Record<string, number> = {
    uno: 1,
    una: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
};

function normalizeText(input: string): string {
    return (input || '')
        .toLocaleLowerCase('es')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(input: string): string[] {
    return normalizeText(input).split(' ').filter(Boolean);
}

function formatTopicTemplate(template: string | undefined, topic: string | null, fallback: string): string {
    const safeTopic = topic || '';
    const source = (template || '').trim();
    if (!source) return fallback;
    return source.replace(/\{topic\}/g, safeTopic);
}

function looksLikeMultipleTasks(input: string): boolean {
    const normalized = normalizeText(input);
    if (!normalized) return false;

    const explicitMultiTaskSignals = [
        /\bprimero\b.*\b(despues|después|luego)\b/,
        /\bademas\b/,
        /\by tambien\b/,
        /\bpor un lado\b.*\bpor otro\b/,
        /\by luego\b/,
    ];

    if (!explicitMultiTaskSignals.some((pattern) => pattern.test(normalized))) {
        return false;
    }

    const actionMarkers = (normalized.match(/\b(voy a|tengo que|debo|realizar|hacer|ejecutar)\b/g) || []).length;
    if (actionMarkers >= 2) return true;

    const infinitiveVerbs = (normalized.match(/\b[\p{L}]{3,}(ar|er|ir)\b/gu) || []).length;
    return infinitiveVerbs >= 2;
}

export function hasExaminerQuestionBank(config: BotConfig): boolean {
    return Boolean(config.question_bank?.questions && config.question_bank.questions.length > 0);
}

export function getExaminerIntroMessage(config: BotConfig): string {
    if (typeof config.intro_message === 'string' && config.intro_message.trim()) {
        return config.intro_message.trim();
    }
    return DEFAULT_INTRO;
}

export function getGoodbyeMessage(config: BotConfig): string {
    if (typeof config.goodbye_message === 'string' && config.goodbye_message.trim()) {
        return config.goodbye_message.trim();
    }
    return DEFAULT_GOODBYE;
}

export function getClosingMessage(config: BotConfig): string {
    if (typeof config.closing_message === 'string' && config.closing_message.trim()) {
        return config.closing_message.trim();
    }
    return DEFAULT_CLOSE;
}

function getPostCloseAskMessage(config: BotConfig): string {
    const configured = config.evaluation_config?.closing_config?.post_exam_doubt_prompt_template;
    if (typeof configured === 'string' && configured.trim()) {
        return configured.trim();
    }
    return DEFAULT_POST_CLOSE_ASK;
}

function getPostCloseAskDetailMessage(config: BotConfig): string {
    const configured = config.evaluation_config?.closing_config?.post_exam_doubt_followup_template;
    if (typeof configured === 'string' && configured.trim()) {
        return configured.trim();
    }
    return DEFAULT_POST_CLOSE_ASK_DETAIL;
}

export function createInitialExaminerState(): ExaminerState {
    return {
        phase: 'await_start',
        intro_attempts: 0,
        topic: null,
        pending_topic: null,
        selected_question_ids: [],
        current_index: 0,
        current_attempt: 0,
        last_result: null,
        shown_interstitial_ids: [],
    };
}

export function ensureExaminerState(rawState: unknown): ExaminerState {
    if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
        return createInitialExaminerState();
    }

    const value = rawState as Partial<ExaminerState>;
    const validPhase: ExaminerPhase[] = [
        'await_start',
        'await_topic',
        'await_topic_confirm',
        'await_answer',
        'await_continue',
        'await_interstitial_continue',
        'await_post_close_intent',
        'await_post_close_question',
        'completed',
    ];

    return {
        phase: validPhase.includes(value.phase as ExaminerPhase) ? value.phase as ExaminerPhase : 'await_start',
        intro_attempts: Number.isFinite(value.intro_attempts) ? Number(value.intro_attempts) : 0,
        topic: typeof value.topic === 'string' ? value.topic : null,
        pending_topic: typeof value.pending_topic === 'string' ? value.pending_topic : null,
        selected_question_ids: Array.isArray(value.selected_question_ids)
            ? value.selected_question_ids.filter((id): id is string => typeof id === 'string')
            : [],
        current_index: Number.isFinite(value.current_index) ? Number(value.current_index) : 0,
        current_attempt: Number.isFinite(value.current_attempt) ? Number(value.current_attempt) : 0,
        last_result: value.last_result === 'correct' || value.last_result === 'incomplete' || value.last_result === 'incorrect'
            ? value.last_result
            : null,
        shown_interstitial_ids: Array.isArray(value.shown_interstitial_ids)
            ? value.shown_interstitial_ids.filter((id): id is string => typeof id === 'string')
            : [],
    };
}

export function isAffirmative(message: string): boolean {
    const normalized = normalizeText(message);
    if (!normalized) return false;
    const padded = ` ${normalized} `;
    return AFFIRMATIVES.some((item) => {
        const normalizedItem = normalizeText(item);
        if (!normalizedItem) return false;
        return normalized === normalizedItem || padded.includes(` ${normalizedItem} `);
    });
}

export function isNegative(message: string): boolean {
    const normalized = normalizeText(message);
    if (!normalized) return false;
    const padded = ` ${normalized} `;
    return NEGATIVES.some((item) => {
        const normalizedItem = normalizeText(item);
        if (!normalizedItem) return false;
        return normalized === normalizedItem || padded.includes(` ${normalizedItem} `);
    });
}

export function needsTopicSelection(config: BotConfig): boolean {
    const topicConfigEnabled = config.evaluation_config?.topic_config?.enabled !== false;
    const byTopic = Boolean(config.evaluation_config?.selection?.by_topic);
    const hasTopics = Array.isArray(config.question_bank?.topics) && config.question_bank.topics.length > 0;
    return topicConfigEnabled && byTopic && hasTopics;
}

function getQuestionBank(config: BotConfig): QuestionBankConfig {
    return {
        topics: Array.isArray(config.question_bank?.topics) ? config.question_bank?.topics || [] : [],
        questions: Array.isArray(config.question_bank?.questions)
            ? (config.question_bank?.questions as Question[])
            : [],
    };
}

function getEvaluationConfig(config: BotConfig): EvaluationConfig {
    const selection = config.evaluation_config?.selection;
    return {
        teoricas: {
            mandatory: Number(config.evaluation_config?.teoricas?.mandatory || 0),
            random: Number(config.evaluation_config?.teoricas?.random || 0),
        },
        practicas: {
            count: Number(config.evaluation_config?.practicas?.count || 0),
            by_topic: Boolean(config.evaluation_config?.practicas?.by_topic),
        },
        selection: selection ? {
            mandatory_count: Number(selection.mandatory_count || 0),
            random_count: Number(selection.random_count || 0),
            by_topic: Boolean(selection.by_topic),
            order_mode: selection.order_mode || 'mandatory_first',
            question_type_order: selection.question_type_order || 'any',
            show_question_counter: selection.show_question_counter === true,
            semantic_mode: selection.semantic_mode || 'ambiguous_only',
        } : {
            mandatory_count: Number(config.evaluation_config?.teoricas?.mandatory || 0),
            random_count: Number(config.evaluation_config?.teoricas?.random || 0),
            by_topic: Boolean(config.evaluation_config?.practicas?.by_topic),
            order_mode: 'mandatory_first',
            question_type_order: 'any',
            show_question_counter: false,
            semantic_mode: 'ambiguous_only',
        },
    };
}

export function detectTopic(config: BotConfig, message: string): string | null {
    const bank = getQuestionBank(config);
    if (!Array.isArray(bank.topics) || bank.topics.length === 0) return null;

    const direct = QuestionSelector.detectTopic(message, bank.topics);
    if (direct) return direct;

    const aliasMap = config.evaluation_config?.topic_config?.topic_aliases;
    if (aliasMap && typeof aliasMap === 'object' && !Array.isArray(aliasMap)) {
        const normalizedMessage = normalizeText(message);
        const paddedMessage = ` ${normalizedMessage} `;

        for (const topic of bank.topics) {
            const aliases = aliasMap[topic];
            if (!Array.isArray(aliases)) continue;

            for (const alias of aliases) {
                const normalizedAlias = normalizeText(alias || '');
                if (!normalizedAlias) continue;

                if (
                    normalizedMessage === normalizedAlias
                    || paddedMessage.includes(` ${normalizedAlias} `)
                    || normalizedMessage.includes(normalizedAlias)
                ) {
                    return topic;
                }
            }
        }
    }

    return null;
}

export function selectExamQuestions(config: BotConfig, topic: string | null): Question[] {
    const bank = getQuestionBank(config);
    const evalConfig = getEvaluationConfig(config);

    const selected = QuestionSelector.selectQuestions(bank, evalConfig, topic || null, []);
    return selected.all;
}

function shouldShowQuestionCounter(config: BotConfig): boolean {
    return config.evaluation_config?.selection?.show_question_counter === true;
}

export function buildQuestionPrompt(question: Question, index: number, total: number, config?: BotConfig): string {
    const base = QuestionSelector.formatQuestion(question);
    if (config && shouldShowQuestionCounter(config)) {
        return `Pregunta ${index + 1}/${total}\n\n${base}`;
    }
    return base;
}

export function findQuestionById(config: BotConfig, id: string): Question | null {
    const bank = getQuestionBank(config);
    return bank.questions.find((q) => q.id === id) || null;
}

export function parseExpectedKeys(question: Question): string[] {
    const source = (question.expected_keys || '').replace(/\r\n/g, '\n').trim();
    if (!source) return [];

    const lines = source
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const hasBullets = lines.some((line) => /^\s*(?:[-*•]\s+|\d+[\)\].:-]\s*)/.test(line));
    const hasLineBreaks = source.includes('\n');

    if (hasBullets || hasLineBreaks) {
        return lines
            .map((line) => line.replace(/^\s*(?:[-*•]\s+|\d+[\)\].:-]\s*)/, '').trim())
            .flatMap((line) => line.split(/\s*;\s*/g))
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return source
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function parseExpectedKeyGroups(question: Question): string[][] {
    return parseExpectedKeys(question)
        .map((item) => item.split('|').map((v) => v.trim()).filter(Boolean))
        .filter((group) => group.length > 0);
}

function extractRequiredCountFromQuestion(question: Question, totalExpected: number): number {
    const normalizedQuestion = normalizeText(question.question || '');
    const numeric = normalizedQuestion.match(/(?:al menos|minimo|minima|minimas|minimos)\s+(\d{1,2})/i);
    if (numeric && numeric[1]) {
        const parsed = parseInt(numeric[1], 10);
        if (!Number.isNaN(parsed) && parsed > 0) return Math.min(parsed, Math.max(totalExpected, 1));
    }

    const word = normalizedQuestion.match(/(?:al menos|minimo|minima|minimas|minimos)\s+(uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)/i);
    if (word && word[1]) {
        const mapped = NUMBER_WORDS[word[1]];
        if (mapped) return Math.min(mapped, Math.max(totalExpected, 1));
    }

    if (totalExpected <= 2) return totalExpected;
    return Math.max(1, Math.ceil(totalExpected * 0.6));
}

function getRequiredCountOverride(question: Question): number | null {
    const direct = Number(question.min_expected_matches);
    if (Number.isFinite(direct) && direct > 0) return Math.trunc(direct);

    const evalSpec = question.evaluation_spec;
    if (evalSpec && typeof evalSpec === 'object' && !Array.isArray(evalSpec)) {
        const raw = (evalSpec as Record<string, unknown>).min_expected_matches
            ?? (evalSpec as Record<string, unknown>).required_count;
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed > 0) return Math.trunc(parsed);
    }

    return null;
}

function containsPhrase(answerNorm: string, phraseNorm: string): boolean {
    if (!answerNorm || !phraseNorm) return false;
    const paddedAnswer = ` ${answerNorm} `;
    const paddedPhrase = ` ${phraseNorm} `;

    if (paddedAnswer.includes(paddedPhrase)) return true;
    // Fallback less strict for long phrases that might vary with small words.
    if (phraseNorm.length >= 14) {
        return answerNorm.includes(phraseNorm);
    }
    return false;
}

function countAnswerWords(answer: string): number {
    return tokenize(answer).length;
}

function countAnswerSentences(answer: string): number {
    const trimmed = (answer || '').trim();
    if (!trimmed) return 0;

    const segments = trimmed
        .split(/[.!?]+(?:\s+|$)|\n+/g)
        .map((part) => part.trim())
        .filter(Boolean);

    if (segments.length > 0) return segments.length;
    return 1;
}

function readPositiveInteger(raw: unknown): number | null {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return null;
    const value = Math.trunc(parsed);
    return value > 0 ? value : null;
}

function extractMinAnswerWords(question: Question): number {
    const direct = readPositiveInteger(question.min_answer_words);
    if (direct) return Math.min(200, direct);

    const evalSpec = question.evaluation_spec;
    if (evalSpec && typeof evalSpec === 'object' && !Array.isArray(evalSpec)) {
        const fromSpec = readPositiveInteger(
            (evalSpec as Record<string, unknown>).min_answer_words
            ?? (evalSpec as Record<string, unknown>).min_words
        );
        if (fromSpec) return Math.min(200, fromSpec);
    }

    return 0;
}

function extractMinAnswerSentences(question: Question): number {
    const direct = readPositiveInteger(question.min_answer_sentences);
    if (direct) return Math.min(20, direct);

    const evalSpec = question.evaluation_spec;
    if (evalSpec && typeof evalSpec === 'object' && !Array.isArray(evalSpec)) {
        const fromSpec = readPositiveInteger(
            (evalSpec as Record<string, unknown>).min_answer_sentences
            ?? (evalSpec as Record<string, unknown>).min_sentences
        );
        if (fromSpec) return Math.min(20, fromSpec);
    }

    return 0;
}

export function evaluateQuestionDeterministic(question: Question, answer: string): DeterministicExamEvaluation {
    const answerNorm = normalizeText(answer);
    const answerWordCount = countAnswerWords(answer);
    const answerSentenceCount = countAnswerSentences(answer);
    const minAnswerWords = extractMinAnswerWords(question);
    const minAnswerSentences = extractMinAnswerSentences(question);
    const minRequirementReasons: string[] = [];
    if (minAnswerWords > 0 && answerWordCount < minAnswerWords) {
        minRequirementReasons.push(`mínimo ${minAnswerWords} palabras (actual: ${answerWordCount})`);
    }
    if (minAnswerSentences > 0 && answerSentenceCount < minAnswerSentences) {
        minRequirementReasons.push(`mínimo ${minAnswerSentences} oraciones (actual: ${answerSentenceCount})`);
    }
    const failedMinRequirements = minRequirementReasons.length > 0;
    const groups = parseExpectedKeyGroups(question);
    const expectedKeys = groups.map((group) => group.join(' | '));

    if (groups.length === 0) {
        const status: DeterministicExamEvaluation['status'] = failedMinRequirements ? 'incomplete' : 'incorrect';
        return {
            status,
            matched_keys: [],
            missing_keys: [],
            expected_keys: [],
            required_count: 1,
            matched_count: 0,
            total_expected: 0,
            ambiguous: tokenize(answer).length >= 6,
            answer_word_count: answerWordCount,
            answer_sentence_count: answerSentenceCount,
            min_answer_words: minAnswerWords,
            min_answer_sentences: minAnswerSentences,
            failed_min_requirements: failedMinRequirements,
            min_requirement_reasons: minRequirementReasons,
        };
    }

    const matched: string[] = [];
    const missing: string[] = [];

    for (const group of groups) {
        const groupMatched = group.some((rawOption) => {
            const optionNorm = normalizeText(rawOption);
            return containsPhrase(answerNorm, optionNorm);
        });

        if (groupMatched) {
            matched.push(group.join(' | '));
        } else {
            missing.push(group.join(' | '));
        }
    }

    const requiredCountBase = extractRequiredCountFromQuestion(question, groups.length);
    const requiredOverride = getRequiredCountOverride(question);
    const requiredCount = Math.min(groups.length, Math.max(1, requiredOverride ?? requiredCountBase));
    const matchedCount = matched.length;

    let status: DeterministicExamEvaluation['status'];
    if (matchedCount >= requiredCount) {
        status = 'correct';
    } else if (matchedCount > 0) {
        status = 'incomplete';
    } else {
        status = 'incorrect';
    }

    if (failedMinRequirements) {
        status = 'incomplete';
    }

    const ambiguous = status !== 'correct' && tokenize(answer).length >= 6;

    return {
        status,
        matched_keys: matched,
        missing_keys: missing,
        expected_keys: expectedKeys,
        required_count: requiredCount,
        matched_count: matchedCount,
        total_expected: groups.length,
        ambiguous,
        answer_word_count: answerWordCount,
        answer_sentence_count: answerSentenceCount,
        min_answer_words: minAnswerWords,
        min_answer_sentences: minAnswerSentences,
        failed_min_requirements: failedMinRequirements,
        min_requirement_reasons: minRequirementReasons,
    };
}

function buildExpectedKeysBullets(keys: string[]): string {
    if (keys.length === 0) {
        return '- No hay una lista de claves definida para esta pregunta.';
    }
    return keys.map((key) => `- ${key}`).join('\n');
}

function formatTemplate(template: string | undefined, context: Record<string, string>): string {
    const source = (template || '').trim();
    if (!source) return '';
    return source.replace(/\{(\w+)\}/g, (_, key: string) => context[key] ?? '');
}

function getQuestionPolicy(question: Question): {
    maxAttempts: number;
    continueMode: 'ask_confirm' | 'auto_next';
    retryIncompleteTemplate: string;
    retryIncorrectTemplate: string;
    secondFailTemplate: string;
    correctFeedbackTemplate: string;
    continuePromptTemplate: string;
} {
    const maxAttemptsRaw = Number(question.max_attempts);
    const maxAttempts = Number.isFinite(maxAttemptsRaw)
        ? Math.min(5, Math.max(1, Math.trunc(maxAttemptsRaw)))
        : 2;

    return {
        maxAttempts,
        continueMode: question.continue_mode === 'auto_next' ? 'auto_next' : 'ask_confirm',
        retryIncompleteTemplate: (question.retry_incomplete_template || '').trim(),
        retryIncorrectTemplate: (question.retry_incorrect_template || '').trim(),
        secondFailTemplate: (question.second_fail_template || '').trim(),
        correctFeedbackTemplate: (question.correct_feedback_template || '').trim(),
        continuePromptTemplate: (question.continue_prompt_template || '').trim(),
    };
}

function buildTemplateContext(question: Question, deterministic: DeterministicExamEvaluation, semantic?: ExaminerSemanticEvaluation): Record<string, string> {
    const semanticMissing = Array.isArray(semantic?.missing_keys) ? semantic?.missing_keys as string[] : [];
    const lengthMissing = deterministic.min_requirement_reasons;
    const missingBase = semanticMissing.length > 0 ? semanticMissing : deterministic.missing_keys;
    const missingForBullets = [...missingBase, ...lengthMissing];

    return {
        question: question.question || '',
        expected_keys: deterministic.expected_keys.join(', '),
        expected_keys_bullets: buildExpectedKeysBullets(deterministic.expected_keys),
        missing_keys: [...deterministic.missing_keys, ...lengthMissing].join(', '),
        missing_keys_bullets: buildExpectedKeysBullets(missingForBullets),
        matched_keys: deterministic.matched_keys.join(', '),
        matched_count: String(deterministic.matched_count),
        required_count: String(deterministic.required_count),
        answer_word_count: String(deterministic.answer_word_count),
        answer_sentence_count: String(deterministic.answer_sentence_count),
        min_answer_words: String(deterministic.min_answer_words),
        min_answer_sentences: String(deterministic.min_answer_sentences),
        semantic_feedback: (semantic?.feedback || '').trim(),
    };
}

function buildRetryMessage(
    status: 'incomplete' | 'incorrect',
    question: Question,
    context: Record<string, string>,
    policy: ReturnType<typeof getQuestionPolicy>
): string {
    const custom = status === 'incomplete'
        ? formatTemplate(policy.retryIncompleteTemplate, context)
        : formatTemplate(policy.retryIncorrectTemplate, context);
    if (custom) return custom;

    const label = status === 'incomplete' ? 'incompleta' : 'incorrecta';
    return `Lamentablemente tu respuesta es ${label}. Inténtalo de nuevo ${question.question}`;
}

function buildSecondFailMessage(
    deterministic: DeterministicExamEvaluation,
    semantic: ExaminerSemanticEvaluation | undefined,
    context: Record<string, string>,
    policy: ReturnType<typeof getQuestionPolicy>
): string {
    const custom = formatTemplate(policy.secondFailTemplate, context);
    if (custom) return custom;

    const expectedText = buildExpectedKeysBullets(deterministic.expected_keys);
    return semantic?.feedback?.trim()
        || `Gracias por tu respuesta. La respuesta esperada incluye estos puntos:\n${expectedText}`;
}

function buildCorrectMessage(
    semantic: ExaminerSemanticEvaluation | undefined,
    context: Record<string, string>,
    policy: ReturnType<typeof getQuestionPolicy>
): string {
    const custom = formatTemplate(policy.correctFeedbackTemplate, context);
    if (custom) return custom;
    return semantic?.feedback?.trim() || 'Gracias por tu respuesta. Es correcta y cubre los puntos esperados.';
}

function buildContinuePrompt(policy: ReturnType<typeof getQuestionPolicy>): string {
    return policy.continuePromptTemplate || '¿Seguimos con la próxima pregunta?';
}

type InterstitialMessageConfig = {
    id: string;
    after_question_number: number;
    message: string;
    topics?: string[];
    enabled?: boolean;
    wait_for_user?: boolean;
    continue_prompt?: string;
};

function getInterstitialMessages(config: BotConfig): InterstitialMessageConfig[] {
    const raw = config.evaluation_config?.interstitial_messages;
    if (!Array.isArray(raw)) return [];
    const parsed: InterstitialMessageConfig[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === 'string' ? record.id.trim() : '';
        const message = typeof record.message === 'string' ? record.message.trim() : '';
        const after = Number(record.after_question_number);
        const enabled = record.enabled !== false;
        const wait_for_user = record.wait_for_user === true;
        const continue_prompt = typeof record.continue_prompt === 'string'
            ? record.continue_prompt.trim()
            : '';
        const topics = Array.isArray(record.topics)
            ? record.topics.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
            : undefined;
        if (!id || !message || !Number.isFinite(after) || after <= 0) continue;
        parsed.push({
            id,
            after_question_number: Math.trunc(after),
            message,
            topics,
            enabled,
            wait_for_user,
            continue_prompt: continue_prompt || undefined,
        });
    }
    return parsed;
}

function getPendingInterstitialMessage(
    config: BotConfig,
    state: ExaminerState,
    afterQuestionNumber: number
): InterstitialMessageConfig | null {
    const all = getInterstitialMessages(config);
    if (all.length === 0) return null;

    const currentTopic = normalizeText(state.topic || '');
    return all.find((item) => {
        if (item.enabled === false) return false;
        if (item.after_question_number !== afterQuestionNumber) return false;
        if (state.shown_interstitial_ids.includes(item.id)) return false;
        if (!Array.isArray(item.topics) || item.topics.length === 0) return true;
        if (!currentTopic) return false;
        const allowed = item.topics.map((t) => normalizeText(t)).filter(Boolean);
        return allowed.includes(currentTopic);
    }) || null;
}

function appendInterstitialBeforeQuestion(
    config: BotConfig,
    state: ExaminerState,
    nextQuestion: Question,
    nextIndex: number,
    total: number,
    afterQuestionNumber: number
): {
    text: string;
    shownId?: string;
    waitForUser: boolean;
} {
    const interstitial = getPendingInterstitialMessage(config, state, afterQuestionNumber);
    const questionText = buildQuestionPrompt(nextQuestion, nextIndex, total, config);
    if (!interstitial) {
        return { text: questionText, waitForUser: false };
    }

    if (interstitial.wait_for_user) {
        const continuePrompt = (interstitial.continue_prompt || '¿Continuamos?').trim();
        return {
            text: continuePrompt
                ? `${interstitial.message}\n\n${continuePrompt}`
                : interstitial.message,
            shownId: interstitial.id,
            waitForUser: true,
        };
    }

    return {
        text: `${interstitial.message}\n\n${AUTO_NEXT_BLOCK_SEPARATOR}\n\n${questionText}`,
        shownId: interstitial.id,
        waitForUser: false,
    };
}

function composeFeedbackWithNext(feedbackText: string, nextText: string): string {
    return `${feedbackText}\n\n${AUTO_NEXT_BLOCK_SEPARATOR}\n\n${nextText}`;
}

function isOnlyAffirmative(message: string): boolean {
    const normalized = normalizeText(message);
    if (!normalized) return false;
    return AFFIRMATIVES.some((item) => normalizeText(item) === normalized);
}

async function resolvePostCloseReply(
    config: BotConfig,
    state: ExaminerState,
    userQuestion: string,
    options?: {
        postCloseResponder?: (input: { user_question: string; topic: string | null }) => Promise<{
            text: string;
            model?: string;
            tokens_in?: number;
            tokens_out?: number;
            cost_usd?: number;
        } | null>;
    }
): Promise<{
    response: string;
    newState: ExaminerState;
    ended: boolean;
    postCloseUsage?: {
        model?: string;
        tokens_in?: number;
        tokens_out?: number;
        cost_usd?: number;
    };
}> {
    const fallbackClose = getClosingMessage(config);
    const cleanQuestion = (userQuestion || '').trim();

    if (!cleanQuestion) {
        return {
            response: getPostCloseAskDetailMessage(config),
            newState: { ...state, phase: 'await_post_close_question' },
            ended: false,
        };
    }

    const reply = options?.postCloseResponder
        ? await options.postCloseResponder({ user_question: cleanQuestion, topic: state.topic })
        : null;

    const replyText = (reply?.text || '').trim()
        || 'Gracias por tu consulta. Para mantener el foco del entrenamiento, retomemos con el cierre.';

    return {
        response: `${replyText}\n\n${fallbackClose}`,
        newState: { ...state, phase: 'completed' },
        ended: true,
        postCloseUsage: reply
            ? {
                model: reply.model,
                tokens_in: reply.tokens_in,
                tokens_out: reply.tokens_out,
                cost_usd: reply.cost_usd,
            }
            : undefined,
    };
}

export async function processExaminerTurn(
    config: BotConfig,
    rawState: unknown,
    userMessage: string,
    options?: {
        semanticEvaluator?: ExaminerSemanticEvaluator;
        questionLimit?: number;
        semanticMode?: 'ambiguous_only' | 'always';
        topicClassifier?: (text: string) => Promise<string | null>;
        intentChecker?: (text: string) => Promise<'CONTINUE' | 'STOP' | 'UNKNOWN'>;
        postCloseResponder?: (input: { user_question: string; topic: string | null }) => Promise<{
            text: string;
            model?: string;
            tokens_in?: number;
            tokens_out?: number;
            cost_usd?: number;
        } | null>;
    }
): Promise<ExaminerTurnResult> {
    const state = ensureExaminerState(rawState);
    const trimmed = (userMessage || '').trim();

    // Helper to check intent with Regex + LLM fallback
    const checkUserIntent = async (text: string): Promise<'CONTINUE' | 'STOP' | 'UNKNOWN'> => {
        if (isAffirmative(text)) return 'CONTINUE';
        if (isNegative(text)) return 'STOP';

        if (options?.intentChecker) {
            return await options.intentChecker(text);
        }
        return 'UNKNOWN';
    };

    if (state.phase === 'completed') {
        return {
            response: getClosingMessage(config),
            newState: { ...state, phase: 'completed' },
            ended: true,
        };
    }

    if (state.phase === 'await_start') {
        const intent = await checkUserIntent(trimmed);

        if (intent === 'CONTINUE') {
            if (needsTopicSelection(config)) {
                // Use configured template or fallback
                const askMsg = config.evaluation_config?.topic_config?.ask_template || 'Para empezar, decime qué tarea o tema vas a trabajar hoy. Con eso selecciono el banco correcto.';

                return {
                    response: askMsg,
                    newState: {
                        ...state,
                        phase: 'await_topic',
                        intro_attempts: 0,
                    },
                    ended: false,
                };
            }

            const selected = selectExamQuestions(config, null);
            const capped = options?.questionLimit ? selected.slice(0, options.questionLimit) : selected;
            if (capped.length === 0) {
                return {
                    response: 'No hay preguntas configuradas para este examen. Revisá el banco de preguntas.',
                    newState: { ...state, phase: 'completed' },
                    ended: true,
                };
            }

            const first = capped[0];
            return {
                response: buildQuestionPrompt(first, 0, capped.length, config),
                newState: {
                    ...state,
                    phase: 'await_answer',
                    selected_question_ids: capped.map((q) => q.id),
                    current_index: 0,
                    current_attempt: 0,
                    last_result: null,
                    shown_interstitial_ids: [],
                },
                ended: false,
            };
        }

        if (intent === 'STOP') {
            return {
                response: getGoodbyeMessage(config),
                newState: { ...state, phase: 'completed' },
                ended: true,
            };
        }

        if (state.intro_attempts <= 0) {
            return {
                response: '¿Comenzamos?',
                newState: {
                    ...state,
                    intro_attempts: 1,
                },
                ended: false,
            };
        }

        return {
            response: getGoodbyeMessage(config),
            newState: { ...state, phase: 'completed' },
            ended: true,
        };
    }

    if (state.phase === 'await_topic') {
        const topicConfig = config.evaluation_config?.topic_config;

        if (topicConfig?.enforce_single_task && looksLikeMultipleTasks(trimmed)) {
            return {
                response: topicConfig.single_task_template?.trim()
                    || 'Para esta evaluación necesito que elijas UNA sola tarea. ¿Con cuál querés seguir ahora?',
                newState: state,
                ended: false,
            };
        }

        let topic = detectTopic(config, trimmed);

        // Try semantic classification if exact match failed and classifier is provided
        if (!topic && options?.topicClassifier && config.evaluation_config?.topic_config?.use_router_llm !== false) {
            topic = await options.topicClassifier(trimmed);
        }

        if (!topic) {
            return {
                response: topicConfig?.no_topic_template?.trim()
                    || 'No pude identificar bien el tema. ¿Podés especificar la tarea y dónde se realiza?',
                newState: state,
                ended: false,
            };
        }

        // Check if we should skip confirmation
        const skipConfirmation = config.evaluation_config?.topic_config?.skip_confirmation;

        if (skipConfirmation) {
            // Proceed directly to questions
            const selected = selectExamQuestions(config, topic || null);
            const capped = options?.questionLimit ? selected.slice(0, options.questionLimit) : selected;

            if (capped.length === 0) {
                return {
                    response: 'No encontré preguntas para ese tema.',
                    newState: { ...state, phase: 'completed', topic },
                    ended: true,
                };
            }

            // Inject Topic Feedback if exists
            let response = buildQuestionPrompt(capped[0], 0, capped.length, config);
            const feedback = config.evaluation_config?.topic_config?.topic_feedbacks?.[topic];
            if (feedback) {
                response = composeFeedbackWithNext(feedback, response);
            }

            return {
                response,
                newState: {
                    ...state,
                    phase: 'await_answer',
                    topic: topic,
                    pending_topic: null,
                    selected_question_ids: capped.map((q) => q.id),
                    current_index: 0,
                    current_attempt: 0,
                    last_result: null,
                    shown_interstitial_ids: [],
                },
                ended: false,
            };
        }

        return {
            response: formatTopicTemplate(
                topicConfig?.confirm_template,
                topic,
                `Entendí que el tema es "${topic}". ¿Es correcto?`
            ),
            newState: {
                ...state,
                phase: 'await_topic_confirm',
                pending_topic: topic,
            },
            ended: false,
        };
    }

    if (state.phase === 'await_topic_confirm') {
        const topicConfig = config.evaluation_config?.topic_config;
        const allowTopicCorrection = topicConfig?.allow_topic_correction !== false;

        if (allowTopicCorrection) {
            let correctedTopic = detectTopic(config, trimmed);
            if (!correctedTopic && options?.topicClassifier && topicConfig?.use_router_llm !== false) {
                correctedTopic = await options.topicClassifier(trimmed);
            }

            if (correctedTopic && correctedTopic !== state.pending_topic) {
                return {
                    response: formatTopicTemplate(
                        topicConfig?.confirm_template,
                        correctedTopic,
                        `Entendí que el tema es "${correctedTopic}". ¿Es correcto?`
                    ),
                    newState: {
                        ...state,
                        pending_topic: correctedTopic,
                    },
                    ended: false,
                };
            }
        }

        const intent = await checkUserIntent(trimmed);

        if (intent === 'CONTINUE') {
            const topic = state.pending_topic;
            const selected = selectExamQuestions(config, topic || null);
            const capped = options?.questionLimit ? selected.slice(0, options.questionLimit) : selected;

            if (capped.length === 0) {
                return {
                    response: 'No encontré preguntas para ese tema. Revisá la configuración del banco.',
                    newState: { ...state, phase: 'completed', topic: topic || null, pending_topic: null },
                    ended: true,
                };
            }

            // Inject Topic Feedback if exists
            let response = buildQuestionPrompt(capped[0], 0, capped.length, config);
            // Ensure topic is not null for lookup
            if (topic) {
                const feedback = config.evaluation_config?.topic_config?.topic_feedbacks?.[topic];
                if (feedback) {
                    response = composeFeedbackWithNext(feedback, response);
                }
            }

            return {
                response,
                newState: {
                    ...state,
                    phase: 'await_answer',
                    topic: topic || null,
                    pending_topic: null,
                    selected_question_ids: capped.map((q) => q.id),
                    current_index: 0,
                    current_attempt: 0,
                    last_result: null,
                    shown_interstitial_ids: [],
                },
                ended: false,
            };
        }

        if (intent === 'STOP') {
            return {
                response: topicConfig?.correction_prompt_template?.trim()
                    || 'Perfecto. Contame entonces qué tarea exacta vas a realizar para seleccionar el tema correcto.',
                newState: {
                    ...state,
                    phase: 'await_topic',
                    pending_topic: null,
                },
                ended: false,
            };
        }

        return {
            response: '¿Confirmás ese tema? Responde por sí o por no, así seguimos.',
            newState: state,
            ended: false,
        };
    }

    const selectedQuestions = state.selected_question_ids
        .map((id) => findQuestionById(config, id))
        .filter((q): q is Question => q !== null);

    if (selectedQuestions.length === 0) {
        return {
            response: 'No hay preguntas seleccionadas para este examen. Revisá el banco y la configuración.',
            newState: { ...state, phase: 'completed' },
            ended: true,
        };
    }

    if (state.phase === 'await_post_close_intent') {
        const intent = await checkUserIntent(trimmed);

        if (intent === 'STOP') {
            return {
                response: getClosingMessage(config),
                newState: { ...state, phase: 'completed' },
                ended: true,
            };
        }

        if (intent === 'CONTINUE' && isOnlyAffirmative(trimmed)) {
            return {
                response: getPostCloseAskDetailMessage(config),
                newState: { ...state, phase: 'await_post_close_question' },
                ended: false,
            };
        }

        return resolvePostCloseReply(config, state, trimmed, options);
    }

    if (state.phase === 'await_post_close_question') {
        const intent = await checkUserIntent(trimmed);
        if (intent === 'STOP') {
            return {
                response: getClosingMessage(config),
                newState: { ...state, phase: 'completed' },
                ended: true,
            };
        }

        return resolvePostCloseReply(config, state, trimmed, options);
    }

    if (state.phase === 'await_interstitial_continue') {
        const intent = await checkUserIntent(trimmed);
        if (intent === 'STOP') {
            return {
                response: getGoodbyeMessage(config),
                newState: { ...state, phase: 'completed' },
                ended: true,
            };
        }

        if (intent === 'CONTINUE') {
            const nextIndex = state.current_index + 1;
            if (nextIndex >= selectedQuestions.length) {
                return {
                    response: getPostCloseAskMessage(config),
                    newState: {
                        ...state,
                        phase: 'await_post_close_intent',
                        current_index: nextIndex,
                        current_attempt: 0,
                    },
                    ended: false,
                };
            }

            const nextQuestion = selectedQuestions[nextIndex];
            if (!nextQuestion) {
                return {
                    response: getPostCloseAskMessage(config),
                    newState: {
                        ...state,
                        phase: 'await_post_close_intent',
                        current_index: nextIndex,
                        current_attempt: 0,
                    },
                    ended: false,
                };
            }

            return {
                response: buildQuestionPrompt(nextQuestion, nextIndex, selectedQuestions.length, config),
                newState: {
                    ...state,
                    phase: 'await_answer',
                    current_index: nextIndex,
                    current_attempt: 0,
                },
                ended: false,
            };
        }

        return {
            response: 'Responde por sí o por no para continuar.',
            newState: state,
            ended: false,
        };
    }

    if (state.current_index >= selectedQuestions.length) {
        return {
            response: getPostCloseAskMessage(config),
            newState: { ...state, phase: 'await_post_close_intent' },
            ended: false,
        };
    }

    const currentQuestion = selectedQuestions[state.current_index];

    if (state.phase === 'await_continue') {
        const currentPolicy = getQuestionPolicy(currentQuestion);
        const intent = await checkUserIntent(trimmed);

        if (intent === 'CONTINUE') {
            const nextIndex = state.current_index + 1;
            if (nextIndex >= selectedQuestions.length) {
                return {
                    response: getPostCloseAskMessage(config),
                    newState: {
                        ...state,
                        phase: 'await_post_close_intent',
                        current_index: nextIndex,
                        current_attempt: 0,
                    },
                    ended: false,
                };
            }

            const transition = appendInterstitialBeforeQuestion(
                config,
                state,
                selectedQuestions[nextIndex],
                nextIndex,
                selectedQuestions.length,
                state.current_index + 1
            );

            return {
                response: transition.text,
                newState: {
                    ...state,
                    phase: transition.waitForUser ? 'await_interstitial_continue' : 'await_answer',
                    current_index: transition.waitForUser ? state.current_index : nextIndex,
                    current_attempt: 0,
                    shown_interstitial_ids: transition.shownId
                        ? [...state.shown_interstitial_ids, transition.shownId]
                        : state.shown_interstitial_ids,
                },
                ended: false,
            };
        }

        if (intent === 'STOP') {
            return {
                response: getGoodbyeMessage(config),
                newState: { ...state, phase: 'completed' },
                ended: true,
            };
        }

        return {
            response: buildContinuePrompt(currentPolicy),
            newState: state,
            ended: false,
        };
    }

    // await_answer
    const deterministic = evaluateQuestionDeterministic(currentQuestion, trimmed);
    const policy = getQuestionPolicy(currentQuestion);
    let finalStatus = deterministic.status;
    let semantic: ExaminerSemanticEvaluation | undefined;

    const semanticMode = options?.semanticMode || 'ambiguous_only';
    const shouldUseSemantic = Boolean(options?.semanticEvaluator) && (
        !deterministic.failed_min_requirements
        && (
            semanticMode === 'always'
                ? deterministic.status !== 'correct'
                : (deterministic.total_expected === 0 || (deterministic.status !== 'correct' && deterministic.ambiguous))
        )
    );

    if (shouldUseSemantic && options?.semanticEvaluator) {
        semantic = await options.semanticEvaluator({
            question: currentQuestion,
            user_answer: trimmed,
            deterministic,
            expected_keys: deterministic.expected_keys,
            topic: state.topic,
            attempt: state.current_attempt,
        }) || undefined;

        if (semantic && (semantic.status === 'correct' || semantic.status === 'incomplete' || semantic.status === 'incorrect')) {
            finalStatus = semantic.status;
        }
    }

    const templateContext = buildTemplateContext(currentQuestion, deterministic, semantic);
    const isLast = state.current_index >= selectedQuestions.length - 1;

    if (finalStatus === 'correct') {
        const feedback = buildCorrectMessage(semantic, templateContext, policy);

        if (isLast) {
            return {
                response: `${feedback}\n\n${getPostCloseAskMessage(config)}`,
                newState: {
                    ...state,
                    phase: 'await_post_close_intent',
                    current_attempt: 0,
                    last_result: 'correct',
                },
                ended: false,
                semantic,
            };
        }

        if (policy.continueMode === 'auto_next') {
            const nextIndex = state.current_index + 1;
            const nextQuestion = selectedQuestions[nextIndex];
            if (!nextQuestion) {
                return {
                    response: `${feedback}\n\n${getPostCloseAskMessage(config)}`,
                    newState: {
                        ...state,
                        phase: 'await_post_close_intent',
                        current_index: nextIndex,
                        current_attempt: 0,
                        last_result: 'correct',
                    },
                    ended: false,
                    semantic,
                };
            }
            const transition = appendInterstitialBeforeQuestion(
                config,
                state,
                nextQuestion,
                nextIndex,
                selectedQuestions.length,
                state.current_index + 1
            );

            return {
                response: composeFeedbackWithNext(feedback, transition.text),
                newState: {
                    ...state,
                    phase: transition.waitForUser ? 'await_interstitial_continue' : 'await_answer',
                    current_index: transition.waitForUser ? state.current_index : nextIndex,
                    current_attempt: 0,
                    last_result: 'correct',
                    shown_interstitial_ids: transition.shownId
                        ? [...state.shown_interstitial_ids, transition.shownId]
                        : state.shown_interstitial_ids,
                },
                ended: false,
                semantic,
            };
        }

        return {
            response: `${feedback}\n\n${buildContinuePrompt(policy)}`,
            newState: {
                ...state,
                phase: 'await_continue',
                current_attempt: 0,
                last_result: 'correct',
            },
            ended: false,
            semantic,
        };
    }

    const failureStatus = finalStatus === 'incomplete' ? 'incomplete' : 'incorrect';
    const nextAttempt = state.current_attempt + 1;
    const hasRetryRemaining = nextAttempt < policy.maxAttempts;

    if (hasRetryRemaining) {
        return {
            response: buildRetryMessage(failureStatus, currentQuestion, templateContext, policy),
            newState: {
                ...state,
                phase: 'await_answer',
                current_attempt: nextAttempt,
                last_result: finalStatus,
            },
            ended: false,
            semantic,
        };
    }

    const fallbackFeedback = buildSecondFailMessage(deterministic, semantic, templateContext, policy);

    if (isLast) {
        return {
            response: `${fallbackFeedback}\n\n${getPostCloseAskMessage(config)}`,
            newState: {
                ...state,
                phase: 'await_post_close_intent',
                current_attempt: 0,
                last_result: finalStatus,
            },
            ended: false,
            semantic,
        };
    }

    if (policy.continueMode === 'auto_next') {
        const nextIndex = state.current_index + 1;
        const nextQuestion = selectedQuestions[nextIndex];
        if (!nextQuestion) {
            return {
                response: `${fallbackFeedback}\n\n${getPostCloseAskMessage(config)}`,
                newState: {
                    ...state,
                    phase: 'await_post_close_intent',
                    current_index: nextIndex,
                    current_attempt: 0,
                    last_result: finalStatus,
                },
                ended: false,
                semantic,
            };
        }
        const transition = appendInterstitialBeforeQuestion(
            config,
            state,
            nextQuestion,
            nextIndex,
            selectedQuestions.length,
            state.current_index + 1
        );

        return {
            response: composeFeedbackWithNext(fallbackFeedback, transition.text),
            newState: {
                ...state,
                phase: transition.waitForUser ? 'await_interstitial_continue' : 'await_answer',
                current_index: transition.waitForUser ? state.current_index : nextIndex,
                current_attempt: 0,
                last_result: finalStatus,
                shown_interstitial_ids: transition.shownId
                    ? [...state.shown_interstitial_ids, transition.shownId]
                    : state.shown_interstitial_ids,
            },
            ended: false,
            semantic,
        };
    }

    return {
        response: `${fallbackFeedback}\n\n${buildContinuePrompt(policy)}`,
        newState: {
            ...state,
            phase: 'await_continue',
            current_attempt: 0,
            last_result: finalStatus,
        },
        ended: false,
        semantic,
    };
}
