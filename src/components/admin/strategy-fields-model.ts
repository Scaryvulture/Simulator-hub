import type { BotConfig } from '@/lib/schemas/bot-config';
import { parseListInput } from '@/lib/utils';

export interface StrategyEditorProps {
    config: BotConfig;
    onChange: (config: BotConfig) => void;
    lang: 'es' | 'en';
}

export interface ImageTrigger {
    pattern: string;
    image_url: string;
    caption?: string;
}

export interface ExaminerQuestion {
    id: string;
    topic: string;
    type: 'teorica' | 'practica';
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

export interface QuestionBank {
    topics: string[];
    questions: ExaminerQuestion[];
}

export type EvaluationSequenceItem = NonNullable<
    NonNullable<BotConfig['evaluation_config']>['sequence']
>[number];

export type UpdateQuestionFn = <K extends keyof ExaminerQuestion>(
    index: number,
    field: K,
    value: ExaminerQuestion[K]
) => void;

export type ExaminerQuestionLintIssue = {
    severity: 'critical' | 'warning';
    questionIndex: number;
    message: string;
};

export function resolveQuestionUiKey(question: ExaminerQuestion, index: number): string {
    const trimmedId = (question.id || '').trim();
    return trimmedId ? `id:${trimmedId}` : `idx:${index}`;
}

export function lintExaminerQuestionBank(params: {
    questions: ExaminerQuestion[];
    topics: string[];
    lang: 'es' | 'en';
}): ExaminerQuestionLintIssue[] {
    const issues: ExaminerQuestionLintIssue[] = [];
    const topicsSet = new Set(
        params.topics
            .map((topic) => (topic || '').trim())
            .filter(Boolean)
    );

    const idCount = new Map<string, number>();
    params.questions.forEach((question, index) => {
        const id = (question.id || '').trim();
        if (!id) {
            issues.push({
                severity: 'critical',
                questionIndex: index,
                message: params.lang === 'es'
                    ? 'Pregunta sin ID.'
                    : 'Question without ID.',
            });
            return;
        }
        idCount.set(id, (idCount.get(id) || 0) + 1);
    });

    const duplicatedIds = new Set(
        Array.from(idCount.entries())
            .filter(([, count]) => count > 1)
            .map(([id]) => id)
    );

    params.questions.forEach((question, index) => {
        const id = (question.id || '').trim();
        const label = id || `q_${index + 1}`;
        const expectedKeys = parseListInput(question.expected_keys || '');
        const topic = (question.topic || '').trim();

        if (id && duplicatedIds.has(id)) {
            issues.push({
                severity: 'critical',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `ID duplicado en preguntas: "${id}".`
                    : `Duplicated question ID: "${id}".`,
            });
        }

        if (!(question.question || '').trim()) {
            issues.push({
                severity: 'warning',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `${label}: falta el enunciado de la pregunta.`
                    : `${label}: question statement is empty.`,
            });
        }

        if (expectedKeys.length === 0) {
            issues.push({
                severity: 'warning',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `${label}: faltan claves esperadas.`
                    : `${label}: expected keys are empty.`,
            });
        }

        if (topic && topicsSet.size > 0 && !topicsSet.has(topic)) {
            issues.push({
                severity: 'warning',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `${label}: tema "${topic}" no existe en la lista de temas.`
                    : `${label}: topic "${topic}" is not present in topic list.`,
            });
        }

        if (typeof question.max_attempts === 'number' && (question.max_attempts < 1 || question.max_attempts > 5)) {
            issues.push({
                severity: 'warning',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `${label}: max_attempts fuera de rango (1-5).`
                    : `${label}: max_attempts is out of range (1-5).`,
            });
        }

        if (typeof question.min_expected_matches === 'number') {
            const minExpected = question.min_expected_matches;
            if (!Number.isFinite(minExpected) || minExpected < 1) {
                issues.push({
                    severity: 'warning',
                    questionIndex: index,
                    message: params.lang === 'es'
                        ? `${label}: min_expected_matches debe ser mayor a 0.`
                        : `${label}: min_expected_matches must be greater than 0.`,
                });
            } else if (expectedKeys.length > 0 && minExpected > expectedKeys.length) {
                issues.push({
                    severity: 'warning',
                    questionIndex: index,
                    message: params.lang === 'es'
                        ? `${label}: min_expected_matches es mayor que la cantidad de claves esperadas.`
                        : `${label}: min_expected_matches is greater than expected keys count.`,
                });
            }
        }

        if (typeof question.min_answer_words === 'number' && (question.min_answer_words < 1 || question.min_answer_words > 200)) {
            issues.push({
                severity: 'warning',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `${label}: min_answer_words fuera de rango (1-200).`
                    : `${label}: min_answer_words is out of range (1-200).`,
            });
        }

        if (typeof question.min_answer_sentences === 'number' && (question.min_answer_sentences < 1 || question.min_answer_sentences > 20)) {
            issues.push({
                severity: 'warning',
                questionIndex: index,
                message: params.lang === 'es'
                    ? `${label}: min_answer_sentences fuera de rango (1-20).`
                    : `${label}: min_answer_sentences is out of range (1-20).`,
            });
        }
    });

    return issues;
}

export function parseTopicValueLines(raw: string): Array<{ topic: string; value: string }> {
    return (raw || '')
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const separatorIndex = line.indexOf(':');
            if (separatorIndex < 0) return null;
            const topic = line.slice(0, separatorIndex).trim();
            const value = line.slice(separatorIndex + 1).trim();
            if (!topic || !value) return null;
            return { topic, value };
        })
        .filter((entry): entry is { topic: string; value: string } => Boolean(entry));
}

export const strategyPlaceholders = {
    es: {
        session_vars: 'Ej: arquetipos, nombres, vehículos, días, etc.',
        flow_steps: 'Configura pasos del flujo conversacional',
        instructions: 'Instrucciones generales de comportamiento y respuesta del bot',
        topics: 'Ej: soldador, electricista, altura, espacios confinados',
        question: 'Escribí aquí el enunciado de la pregunta o caso práctico',
        expected: 'Conceptos/palabras clave esperadas en la respuesta',
        media_url: 'URL de video o imagen (Google Drive, etc.)',
        image_pattern: 'Regex para detectar cuándo mostrar la imagen',
        image_url: 'URL de la imagen a mostrar',
        image_caption: 'Descripción de la imagen',
        detection_criteria: 'Criterios de análisis para el detector',
        phases: 'Fases del proceso (ej: apertura, desarrollo, cierre)',
        intro_message: 'Mensaje inicial opcional. Podés usar variables como {nombre} o {tema}.',
        goodbye_message: 'Mensaje que se muestra cuando el usuario decide no continuar con el examen.',
        closing_message: 'Mensaje final que se muestra después de resolver dudas al terminar el examen.',
        post_exam_doubt_prompt: 'Primer paso de cierre: pregunta de dudas.',
        post_exam_doubt_followup: 'Si responde que sí (sin detalle): mensaje para pedir la duda concreta.',
        generic_goodbye_intent_phrases: 'Frases que disparan despedida (una por línea o separadas por coma).',
        generic_closing_intent_phrases: 'Frases que disparan cierre final (una por línea o separadas por coma).',
    },
    en: {
        session_vars: 'E.g.: archetypes, names, vehicles, days, etc.',
        flow_steps: 'Configure conversational flow steps',
        instructions: 'General instructions for bot behavior and response style',
        topics: 'E.g.: welder, electrician, heights, confined spaces',
        question: 'Write the question or practical case statement here',
        expected: 'Expected concepts/keywords in the answer',
        media_url: 'Video or image URL (Google Drive, etc.)',
        image_pattern: 'Regex to detect when to show the image',
        image_url: 'Image URL to display',
        image_caption: 'Image description',
        detection_criteria: 'Analysis criteria for detector',
        phases: 'Process phases (e.g.: opening, development, closing)',
        intro_message: 'Optional initial message. You can use variables like {name} or {topic}.',
        goodbye_message: 'Message shown when the user decides not to continue with the exam.',
        closing_message: 'Final message shown after the post-exam doubts step.',
        post_exam_doubt_prompt: 'Closing step 1: doubts question.',
        post_exam_doubt_followup: 'If user says yes (without detail): follow-up asking for the specific doubt.',
        generic_goodbye_intent_phrases: 'Phrases that trigger goodbye (one per line or comma-separated).',
        generic_closing_intent_phrases: 'Phrases that trigger final closing (one per line or comma-separated).',
    },
} as const;

export const strategyLabels = {
    es: {
        simulator: 'Configuración de Simulador',
        simulator_desc: 'Variables de sesión y flujo de roleplay.',
        evaluator: 'Configuración de Examinador',
        evaluator_desc: 'Banco de preguntas y reglas del examen guiado.',
        detector: 'Configuración de Detector',
        detector_desc: 'Criterios de análisis y feedback visual.',
        generic: 'Configuración General',
        generic_desc: 'Fases del proceso y prompt base.',
        session_vars: 'Variables de Sesión',
        flow_steps: 'Pasos del Flujo',
        question_bank: 'Banco de Preguntas',
        flow_advanced: 'Bloqueadores globales',
        flow_advanced_desc: 'Opcional: interrupciones que se evalúan en cada turno antes del examen (reconducción, off-topic, abuso). Se activan con disparadores de texto.',
        goodbye_message: 'Mensaje de despedida',
        goodbye_message_desc: 'Texto que se muestra cuando el usuario decide no continuar. Si queda vacío se usa un mensaje predeterminado.',
        closing_message: 'Mensaje de cierre',
        closing_message_desc: 'Texto final del cierre (después del paso de dudas). Si queda vacío se usa un mensaje predeterminado.',
        post_exam_doubt_prompt: 'Paso 1 de cierre (pregunta de dudas)',
        post_exam_doubt_prompt_desc: 'Texto que se muestra al terminar las preguntas para consultar si el usuario tiene dudas.',
        post_exam_doubt_followup: 'Paso 1b (pedir detalle de la duda)',
        post_exam_doubt_followup_desc: 'Texto que se muestra cuando el usuario responde afirmativamente sin incluir una duda concreta.',
        topics: 'Temas Disponibles',
        add_topic: 'Agregar Tema',
        add_question: 'Agregar Pregunta',
        mandatory: 'Obligatoria',
        question: 'Pregunta',
        expected: 'Respuesta Esperada',
        media: 'Media (URL)',
        eval_config: 'Configuración de Evaluación',
        mandatory_count: 'Preguntas obligatorias por corrida',
        random_count: 'Preguntas aleatorias por corrida',
        order_mode: 'Orden de salida',
        order_mandatory_first: 'Primero obligatorias',
        order_random_first: 'Primero aleatorias',
        order_mixed: 'Intercaladas',
        question_type_order: 'Orden por tipo',
        question_type_any: 'Sin ordenar por tipo',
        question_type_teorica_first: 'Teóricas primero',
        question_type_practica_first: 'Casos prácticos primero',
        show_question_counter: 'Mostrar contador (Pregunta X/Y)',
        by_topic: 'Filtrar por tema detectado',
        image_triggers: 'Disparadores de Imagen',
        image_triggers_desc: 'Imágenes que se muestran automáticamente según la respuesta del bot.',
        add_trigger: 'Agregar Disparador',
        pattern: 'Patrón (regex)',
        url: 'URL Imagen',
        caption: 'Caption',
        detection_criteria: 'Criterios de Detección',
        phases: 'Fases del Proceso',
        intro_message: 'Mensaje de Introducción',
        intro_message_desc: 'Se muestra automáticamente al iniciar el chat. Usá {variable} para valores dinámicos.',
        generic_termination_rules: 'Reglas de fin (editable)',
        generic_termination_rules_desc: 'Definí qué frases activan despedida o cierre final en Genérico.',
        generic_goodbye_intents: 'Intenciones de despedida',
        generic_closing_intents: 'Intenciones de cierre final',
        generic_ignore_question_messages: 'Ignorar disparadores si el mensaje del usuario contiene pregunta (?)',
    },
    en: {
        simulator: 'Simulator Configuration',
        simulator_desc: 'Session variables and roleplay flow.',
        evaluator: 'Examiner Configuration',
        evaluator_desc: 'Question bank and guided exam rules.',
        detector: 'Detector Configuration',
        detector_desc: 'Analysis criteria and visual feedback.',
        generic: 'General Configuration',
        generic_desc: 'Process phases and base prompt.',
        session_vars: 'Session Variables',
        flow_steps: 'Flow Steps',
        question_bank: 'Question Bank',
        flow_advanced: 'Global blockers',
        flow_advanced_desc: 'Optional: interrupts evaluated every turn before the exam (reconduction, off-topic, abuse). Triggered by text patterns.',
        goodbye_message: 'Goodbye message',
        goodbye_message_desc: 'Text shown when the user decides not to continue. If empty, a default message is used.',
        closing_message: 'Closing message',
        closing_message_desc: 'Final closing text (after the doubts step). If empty, a default message is used.',
        post_exam_doubt_prompt: 'Closing step 1 (doubts question)',
        post_exam_doubt_prompt_desc: 'Text shown after the last question to ask whether the user has doubts.',
        post_exam_doubt_followup: 'Step 1b (ask for doubt detail)',
        post_exam_doubt_followup_desc: 'Text shown when user says yes but does not include a specific doubt.',
        topics: 'Available Topics',
        add_topic: 'Add Topic',
        add_question: 'Add Question',
        mandatory: 'Mandatory',
        question: 'Question',
        expected: 'Expected Answer',
        media: 'Media (URL)',
        eval_config: 'Evaluation Config',
        mandatory_count: 'Mandatory questions per run',
        random_count: 'Random questions per run',
        order_mode: 'Output order',
        order_mandatory_first: 'Mandatory first',
        order_random_first: 'Random first',
        order_mixed: 'Mixed',
        question_type_order: 'Type order',
        question_type_any: 'No type ordering',
        question_type_teorica_first: 'Theoretical first',
        question_type_practica_first: 'Practical first',
        show_question_counter: 'Show counter (Question X/Y)',
        by_topic: 'Filter by detected topic',
        image_triggers: 'Image Triggers',
        image_triggers_desc: 'Images shown automatically based on bot response.',
        add_trigger: 'Add Trigger',
        pattern: 'Pattern (regex)',
        url: 'Image URL',
        caption: 'Caption',
        detection_criteria: 'Detection Criteria',
        phases: 'Process Phases',
        intro_message: 'Introduction Message',
        intro_message_desc: 'Shown automatically when chat starts. Use {variable} for dynamic values.',
        generic_termination_rules: 'End rules (editable)',
        generic_termination_rules_desc: 'Define which phrases trigger goodbye or final closing in Generic.',
        generic_goodbye_intents: 'Goodbye intents',
        generic_closing_intents: 'Final closing intents',
        generic_ignore_question_messages: 'Ignore triggers if user message contains a question mark (?)',
    },
} as const;

export type StrategyFieldLabels = typeof strategyLabels.es | typeof strategyLabels.en;
export type StrategyFieldPlaceholders = typeof strategyPlaceholders.es | typeof strategyPlaceholders.en;
