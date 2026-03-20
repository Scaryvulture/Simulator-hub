'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, MessageSquare, Image as ImageIcon, HelpCircle, Brain, ChevronDown, ChevronRight, Plus, Trash2, ShieldAlert, Bot } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, type ChangeEvent } from 'react';
import { FlowEditor, type FlowStep, type SessionVarConfig } from './flow-editor';
import { HelpTooltip } from './help-tooltip';
import { QuestionPoolPicker } from './QuestionPoolPicker';
import { DetectionStepEditor } from './detection-step-editor';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { lintFlowConfig } from '@/lib/flow-linter';
import { cn, parseListInput } from '@/lib/utils';
import { parseQuestionBankMarkdown } from '@/lib/question-bank-markdown';
import { parseQuestionBankJson } from '@/lib/question-bank-json';

interface Props {
    botType: string;
    config: BotConfig;
    onChange: (config: BotConfig) => void;
    lang: 'es' | 'en';
}

interface ImageTrigger {
    pattern: string;
    image_url: string;
    caption?: string;
}

interface ExaminerQuestion {
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

interface QuestionBank {
    topics: string[];
    questions: ExaminerQuestion[];
}

type EvaluationSequenceItem = NonNullable<NonNullable<BotConfig['evaluation_config']>['sequence']>[number];

type UpdateQuestionFn = <K extends keyof ExaminerQuestion>(
    index: number,
    field: K,
    value: ExaminerQuestion[K]
) => void;

type ExaminerQuestionLintIssue = {
    severity: 'critical' | 'warning';
    questionIndex: number;
    message: string;
};

function resolveQuestionUiKey(question: ExaminerQuestion, index: number): string {
    const trimmedId = (question.id || '').trim();
    return trimmedId ? `id:${trimmedId}` : `idx:${index}`;
}

function lintExaminerQuestionBank(params: {
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

// Generic placeholders (not tied to specific prompts)
const placeholders = {
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
    }
};

const labels = {
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
    }
};

function parseTopicValueLines(raw: string): Array<{ topic: string; value: string }> {
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

// =============== LOCAL STATE COMPONENTS ===============

// Image trigger row with local state (prevents parent re-render on each keystroke)
function ImageTriggerRow({ trigger, index, onUpdate, onDelete, placeholders: p }: {
    trigger: ImageTrigger;
    index: number;
    onUpdate: (index: number, updated: ImageTrigger) => void;
    onDelete: (index: number) => void;
    placeholders: typeof placeholders['es'];
}) {
    const [localPattern, setLocalPattern] = useState(trigger.pattern || '');
    const [localUrl, setLocalUrl] = useState(trigger.image_url || '');
    const [localCaption, setLocalCaption] = useState(trigger.caption || '');

    useEffect(() => {
        setLocalPattern(trigger.pattern || '');
        setLocalUrl(trigger.image_url || '');
        setLocalCaption(trigger.caption || '');
    }, [trigger.pattern, trigger.image_url, trigger.caption]);

    return (
        <div data-image-trigger-index={index} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-3 rounded-xl">
            <div className="col-span-4">
                <Input
                    value={localPattern}
                    onChange={(e) => setLocalPattern(e.target.value)}
                    onBlur={() => onUpdate(index, { ...trigger, pattern: localPattern })}
                    placeholder={p.image_pattern}
                    className="text-xs h-9"
                />
            </div>
            <div className="col-span-4">
                <Input
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    onBlur={() => onUpdate(index, { ...trigger, image_url: localUrl })}
                    placeholder={p.image_url}
                    className="text-xs h-9"
                />
            </div>
            <div className="col-span-3">
                <Input
                    value={localCaption}
                    onChange={(e) => setLocalCaption(e.target.value)}
                    onBlur={() => onUpdate(index, { ...trigger, caption: localCaption })}
                    placeholder={p.image_caption}
                    className="text-xs h-9"
                />
            </div>
            <div className="col-span-1 flex justify-center">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => onDelete(index)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}

// Examiner question row with local state
function QuestionRow({ q, index, topics, issues, onUpdate, onDelete, expanded, onToggle, l, p, lang }: {
    q: ExaminerQuestion;
    index: number;
    topics: string[];
    issues: ExaminerQuestionLintIssue[];
    onUpdate: UpdateQuestionFn;
    onDelete: (index: number) => void;
    expanded: boolean;
    onToggle: () => void;
    l: typeof labels['es'];
    p: typeof placeholders['es'];
    lang: 'es' | 'en';
}) {
    const [localQuestion, setLocalQuestion] = useState(q.question || '');
    const [localExpected, setLocalExpected] = useState(q.expected_keys || '');
    const [localMedia, setLocalMedia] = useState(q.media_url || '');
    const [localId, setLocalId] = useState(q.id || '');
    const [localBranchKey, setLocalBranchKey] = useState(q.branch_key || '');
    const [localMaxAttempts, setLocalMaxAttempts] = useState(String(q.max_attempts ?? 2));
    const [localMinExpected, setLocalMinExpected] = useState(
        typeof q.min_expected_matches === 'number' ? String(q.min_expected_matches) : ''
    );
    const [localMinAnswerWords, setLocalMinAnswerWords] = useState(
        typeof q.min_answer_words === 'number' ? String(q.min_answer_words) : ''
    );
    const [localMinAnswerSentences, setLocalMinAnswerSentences] = useState(
        typeof q.min_answer_sentences === 'number' ? String(q.min_answer_sentences) : ''
    );
    const [localRetryIncomplete, setLocalRetryIncomplete] = useState(q.retry_incomplete_template || '');
    const [localRetryIncorrect, setLocalRetryIncorrect] = useState(q.retry_incorrect_template || '');
    const [localSecondFail, setLocalSecondFail] = useState(q.second_fail_template || '');
    const [localCorrectFeedback, setLocalCorrectFeedback] = useState(q.correct_feedback_template || '');
    const [localContinuePrompt, setLocalContinuePrompt] = useState(q.continue_prompt_template || '');

    useEffect(() => {
        setLocalQuestion(q.question || '');
        setLocalExpected(q.expected_keys || '');
        setLocalMedia(q.media_url || '');
        setLocalId(q.id || '');
        setLocalBranchKey(q.branch_key || '');
        setLocalMaxAttempts(String(q.max_attempts ?? 2));
        setLocalMinExpected(typeof q.min_expected_matches === 'number' ? String(q.min_expected_matches) : '');
        setLocalMinAnswerWords(typeof q.min_answer_words === 'number' ? String(q.min_answer_words) : '');
        setLocalMinAnswerSentences(typeof q.min_answer_sentences === 'number' ? String(q.min_answer_sentences) : '');
        setLocalRetryIncomplete(q.retry_incomplete_template || '');
        setLocalRetryIncorrect(q.retry_incorrect_template || '');
        setLocalSecondFail(q.second_fail_template || '');
        setLocalCorrectFeedback(q.correct_feedback_template || '');
        setLocalContinuePrompt(q.continue_prompt_template || '');
    }, [
        q.question,
        q.expected_keys,
        q.media_url,
        q.id,
        q.branch_key,
        q.max_attempts,
        q.min_expected_matches,
        q.min_answer_words,
        q.min_answer_sentences,
        q.retry_incomplete_template,
        q.retry_incorrect_template,
        q.second_fail_template,
        q.correct_feedback_template,
        q.continue_prompt_template,
    ]);

    const summary = (q.question || '').trim()
        || (lang === 'es' ? 'Pregunta sin enunciado' : 'Question without statement');
    const summaryShort = summary.length > 120 ? `${summary.slice(0, 120)}…` : summary;
    const expectedCount = parseListInput(q.expected_keys || '').length;
    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    return (
        <div
            data-question-bank-id={q.id}
            data-question-bank-index={index}
            className={cn(
                "bg-white border rounded-lg p-3",
                criticalCount > 0
                    ? "border-red-300 bg-red-50/40"
                    : warningCount > 0
                        ? "border-amber-300 bg-amber-50/40"
                        : "border-slate-200"
            )}
        >
            <div className="w-full flex items-start gap-2">
                <button
                    type="button"
                    onClick={onToggle}
                    className="flex-1 min-w-0 flex items-start gap-2 text-left"
                >
                    {expanded ? <ChevronDown className="h-4 w-4 mt-0.5 text-slate-500" /> : <ChevronRight className="h-4 w-4 mt-0.5 text-slate-500" />}
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-mono bg-slate-100 px-2 py-0.5 rounded">
                                {q.id || `q_${index + 1}`}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                                {q.type === 'practica'
                                    ? (lang === 'es' ? 'Caso práctico' : 'Practical case')
                                    : (lang === 'es' ? 'Teórica' : 'Theoretical')}
                            </span>
                            {q.topic ? (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-primary/10 text-primary">
                                    {q.topic}
                                </span>
                            ) : (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                                    {lang === 'es' ? 'Común (sin tema)' : 'Common (no topic)'}
                                </span>
                            )}
                            {q.is_mandatory && (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                    {lang === 'es' ? 'Obligatoria' : 'Mandatory'}
                                </span>
                            )}
                            <span className="text-[11px] text-slate-500">
                                {expectedCount} {lang === 'es' ? 'claves' : 'keys'}
                            </span>
                            {criticalCount > 0 && (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                                    {criticalCount} {lang === 'es' ? 'crítico(s)' : 'critical'}
                                </span>
                            )}
                            {warningCount > 0 && (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                                    {warningCount} warning(s)
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-700 mt-1">{summaryShort}</p>
                    </div>
                </button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-500"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(index);
                    }}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>

            {expanded && (
                <div className="space-y-2 mt-3">
                    {issues.length > 0 && (
                        <div className={cn(
                            "rounded-lg border p-2 space-y-1",
                            criticalCount > 0
                                ? "border-red-200 bg-red-50/70"
                                : "border-amber-200 bg-amber-50/70"
                        )}>
                            {issues.slice(0, 4).map((issue, issueIndex) => (
                                <p
                                    key={`${issue.severity}-${issueIndex}`}
                                    className={cn(
                                        "text-xs",
                                        issue.severity === 'critical'
                                            ? "text-red-700"
                                            : "text-amber-800"
                                    )}
                                >
                                    • {issue.message}
                                </p>
                            ))}
                            {issues.length > 4 && (
                                <p className="text-[11px] text-slate-500">
                                    {lang === 'es'
                                        ? `+${issues.length - 4} issue(s) más en esta pregunta`
                                        : `+${issues.length - 4} more issue(s) in this question`}
                                </p>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-2">
                        <Input
                            value={localId}
                            onChange={(e) => setLocalId(e.target.value)}
                            onBlur={() => {
                                const next = localId.trim();
                                if (next && next !== q.id) onUpdate(index, 'id', next);
                            }}
                            placeholder="q_001"
                            className="text-xs h-7 w-36 font-mono"
                        />
                        <select
                            value={q.type}
                            onChange={(e) => onUpdate(index, 'type', e.target.value as ExaminerQuestion['type'])}
                            className="text-xs h-7 px-2 border rounded"
                        >
                            <option value="teorica">Teórica</option>
                            <option value="practica">Caso práctico</option>
                        </select>
                        <select
                            value={q.topic}
                            onChange={(e) => onUpdate(index, 'topic', e.target.value)}
                            className="text-xs h-7 px-2 border rounded"
                        >
                            <option value="">{l.topics}</option>
                            {topics.map((t: string) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                            <input
                                type="checkbox"
                                checked={q.is_mandatory}
                                onChange={(e) => onUpdate(index, 'is_mandatory', e.target.checked)}
                            />
                            {l.mandatory}
                        </label>
                    </div>

                    <textarea
                        value={localQuestion}
                        onChange={(e) => setLocalQuestion(e.target.value)}
                        onBlur={() => onUpdate(index, 'question', localQuestion)}
                        placeholder={p.question}
                        className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <textarea
                            value={localExpected}
                            onChange={(e) => setLocalExpected(e.target.value)}
                            onBlur={() => onUpdate(index, 'expected_keys', localExpected)}
                            placeholder={p.expected}
                            className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                        />
                        <Input
                            value={localMedia}
                            onChange={(e) => setLocalMedia(e.target.value)}
                            onBlur={() => onUpdate(index, 'media_url', localMedia)}
                            placeholder={p.media_url}
                            className="text-xs h-8"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Input
                    value={localBranchKey}
                    onChange={(e) => setLocalBranchKey(e.target.value)}
                    onBlur={() => onUpdate(index, 'branch_key', localBranchKey)}
                    placeholder={lang === 'es' ? 'Condición de tema (vacío = todos)' : 'Topic condition (empty = all)'}
                    title={lang === 'es'
                        ? 'Si tiene valor, la pregunta solo aparece cuando el tema detectado coincide. Ej: "fijo" para andamio fijo. Vacío = aparece en todos los temas.'
                        : 'If set, the question only appears when the detected topic matches. E.g.: "fixed" for fixed scaffold. Empty = shows for all topics.'}
                    className="text-xs h-8"
                />
                <div>
                    <Label className="text-[10px] text-slate-500">Máx. reintentos</Label>
                    <Input
                        type="number"
                        min={1}
                        max={5}
                        value={localMaxAttempts}
                        onChange={(e) => setLocalMaxAttempts(e.target.value)}
                        onBlur={() => {
                            const parsed = Math.max(1, Math.min(5, Number(localMaxAttempts || 2)));
                            onUpdate(index, 'max_attempts', Number.isFinite(parsed) ? parsed : 2);
                        }}
                        className="text-xs h-8"
                    />
                </div>
                <div>
                    <Label className="text-[10px] text-slate-500">Continuación</Label>
                    <select
                        value={q.continue_mode || 'ask_confirm'}
                        onChange={(e) => onUpdate(index, 'continue_mode', e.target.value as ExaminerQuestion['continue_mode'])}
                        className="text-xs h-8 px-2 border rounded w-full"
                    >
                        <option value="ask_confirm">Pedir confirmación</option>
                        <option value="auto_next">Avanzar automático</option>
                    </select>
                </div>
                    </div>

                    <div>
                <Label className="text-[10px] text-slate-500">Mínimo de claves esperadas (opcional)</Label>
                <Input
                    type="number"
                    min={1}
                    max={20}
                    value={localMinExpected}
                    onChange={(e) => setLocalMinExpected(e.target.value)}
                    onBlur={() => {
                        const raw = localMinExpected.trim();
                        if (!raw) {
                            onUpdate(index, 'min_expected_matches', undefined);
                            return;
                        }
                        const parsed = Math.max(1, Math.min(20, Number(raw)));
                        onUpdate(index, 'min_expected_matches', Number.isFinite(parsed) ? parsed : undefined);
                    }}
                    className="text-xs h-8"
                    placeholder="Ej: 3"
                />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                    <Label className="text-[10px] text-slate-500">
                        {lang === 'es' ? 'Mínimo de palabras (opcional)' : 'Min words (optional)'}
                    </Label>
                    <Input
                        type="number"
                        min={1}
                        max={200}
                        value={localMinAnswerWords}
                        onChange={(e) => setLocalMinAnswerWords(e.target.value)}
                        onBlur={() => {
                            const raw = localMinAnswerWords.trim();
                            if (!raw) {
                                onUpdate(index, 'min_answer_words', undefined);
                                return;
                            }
                            const parsed = Math.max(1, Math.min(200, Number(raw)));
                            onUpdate(index, 'min_answer_words', Number.isFinite(parsed) ? parsed : undefined);
                        }}
                        className="text-xs h-8"
                        placeholder="Ej: 25"
                    />
                </div>
                <div>
                    <Label className="text-[10px] text-slate-500">
                        {lang === 'es' ? 'Mínimo de oraciones (opcional)' : 'Min sentences (optional)'}
                    </Label>
                    <Input
                        type="number"
                        min={1}
                        max={20}
                        value={localMinAnswerSentences}
                        onChange={(e) => setLocalMinAnswerSentences(e.target.value)}
                        onBlur={() => {
                            const raw = localMinAnswerSentences.trim();
                            if (!raw) {
                                onUpdate(index, 'min_answer_sentences', undefined);
                                return;
                            }
                            const parsed = Math.max(1, Math.min(20, Number(raw)));
                            onUpdate(index, 'min_answer_sentences', Number.isFinite(parsed) ? parsed : undefined);
                        }}
                        className="text-xs h-8"
                        placeholder="Ej: 3"
                    />
                </div>
                    </div>

                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Plantillas scripted por resultado
                </summary>
                <div className="mt-2 space-y-2">
                    <textarea
                        value={localRetryIncomplete}
                        onChange={(e) => setLocalRetryIncomplete(e.target.value)}
                        onBlur={() => onUpdate(index, 'retry_incomplete_template', localRetryIncomplete)}
                        placeholder="Reintento incompleta (ej: Lamentablemente tu respuesta es incompleta. Inténtalo de nuevo {question})"
                        className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                    />
                    <textarea
                        value={localRetryIncorrect}
                        onChange={(e) => setLocalRetryIncorrect(e.target.value)}
                        onBlur={() => onUpdate(index, 'retry_incorrect_template', localRetryIncorrect)}
                        placeholder="Reintento incorrecta"
                        className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                    />
                    <textarea
                        value={localSecondFail}
                        onChange={(e) => setLocalSecondFail(e.target.value)}
                        onBlur={() => onUpdate(index, 'second_fail_template', localSecondFail)}
                        placeholder="Mensaje al segundo fallo"
                        className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                    />
                    <textarea
                        value={localCorrectFeedback}
                        onChange={(e) => setLocalCorrectFeedback(e.target.value)}
                        onBlur={() => onUpdate(index, 'correct_feedback_template', localCorrectFeedback)}
                        placeholder="Feedback cuando está correcta"
                        className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                    />
                    <textarea
                        value={localContinuePrompt}
                        onChange={(e) => setLocalContinuePrompt(e.target.value)}
                        onBlur={() => onUpdate(index, 'continue_prompt_template', localContinuePrompt)}
                        placeholder="Pregunta para continuar (cuando continue_mode=ask_confirm)"
                        className="text-xs min-h-16 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                    />
                    <p className="text-[10px] text-slate-500">
                        Variables: {'{question}'}, {'{expected_keys}'}, {'{expected_keys_bullets}'}, {'{missing_keys}'}, {'{missing_keys_bullets}'}, {'{matched_count}'}, {'{required_count}'}, {'{answer_word_count}'}, {'{answer_sentence_count}'}, {'{min_answer_words}'}, {'{min_answer_sentences}'}, {'{semantic_feedback}'}.
                    </p>
                </div>
                    </details>
                </div>
            )}
        </div>
    );
}

// Textarea with local state (for intro_message, detection_criteria, phases)
function LocalTextarea({ value, onCommit, placeholder, className }: {
    value: string;
    onCommit: (val: string) => void;
    placeholder?: string;
    className?: string;
}) {
    const [localVal, setLocalVal] = useState(value);

    useEffect(() => {
        setLocalVal(value);
    }, [value]);

    return (
        <textarea
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={() => onCommit(localVal)}
            placeholder={placeholder}
            className={className}
        />
    );
}

function TemplateTextareaWithVariables({
    value,
    onCommit,
    placeholder,
    className,
    variables,
    helper,
}: {
    value: string;
    onCommit: (val: string) => void;
    placeholder?: string;
    className?: string;
    variables: string[];
    helper: string;
}) {
    const [localVal, setLocalVal] = useState(value);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        setLocalVal(value);
    }, [value]);

    const insertToken = (token: string) => {
        const marker = `{${token}}`;
        const textarea = textareaRef.current;

        if (!textarea) {
            const next = `${localVal}${localVal ? ' ' : ''}${marker}`;
            setLocalVal(next);
            onCommit(next);
            return;
        }

        const start = textarea.selectionStart ?? localVal.length;
        const end = textarea.selectionEnd ?? localVal.length;
        const next = `${localVal.slice(0, start)}${marker}${localVal.slice(end)}`;
        const cursorPos = start + marker.length;

        setLocalVal(next);
        onCommit(next);

        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(cursorPos, cursorPos);
        });
    };

    return (
        <div className="space-y-2">
            <textarea
                ref={textareaRef}
                value={localVal}
                onChange={(e) => setLocalVal(e.target.value)}
                onBlur={() => onCommit(localVal)}
                placeholder={placeholder}
                className={className}
            />
            <div className="flex flex-wrap gap-1.5">
                {variables.map((variable) => (
                    <Button
                        key={variable}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-[10px] font-semibold"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => insertToken(variable)}
                    >
                        {`{${variable}}`}
                    </Button>
                ))}
            </div>
            <p className="text-[10px] text-slate-500">{helper}</p>
        </div>
    );
}


// ============================================================================
// GLOBAL BLOCKERS EDITOR (Universal)
// ============================================================================
interface GlobalBlockersEditorProps {
    globalTriggers: FlowStep[];
    sessionVars: Record<string, SessionVarConfig>;
    onChange: (newTriggers: FlowStep[], newSessionVars: Record<string, SessionVarConfig>) => void;
    lang: 'es' | 'en';
    title?: string;
    description?: string;
    tooltipTitle?: string;
    tooltipContent?: string;
}

function GlobalBlockersEditor({
    globalTriggers,
    sessionVars,
    onChange,
    lang,
    title,
    description,
    tooltipTitle,
    tooltipContent,
}: GlobalBlockersEditorProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const hadIssuesRef = useRef(false);

    const lint = useMemo(() => lintFlowConfig({
        flow_steps: [],
        global_triggers: globalTriggers,
        session_vars: sessionVars,
    } as unknown as BotConfig), [globalTriggers, sessionVars]);
    const hasIssues = lint.critical_count > 0 || lint.warning_count > 0;

    useEffect(() => {
        if (hasIssues && !hadIssuesRef.current) {
            setIsExpanded(true);
        }
        hadIssuesRef.current = hasIssues;
    }, [hasIssues]);

    // Reuse FlowEditor internally but with restricted view if possible,
    // or just render a simplified list if FlowEditor is too complex.
    // For now, we will reuse FlowEditor as it is the most robust way to edit FlowSteps.
    // We strictly filter to "GLOBAL_BLOCKER" style steps if needed, but FlowEditor handles generic FlowSteps.

    return (
        <Card className={cn(
            "bg-white rounded-2xl",
            lint.critical_count > 0
                ? "border-red-300"
                : lint.warning_count > 0
                    ? "border-amber-300"
                    : "border-slate-200"
        )}>
            <CardHeader
                className="cursor-pointer hover:bg-slate-50 transition-colors py-4 px-5"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-red-500" />
                        <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1">
                            {title || (lang === 'es' ? 'Bloqueadores Globales' : 'Global Blockers')}
                            <HelpTooltip
                                title={tooltipTitle || (lang === 'es' ? 'Bloqueadores' : 'Blockers')}
                                content={tooltipContent || (lang === 'es'
                                    ? 'Reglas que se ejecutan SIEMPRE antes de cualquier otra lógica. Útil para moderación, seguridad o palabras prohibidas.'
                                    : 'Rules that ALWAYS run before any other logic. Useful for moderation, safety, or banned words.')}
                            />
                        </CardTitle>
                        {globalTriggers.length > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                {globalTriggers.length}
                            </span>
                        )}
                        {lint.critical_count > 0 && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                {lang === 'es' ? `${lint.critical_count} crítico(s)` : `${lint.critical_count} critical`}
                            </span>
                        )}
                        {lint.warning_count > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                {lang === 'es' ? `${lint.warning_count} warning(s)` : `${lint.warning_count} warning(s)`}
                            </span>
                        )}
                    </div>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
                <CardDescription className="text-xs text-slate-500">
                    {description || (lang === 'es' ? 'Reglas de seguridad y desvíos globales.' : 'Safety rules and global overrides.')}
                    {lint.critical_count > 0 && (
                        <span className="ml-1 font-semibold text-red-600">
                            {lang === 'es'
                                ? `Hay ${lint.critical_count} error(es) crítico(s).`
                                : `${lint.critical_count} critical issue(s) detected.`}
                        </span>
                    )}
                    {lint.critical_count === 0 && lint.warning_count > 0 && (
                        <span className="ml-1 font-semibold text-amber-700">
                            {lang === 'es'
                                ? `Hay ${lint.warning_count} warning(s).`
                                : `${lint.warning_count} warning(s) detected.`}
                        </span>
                    )}
                </CardDescription>
            </CardHeader>
            {isExpanded && (
                <CardContent className="pt-0 border-t border-slate-100">
                    <div className="py-4">
                        <FlowEditor
                            steps={[]} // No flow steps, only global triggers
                            sessionVars={sessionVars}
                            globalTriggers={globalTriggers}
                            lang={lang}
                            hideFlowSteps={true} // New prop to hide flow steps section
                            onChange={(_, newVars, newGlobals) => onChange(newGlobals, newVars)}
                        />
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

// =============== MAIN COMPONENT ===============

export function StrategyFields({ botType, config, onChange, lang }: Props) {
    const l = labels[lang];
    const p = placeholders[lang];
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['main']));
    const [pendingQuestionScrollId, setPendingQuestionScrollId] = useState<string | null>(null);
    const [pendingImageTriggerScrollIndex, setPendingImageTriggerScrollIndex] = useState<number | null>(null);
    const [questionTypeFilter, setQuestionTypeFilter] = useState<'all' | 'teorica' | 'practica'>('all');
    const [newTopicName, setNewTopicName] = useState('');
    const [bankImportMode, setBankImportMode] = useState<'markdown' | 'json'>('markdown');
    const [bankImportText, setBankImportText] = useState('');
    const [bankImportStatus, setBankImportStatus] = useState<string | null>(null);
    const [bankImportError, setBankImportError] = useState<string | null>(null);
    const [bulkTopicsText, setBulkTopicsText] = useState('');
    const [bulkTopicsStatus, setBulkTopicsStatus] = useState<string | null>(null);
    const [bulkTopicsError, setBulkTopicsError] = useState<string | null>(null);
    const [bulkAliasesText, setBulkAliasesText] = useState('');
    const [bulkAliasesStatus, setBulkAliasesStatus] = useState<string | null>(null);
    const [bulkAliasesError, setBulkAliasesError] = useState<string | null>(null);
    const [bulkFeedbacksText, setBulkFeedbacksText] = useState('');
    const [bulkFeedbacksStatus, setBulkFeedbacksStatus] = useState<string | null>(null);
    const [bulkFeedbacksError, setBulkFeedbacksError] = useState<string | null>(null);
    const [expandedQuestionRows, setExpandedQuestionRows] = useState<Set<string>>(new Set());

    // Picker State
    const [pickerState, setPickerState] = useState<{
        isOpen: boolean;
        mode: 'single' | 'multiple';
        initialIds: string[];
        onCommit: (ids: string[]) => void;
    }>({
        isOpen: false,
        mode: 'single',
        initialIds: [],
        onCommit: () => { }
    });
    const editorSurfaceClass = cn(
        "space-y-4",
        "dark:[&_input]:bg-slate-900 dark:[&_input]:border-slate-700 dark:[&_input]:text-slate-100",
        "dark:[&_textarea]:bg-slate-900 dark:[&_textarea]:border-slate-700 dark:[&_textarea]:text-slate-100",
        "dark:[&_select]:bg-slate-900 dark:[&_select]:border-slate-700 dark:[&_select]:text-slate-100",
        "dark:[&_.bg-white]:bg-slate-900 dark:[&_.bg-slate-50]:bg-slate-800/60",
        "dark:[&_.text-slate-900]:text-slate-100 dark:[&_.text-slate-800]:text-slate-100 dark:[&_.text-slate-700]:text-slate-200 dark:[&_.text-slate-600]:text-slate-300 dark:[&_.text-slate-500]:text-slate-400 dark:[&_.text-slate-400]:text-slate-500",
        "dark:[&_.border-slate-200]:border-slate-700 dark:[&_.border-slate-100]:border-slate-800"
    );

    const configuredQuestionCount = Array.isArray((config.question_bank as QuestionBank | undefined)?.questions)
        ? ((config.question_bank as QuestionBank).questions || []).length
        : 0;
    const configuredImageTriggerCount = Array.isArray(config.image_triggers)
        ? config.image_triggers.length
        : 0;
    const examinerQuestionBank = useMemo<QuestionBank>(() => {
        const source = config.question_bank as QuestionBank | undefined;
        return {
            topics: Array.isArray(source?.topics) ? source.topics : [],
            questions: Array.isArray(source?.questions) ? source.questions : [],
        };
    }, [config.question_bank]);
    const examinerQuestionIssues = useMemo(
        () => lintExaminerQuestionBank({
            questions: examinerQuestionBank.questions,
            topics: examinerQuestionBank.topics,
            lang,
        }),
        [examinerQuestionBank, lang]
    );
    const examinerQuestionIssuesByIndex = useMemo(() => {
        const map = new Map<number, ExaminerQuestionLintIssue[]>();
        examinerQuestionIssues.forEach((issue) => {
            const current = map.get(issue.questionIndex) || [];
            current.push(issue);
            map.set(issue.questionIndex, current);
        });
        return map;
    }, [examinerQuestionIssues]);

    const toggleSection = (section: string) => {
        const newSet = new Set(expandedSections);
        if (newSet.has(section)) {
            newSet.delete(section);
        } else {
            newSet.add(section);
        }
        setExpandedSections(newSet);
    };

    const updateConfig = <K extends keyof BotConfig>(field: K, value: BotConfig[K]) => {
        onChange({ ...config, [field]: value });
    };

    const genericInteraction = (config.generic_interaction || {}) as NonNullable<BotConfig['generic_interaction']>;
    const updateGenericInteraction = (patch: Partial<NonNullable<BotConfig['generic_interaction']>>) => {
        updateConfig('generic_interaction', {
            ...genericInteraction,
            ...patch,
        } as BotConfig['generic_interaction']);
    };

    useEffect(() => {
        if (!pendingQuestionScrollId) return;
        const questionElement = document.querySelector(
            `[data-question-bank-id="${pendingQuestionScrollId}"]`
        ) as HTMLElement | null;
        if (!questionElement) return;
        questionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingQuestionScrollId(null);
    }, [configuredQuestionCount, pendingQuestionScrollId]);

    useEffect(() => {
        if (pendingImageTriggerScrollIndex === null) return;
        const triggerElement = document.querySelector(
            `[data-image-trigger-index="${pendingImageTriggerScrollIndex}"]`
        ) as HTMLElement | null;
        if (!triggerElement) return;
        triggerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingImageTriggerScrollIndex(null);
    }, [configuredImageTriggerCount, pendingImageTriggerScrollIndex]);

    // ===== INTRO MESSAGE (Universal - applies to ALL bot types) =====
    const introMessageSection = (
        <Card className="bg-gradient-to-r from-primary/10 to-card border-primary/20 rounded-2xl">
            <CardHeader
                className="cursor-pointer hover:bg-primary/5 transition-colors py-4 px-5"
                onClick={() => toggleSection('intro_message')}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                            {l.intro_message}
                            <HelpTooltip
                                title={lang === 'es' ? 'Mensaje de introducción' : 'Introduction message'}
                                content={lang === 'es'
                                    ? 'Es lo primero que ve el usuario al abrir el chat. Úsalo para contexto inicial y expectativas.'
                                    : 'This is the first message users see when they open chat. Use it to set context and expectations.'}
                            />
                        </CardTitle>
                        {config.intro_message && (
                            <span className="text-xs bg-primary/15 text-primary border border-primary/25 px-2 py-0.5 rounded-full font-medium">
                                ✓
                            </span>
                        )}
                    </div>
                    {expandedSections.has('intro_message') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
                <CardDescription className="text-xs text-slate-600 dark:text-slate-300">{l.intro_message_desc}</CardDescription>
            </CardHeader>
            {expandedSections.has('intro_message') && (
                <CardContent className="pt-0">
                    <LocalTextarea
                        value={config.intro_message || ''}
                        onCommit={(val) => updateConfig('intro_message', val)}
                        placeholder={p.intro_message}
                        className="w-full h-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-mono leading-relaxed text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
                    />
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                        💡 {lang === 'es'
                            ? 'Este mensaje aparece automáticamente cuando el usuario abre el chat, antes de que escriba nada.'
                            : 'This message appears automatically when the user opens the chat, before they type anything.'}
                    </p>
                </CardContent>
            )}
        </Card>
    );

    // ===== SEQUENCE EDITOR (New) =====
    const sequenceEditor = (
        <div className="space-y-4 border rounded-xl p-4 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
                <Label className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {lang === 'es' ? 'Secuencia de Preguntas (Playlist)' : 'Question Sequence (Playlist)'}
                </Label>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const currentSeq = config.evaluation_config?.sequence || [];
                        updateConfig('evaluation_config', {
                            ...config.evaluation_config,
                            sequence: [...currentSeq, {
                                id: `seq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                type: 'specific',
                                question_id: ''
                            }]
                        } as BotConfig['evaluation_config']);
                    }}
                >
                    <Plus className="h-3 w-3 mr-1" />
                    {lang === 'es' ? 'Agregar paso' : 'Add step'}
                </Button>
            </div>

            <div className="space-y-2">
                {((config.evaluation_config?.sequence || []) as EvaluationSequenceItem[]).map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-start p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-center h-8 w-6 text-xs text-slate-400 font-mono">
                            {idx + 1}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex gap-2">
                                <select
                                    className="h-8 text-xs border rounded px-2 w-32 bg-transparent"
                                    value={item.type}
                                    onChange={(e) => {
                                        const newSeq = [...(config.evaluation_config?.sequence || [])];
                                        newSeq[idx] = { ...item, type: e.target.value as EvaluationSequenceItem['type'] };
                                        updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                                    }}
                                >
                                    <option value="specific">{lang === 'es' ? 'Pregunta Fija' : 'Specific Question'}</option>
                                    <option value="random_pool">{lang === 'es' ? 'Pool Aleatorio' : 'Random Pool'}</option>
                                    <option value="random_topic">{lang === 'es' ? 'Tema Aleatorio' : 'Random Topic'}</option>
                                </select>

                                {/* Specific Question Config */}
                                {item.type === 'specific' && (
                                    <div className="flex-1 flex gap-2">
                                        <Button
                                            variant="outline"
                                            className="h-8 text-xs flex-1 justify-start font-normal"
                                            onClick={() => {
                                                setPickerState({
                                                    isOpen: true,
                                                    mode: 'single',
                                                    initialIds: item.question_id ? [item.question_id] : [],
                                                    onCommit: (ids) => {
                                                        const newSeq = [...(config.evaluation_config?.sequence || [])];
                                                        newSeq[idx] = { ...item, question_id: ids[0] || '' };
                                                        updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                                                        setPickerState(prev => ({ ...prev, isOpen: false }));
                                                    }
                                                });
                                            }}
                                        >
                                            {item.question_id
                                                ? (config.question_bank?.questions.find((q: ExaminerQuestion) => q.id === item.question_id)?.question || item.question_id).slice(0, 40) + '...'
                                                : (lang === 'es' ? 'Seleccionar Pregunta...' : 'Select Question...')}
                                        </Button>
                                    </div>
                                )}

                                {/* Random Pool Config */}
                                {item.type === 'random_pool' && (
                                    <div className="flex-1 flex gap-2 items-center">
                                        <Input
                                            type="number"
                                            className="h-8 w-16 text-xs"
                                            placeholder="Cant."
                                            value={item.count || 1}
                                            onChange={(e) => {
                                                const newSeq = [...(config.evaluation_config?.sequence || [])];
                                                newSeq[idx] = { ...item, count: parseInt(e.target.value) || 1 };
                                                updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                                            }}
                                        />
                                        <Button
                                            variant="outline"
                                            className="h-8 text-xs flex-1 justify-start font-normal"
                                            onClick={() => {
                                                setPickerState({
                                                    isOpen: true,
                                                    mode: 'multiple',
                                                    initialIds: item.pool_ids || [],
                                                    onCommit: (ids) => {
                                                        const newSeq = [...(config.evaluation_config?.sequence || [])];
                                                        newSeq[idx] = { ...item, pool_ids: ids };
                                                        updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                                                        setPickerState(prev => ({ ...prev, isOpen: false }));
                                                    }
                                                });
                                            }}
                                        >
                                            {(item.pool_ids || []).length > 0
                                                ? `${(item.pool_ids || []).length} ${lang === 'es' ? 'preguntas' : 'questions'}`
                                                : (lang === 'es' ? 'Seleccionar Pool...' : 'Select Pool...')}
                                        </Button>
                                    </div>
                                )}

                                {/* Random Topic Config */}
                                {item.type === 'random_topic' && (
                                    <div className="flex-1 flex gap-2 items-center">
                                        <Input
                                            type="number"
                                            className="h-8 w-16 text-xs"
                                            placeholder="Cant."
                                            title={lang === 'es' ? 'Cantidad de preguntas' : 'Number of questions'}
                                            value={item.count || 1}
                                            onChange={(e) => {
                                                const newSeq = [...(config.evaluation_config?.sequence || [])];
                                                newSeq[idx] = { ...item, count: parseInt(e.target.value) || 1 };
                                                updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                                            }}
                                        />
                                        <select
                                            className="h-8 text-xs border rounded px-2 flex-1 bg-transparent"
                                            value={item.topic || ''}
                                            onChange={(e) => {
                                                const newSeq = [...(config.evaluation_config?.sequence || [])];
                                                newSeq[idx] = { ...item, topic: e.target.value };
                                                updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                                            }}
                                        >
                                            <option value="">{lang === 'es' ? '-- Cualquier tema --' : '-- Any topic --'}</option>
                                            <option value="all">{lang === 'es' ? 'Cualquier tema (Mezclado)' : 'Any topic (Mixed)'}</option>
                                            {(config.question_bank?.topics || []).map((t: string) => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:bg-red-50"
                            onClick={() => {
                                const newSeq = ((config.evaluation_config?.sequence || []) as EvaluationSequenceItem[]).filter((_, i: number) => i !== idx);
                                updateConfig('evaluation_config', { ...config.evaluation_config, sequence: newSeq } as BotConfig['evaluation_config']);
                            }}
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                ))}

                {(config.evaluation_config?.sequence || []).length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs italic border-2 border-dashed border-slate-200 rounded-xl">
                        {lang === 'es'
                            ? 'No hay pasos definidos. El examen finalizará inmediatamente.'
                            : 'No steps defined. Exam will end immediately.'}
                    </div>
                )}
            </div>

            <p className="text-[10px] text-slate-500">
                {lang === 'es'
                    ? 'Define el orden exacto. "Pregunta Fija" es una pregunta específica. "Tema Aleatorio" toma N preguntas al azar de un tema. "Pool Aleatorio" toma N preguntas de una lista de IDs filtrada por el tema activo.'
                    : 'Define exact order. "Specific Question" is one specific question. "Random Topic" picks N random questions from a topic. "Random Pool" picks N random questions from a list of IDs filtered by active topic.'}
            </p>

            {/* Picker Global Instance */}
            <QuestionPoolPicker
                isOpen={pickerState.isOpen}
                onClose={() => setPickerState(prev => ({ ...prev, isOpen: false }))}
                onCommit={pickerState.onCommit}
                initialIds={pickerState.initialIds}
                questions={config.question_bank?.questions || []}
                topics={config.question_bank?.topics || []}
                mode={pickerState.mode}
                lang={lang}
            />
        </div>
    );


    // ===== IMAGE TRIGGERS (Universal) =====
    const triggers = config.image_triggers || [];

    const updateImageTrigger = (index: number, updated: ImageTrigger) => {
        const newTriggers = [...triggers];
        newTriggers[index] = updated;
        updateConfig('image_triggers', newTriggers as BotConfig['image_triggers']);
    };

    const deleteImageTrigger = (index: number) => {
        updateConfig('image_triggers', triggers.filter((_: ImageTrigger, i: number) => i !== index) as BotConfig['image_triggers']);
    };

    const addImageTrigger = () => {
        const nextIndex = triggers.length;
        updateConfig('image_triggers', [...triggers, { pattern: '', image_url: '', caption: '' }] as BotConfig['image_triggers']);
        setPendingImageTriggerScrollIndex(nextIndex);
    };

    const imageTriggersSection = (
        <Card className="bg-white border-slate-200 rounded-2xl">
            <CardHeader
                className="cursor-pointer hover:bg-slate-50 transition-colors py-4 px-5"
                onClick={() => toggleSection('image_triggers')}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-1">
                            {l.image_triggers}
                            <HelpTooltip
                                title={lang === 'es' ? 'Disparadores de imagen' : 'Image triggers'}
                                content={lang === 'es'
                                    ? 'Cuando la respuesta del bot coincide con un patrón, se muestra automáticamente la imagen asociada.'
                                    : 'When bot output matches a pattern, the associated image is shown automatically.'}
                            />
                        </CardTitle>
                        {triggers.length > 0 && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                                {triggers.length}
                            </span>
                        )}
                    </div>
                    {expandedSections.has('image_triggers') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
                <CardDescription className="text-xs text-slate-500">{l.image_triggers_desc}</CardDescription>
            </CardHeader>
            {expandedSections.has('image_triggers') && (
                <CardContent className="space-y-3 pt-0">
                    {triggers.map((trigger: ImageTrigger, index: number) => (
                        <ImageTriggerRow
                            key={index}
                            trigger={trigger}
                            index={index}
                            onUpdate={updateImageTrigger}
                            onDelete={deleteImageTrigger}
                            placeholders={p}
                        />
                    ))}
                    <Button variant="outline" size="sm" onClick={addImageTrigger} className="w-full">
                        <Plus className="h-3 w-3 mr-1" /> {l.add_trigger}
                    </Button>
                </CardContent>
            )}
        </Card>
    );

    // ===== SIMULATOR =====
    if (botType === 'SIMULATOR') {
        return (
            <div className={editorSurfaceClass}>
                {introMessageSection}
                <Card className="bg-gradient-to-r from-primary/10 to-card border-primary/20 rounded-2xl">
                    <CardHeader className="py-4 px-5">
                        <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                            <Users className="h-4 w-4 text-primary" /> {l.simulator}
                            <HelpTooltip
                                title={lang === 'es' ? 'Simulador' : 'Simulator'}
                                content={lang === 'es'
                                    ? 'Acá diseñás la práctica: variables + pasos del flujo para controlar qué dice y cuándo lo dice el bot.'
                                    : 'Design practice here: variables + flow steps to control what the bot says and when.'}
                            />
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-600 dark:text-slate-300">{l.simulator_desc}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <FlowEditor
                            steps={(config.flow_steps || []) as FlowStep[]}
                            sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                            globalTriggers={(config.global_triggers || []) as FlowStep[]}
                            lang={lang}
                            onChange={(steps, vars, globalTriggers) => {
                                onChange({
                                    ...config,
                                    flow_steps: steps as BotConfig['flow_steps'],
                                    session_vars: vars as BotConfig['session_vars'],
                                    global_triggers: globalTriggers as BotConfig['global_triggers'],
                                });
                            }}
                        />
                    </CardContent>
                </Card>
                {imageTriggersSection}
            </div>
        );
    }



    // ===== EXAMINER =====
    if (botType === 'EXAMINER') {
        const questionBank: QuestionBank = config.question_bank || { topics: [], questions: [] };
        const topicOptions = Array.from(new Set([
            ...(Array.isArray(questionBank.topics) ? questionBank.topics : []),
            ...(Array.isArray(questionBank.questions) ? questionBank.questions.map((q) => (q.topic || '').trim()) : []),
        ].map((topic) => (topic || '').trim()).filter(Boolean)));
        const evalConfig = config.evaluation_config || {
            teoricas: { mandatory: 2, random: 3 },
            practicas: { count: 0, by_topic: true },
            selection: {
                mandatory_count: 2,
                random_count: 3,
                by_topic: true,
                order_mode: 'mandatory_first',
                question_type_order: 'any',
                show_question_counter: false,
                semantic_mode: 'ambiguous_only',
            },
            interstitial_messages: [],
            mode: 'standard',
            sequence: [],
        };
        const closingConfig = evalConfig.closing_config || {
            post_exam_doubt_prompt_template: '',
            post_exam_doubt_followup_template: '',
        };
        const updateClosingConfig = (updates: Partial<typeof closingConfig>) => {
            updateConfig('evaluation_config', {
                ...evalConfig,
                closing_config: {
                    ...closingConfig,
                    ...updates,
                },
            });
        };
        const selectionConfig = {
            mandatory_count: evalConfig.selection?.mandatory_count ?? evalConfig.teoricas?.mandatory ?? 2,
            random_count: evalConfig.selection?.random_count ?? ((evalConfig.teoricas?.random ?? 0) + (evalConfig.practicas?.count ?? 0)),
            by_topic: evalConfig.selection?.by_topic ?? evalConfig.practicas?.by_topic ?? true,
            order_mode: evalConfig.selection?.order_mode ?? 'mandatory_first',
            question_type_order: evalConfig.selection?.question_type_order ?? 'any',
            show_question_counter: evalConfig.selection?.show_question_counter === true,
            semantic_mode: evalConfig.selection?.semantic_mode ?? 'ambiguous_only',
        } as {
            mandatory_count: number;
            random_count: number;
            by_topic: boolean;
            order_mode: 'mandatory_first' | 'random_first' | 'mixed';
            question_type_order: 'any' | 'teorica_first' | 'practica_first';
            show_question_counter: boolean;
            semantic_mode: 'ambiguous_only' | 'always';
        };

        const updateEvaluationSelection = (updates: Partial<typeof selectionConfig>) => {
            const next = { ...selectionConfig, ...updates };
            updateConfig('evaluation_config', {
                ...evalConfig,
                teoricas: {
                    mandatory: next.mandatory_count,
                    random: next.random_count,
                },
                practicas: {
                    count: 0,
                    by_topic: next.by_topic,
                },
                selection: next,
            });
        };

        const interstitialMessages = Array.isArray(evalConfig.interstitial_messages)
            ? evalConfig.interstitial_messages
            : [];
        const updateInterstitialMessages = (nextMessages: typeof interstitialMessages) => {
            updateConfig('evaluation_config', {
                ...evalConfig,
                interstitial_messages: nextMessages,
            });
        };

        const addTopic = () => {
            const topic = newTopicName.trim();
            if (topic) {
                const mergedTopics = Array.from(new Set([...(questionBank.topics || []), topic]));
                updateConfig('question_bank', {
                    ...questionBank,
                    topics: mergedTopics
                } as BotConfig['question_bank']);
                setNewTopicName('');
            }
        };

        const addTopicsBulk = () => {
            const incoming = parseListInput(bulkTopicsText);
            if (incoming.length === 0) {
                setBulkTopicsError(
                    lang === 'es'
                        ? 'No se detectaron temas. Pegá temas separados por coma o salto de línea.'
                        : 'No topics detected. Paste topics separated by comma or newline.'
                );
                setBulkTopicsStatus(null);
                return;
            }

            const mergedTopics = Array.from(new Set([...(questionBank.topics || []), ...incoming]));
            updateConfig('question_bank', { ...questionBank, topics: mergedTopics } as BotConfig['question_bank']);
            setBulkTopicsError(null);
            setBulkTopicsStatus(
                lang === 'es'
                    ? `Temas cargados: +${incoming.length}. Total: ${mergedTopics.length}.`
                    : `Topics loaded: +${incoming.length}. Total: ${mergedTopics.length}.`
            );
            setBulkTopicsText('');
        };

        const deleteTopic = (index: number) => {
            const updated = questionBank.topics.filter((_: string, i: number) => i !== index);
            updateConfig('question_bank', { ...questionBank, topics: updated } as BotConfig['question_bank']);
        };

        const addQuestion = () => {
            const existingIds = new Set(questionBank.questions.map((q) => q.id));
            let nextOrdinal = questionBank.questions.length + 1;
            let newQuestionId = `q_${nextOrdinal}`;
            while (existingIds.has(newQuestionId)) {
                nextOrdinal += 1;
                newQuestionId = `q_${nextOrdinal}`;
            }
            const defaultType: ExaminerQuestion['type'] = questionTypeFilter === 'all' ? 'teorica' : questionTypeFilter;
            updateConfig('question_bank', {
                ...questionBank,
                questions: [...questionBank.questions, {
                    id: newQuestionId,
                    topic: topicOptions[0] || '',
                    type: defaultType,
                    question: '',
                    expected_keys: '',
                    media_url: '',
                    is_mandatory: false,
                    branch_key: '',
                    max_attempts: 2,
                    continue_mode: 'ask_confirm',
                    min_expected_matches: undefined,
                    retry_incomplete_template: '',
                    retry_incorrect_template: '',
                    second_fail_template: '',
                    correct_feedback_template: '',
                    continue_prompt_template: '',
                    evaluation_spec: {},
                }]
            } as BotConfig['question_bank']);
            setPendingQuestionScrollId(newQuestionId);
            setExpandedQuestionRows((prev) => {
                const next = new Set(prev);
                next.add(`id:${newQuestionId}`);
                return next;
            });
        };

        const updateQuestion: UpdateQuestionFn = (index, field, value) => {
            const previousQuestion = questionBank.questions[index];
            const oldKey = previousQuestion ? resolveQuestionUiKey(previousQuestion, index) : null;
            const updated = [...questionBank.questions];
            updated[index] = { ...updated[index], [field]: value };
            updateConfig('question_bank', { ...questionBank, questions: updated } as BotConfig['question_bank']);

            if (field === 'id' && oldKey) {
                const updatedQuestion = updated[index];
                const newKey = resolveQuestionUiKey(updatedQuestion, index);
                if (newKey !== oldKey) {
                    setExpandedQuestionRows((prev) => {
                        if (!prev.has(oldKey)) return prev;
                        const next = new Set(prev);
                        next.delete(oldKey);
                        next.add(newKey);
                        return next;
                    });
                }
            }
        };

        const deleteQuestion = (index: number) => {
            const previousQuestion = questionBank.questions[index];
            const keyToDelete = previousQuestion ? resolveQuestionUiKey(previousQuestion, index) : null;
            updateConfig('question_bank', {
                ...questionBank,
                questions: questionBank.questions.filter((_: ExaminerQuestion, i: number) => i !== index)
            } as BotConfig['question_bank']);
            if (keyToDelete) {
                setExpandedQuestionRows((prev) => {
                    if (!prev.has(keyToDelete)) return prev;
                    const next = new Set(prev);
                    next.delete(keyToDelete);
                    return next;
                });
            }
        };

        const importQuestionBankFromText = () => {
            try {
                const parsed = bankImportMode === 'json'
                    ? parseQuestionBankJson(bankImportText)
                    : parseQuestionBankMarkdown(bankImportText);

                if (parsed.questions.length === 0) {
                    setBankImportError(
                        bankImportMode === 'json'
                            ? (lang === 'es'
                                ? 'No se detectaron preguntas válidas en el JSON.'
                                : 'No valid questions detected in JSON.')
                            : (lang === 'es'
                                ? 'No se detectaron preguntas válidas en el markdown. Revisá encabezados y numeración.'
                                : 'No valid questions were detected in markdown. Check headings and numbering.')
                    );
                    setBankImportStatus(null);
                    return;
                }

                const parsedTopics = Array.from(new Set([
                    ...(parsed.topics || []),
                    ...parsed.questions.map((q) => (q.topic || '').trim()).filter(Boolean),
                ]));

                updateConfig('question_bank', {
                    topics: parsedTopics,
                    questions: parsed.questions,
                } as BotConfig['question_bank']);

                setBankImportError(null);
                setBankImportStatus(
                    lang === 'es'
                        ? `Importación ok (${bankImportMode.toUpperCase()}): ${parsedTopics.length} tema(s), ${parsed.questions.length} pregunta(s). ${parsed.warnings.length > 0 ? `Advertencias: ${parsed.warnings.length}.` : ''}`
                        : `Import OK (${bankImportMode.toUpperCase()}): ${parsedTopics.length} topic(s), ${parsed.questions.length} question(s). ${parsed.warnings.length > 0 ? `Warnings: ${parsed.warnings.length}.` : ''}`
                );
            } catch (error) {
                setBankImportError(error instanceof Error ? error.message : (lang === 'es' ? 'No se pudo importar el banco.' : 'Could not import bank.'));
                setBankImportStatus(null);
            }
        };

        const loadImportFile = (event: ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const lowerName = file.name.toLowerCase();
            if (lowerName.endsWith('.json')) setBankImportMode('json');
            else if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerName.endsWith('.txt')) setBankImportMode('markdown');

            const reader = new FileReader();
            reader.onload = () => {
                const content = typeof reader.result === 'string' ? reader.result : '';
                setBankImportText(content);
                setBankImportError(null);
                setBankImportStatus(
                    lang === 'es'
                        ? `Archivo cargado: ${file.name}. Revisá el contenido y presioná "Importar y reemplazar banco".`
                        : `File loaded: ${file.name}. Review content and click "Import and replace bank".`
                );
            };
            reader.onerror = () => {
                setBankImportError(lang === 'es' ? 'No se pudo leer el archivo.' : 'Could not read file.');
                setBankImportStatus(null);
            };
            reader.readAsText(file);
            event.target.value = '';
        };
        const examinerCriticalCount = examinerQuestionIssues.filter((issue) => issue.severity === 'critical').length;
        const examinerWarningCount = examinerQuestionIssues.filter((issue) => issue.severity === 'warning').length;
        const focusExaminerIssue = (issue: ExaminerQuestionLintIssue) => {
            setQuestionTypeFilter('all');
            const question = questionBank.questions[issue.questionIndex];
            const rowKey = question
                ? resolveQuestionUiKey(question, issue.questionIndex)
                : `idx:${issue.questionIndex}`;
            setExpandedQuestionRows((prev) => {
                const next = new Set(prev);
                next.add(rowKey);
                return next;
            });
            requestAnimationFrame(() => {
                const row = document.querySelector(
                    `[data-question-bank-index="${issue.questionIndex}"]`
                ) as HTMLElement | null;
                if (row) row.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        };

        return (
            <div className={editorSurfaceClass}>
                {introMessageSection}

                {/* Goodbye Message */}
                <Card className="bg-gradient-to-r from-orange-50 to-card border-orange-200/40 rounded-2xl dark:from-orange-950/20 dark:border-orange-500/20">
                    <CardHeader
                        className="cursor-pointer hover:bg-orange-50/50 transition-colors py-4 px-5"
                        onClick={() => toggleSection('goodbye_message')}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-base">👋</span>
                                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                                    {l.goodbye_message}
                                    <HelpTooltip
                                        title={l.goodbye_message}
                                        content={l.goodbye_message_desc}
                                    />
                                </CardTitle>
                                {config.goodbye_message && (
                                    <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-500/30">
                                        ✓
                                    </span>
                                )}
                            </div>
                            {expandedSections.has('goodbye_message') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <CardDescription className="text-xs text-slate-600 dark:text-slate-300">{l.goodbye_message_desc}</CardDescription>
                    </CardHeader>
                    {expandedSections.has('goodbye_message') && (
                        <CardContent className="pt-0">
                            <LocalTextarea
                                value={config.goodbye_message || ''}
                                onCommit={(val) => updateConfig('goodbye_message', val)}
                                placeholder={p.goodbye_message}
                                className="w-full h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-mono leading-relaxed text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-orange-200/40 focus:border-orange-300/60 outline-none transition-all"
                            />
                        </CardContent>
                    )}
                </Card>

                {/* Closing Message */}
                <Card className="bg-gradient-to-r from-emerald-50 to-card border-emerald-200/40 rounded-2xl dark:from-emerald-950/20 dark:border-emerald-500/20">
                    <CardHeader
                        className="cursor-pointer hover:bg-emerald-50/50 transition-colors py-4 px-5"
                        onClick={() => toggleSection('closing_message')}
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="text-base">🎉</span>
                                <CardTitle className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
                                    {l.closing_message}
                                    <HelpTooltip
                                        title={l.closing_message}
                                        content={l.closing_message_desc}
                                    />
                                </CardTitle>
                                {config.closing_message && (
                                    <span className="text-xs bg-emerald-100 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-medium dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-500/30">
                                        ✓
                                    </span>
                                )}
                            </div>
                            {expandedSections.has('closing_message') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <CardDescription className="text-xs text-slate-600 dark:text-slate-300">{l.closing_message_desc}</CardDescription>
                    </CardHeader>
                    {expandedSections.has('closing_message') && (
                        <CardContent className="pt-0 space-y-3">
                            <div>
                                <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                                    {l.post_exam_doubt_prompt}
                                </Label>
                                <LocalTextarea
                                    value={closingConfig.post_exam_doubt_prompt_template || ''}
                                    onCommit={(val) => updateClosingConfig({ post_exam_doubt_prompt_template: val })}
                                    placeholder={p.post_exam_doubt_prompt}
                                    className="w-full h-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-mono leading-relaxed text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-200/40 focus:border-emerald-300/60 outline-none transition-all"
                                />
                                <p className="text-[10px] text-slate-500">{l.post_exam_doubt_prompt_desc}</p>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                                    {l.post_exam_doubt_followup}
                                </Label>
                                <LocalTextarea
                                    value={closingConfig.post_exam_doubt_followup_template || ''}
                                    onCommit={(val) => updateClosingConfig({ post_exam_doubt_followup_template: val })}
                                    placeholder={p.post_exam_doubt_followup}
                                    className="w-full h-16 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-mono leading-relaxed text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-200/40 focus:border-emerald-300/60 outline-none transition-all"
                                />
                                <p className="text-[10px] text-slate-500">{l.post_exam_doubt_followup_desc}</p>
                            </div>
                            <div>
                                <Label className="text-xs font-semibold text-slate-600 mb-1 block">
                                    {l.closing_message}
                                </Label>
                            <LocalTextarea
                                value={config.closing_message || ''}
                                onCommit={(val) => updateConfig('closing_message', val)}
                                placeholder={p.closing_message}
                                className="w-full h-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-mono leading-relaxed text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-emerald-200/40 focus:border-emerald-300/60 outline-none transition-all"
                            />
                            </div>
                        </CardContent>
                    )}
                </Card>
                <Card className="bg-gradient-to-r from-primary/10 to-card border-primary/20 rounded-2xl">
                    <CardHeader className="py-4 px-5">
                        <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                <HelpCircle className="h-4 w-4 text-primary" /> {l.evaluator}
                                <HelpTooltip
                                    title={lang === 'es' ? 'Examinador' : 'Examiner'}
                                    content={lang === 'es'
                                        ? 'Define preguntas, criterios y reglas de armado del examen automático.'
                                        : 'Define questions, criteria, and automatic exam assembly rules.'}
                                />
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-600 dark:text-slate-300">{l.evaluator_desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                            {lang === 'es'
                                ? 'Este bot usa un banco local (propio) guardado en su configuración.'
                                : 'This bot uses a local question bank stored in its own configuration.'}
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <Label className="text-xs font-bold text-slate-600">
                                    {lang === 'es' ? 'Importar banco (Markdown / JSON)' : 'Import bank (Markdown / JSON)'}
                                </Label>
                                <div className="flex items-center gap-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={bankImportMode === 'markdown' ? 'default' : 'outline'}
                                        onClick={() => setBankImportMode('markdown')}
                                    >
                                        Markdown
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={bankImportMode === 'json' ? 'default' : 'outline'}
                                        onClick={() => setBankImportMode('json')}
                                    >
                                        JSON
                                    </Button>
                                </div>
                            </div>
                            <p className="text-[11px] text-slate-500">
                                {lang === 'es'
                                    ? 'Podés pegar el contenido o subir un archivo. Al importar, se reemplaza el banco actual del bot.'
                                    : 'You can paste content or upload a file. Import replaces this bot current bank.'}
                            </p>
                            <textarea
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono leading-relaxed text-slate-800 focus:ring-2 focus:ring-primary/20 focus:border-primary/40 outline-none transition-all"
                                value={bankImportText}
                                onChange={(e) => setBankImportText(e.target.value)}
                                placeholder={bankImportMode === 'json'
                                    ? (lang === 'es'
                                        ? 'Pegá un JSON con topics/temas y questions/preguntas.'
                                        : 'Paste JSON with topics and questions.')
                                    : (lang === 'es'
                                        ? 'Pegá markdown con secciones de tema, preguntas y respuesta esperada.'
                                        : 'Paste markdown with topic sections, questions and expected answers.')}
                            />
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={importQuestionBankFromText}>
                                    {lang === 'es' ? 'Importar y Reemplazar Banco' : 'Import and Replace Bank'}
                                </Button>
                                <Button type="button" size="sm" variant="outline" asChild>
                                    <label className="cursor-pointer">
                                        {lang === 'es' ? 'Subir archivo' : 'Upload file'}
                                        <input
                                            type="file"
                                            accept=".md,.markdown,.txt,.json,application/json,text/markdown,text/plain"
                                            className="hidden"
                                            onChange={loadImportFile}
                                        />
                                    </label>
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        setBankImportText('');
                                        setBankImportError(null);
                                        setBankImportStatus(null);
                                    }}
                                >
                                    {lang === 'es' ? 'Limpiar' : 'Clear'}
                                </Button>
                            </div>
                            {bankImportError && (
                                <p className="text-[11px] text-red-600">{bankImportError}</p>
                            )}
                            {bankImportStatus && !bankImportError && (
                                <p className="text-[11px] text-emerald-700">{bankImportStatus}</p>
                            )}
                        </div>

                        {/* Topics */}
                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                            <Label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                                {l.topics}
                                <HelpTooltip
                                    title={lang === 'es' ? 'Temas' : 'Topics'}
                                    content={lang === 'es'
                                        ? 'Se usan para filtrar preguntas y para el enrutamiento por tema.'
                                        : 'Used to filter questions and for topic routing.'}
                                />
                            </Label>
                            <div className="flex flex-wrap gap-2">
                                {topicOptions.map((topic: string, index: number) => (
                                    <span key={index} className="inline-flex items-center gap-1 bg-primary/15 text-primary border border-primary/20 px-2 py-1 rounded-full text-xs font-medium">
                                        {topic}
                                        {questionBank.topics.includes(topic) && (
                                            <button
                                                onClick={() => deleteTopic(questionBank.topics.findIndex((value) => value === topic))}
                                                className="hover:text-red-600"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </button>
                                        )}
                                    </span>
                                ))}
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={newTopicName}
                                    onChange={(e) => setNewTopicName(e.target.value)}
                                    className="h-8 text-xs"
                                    placeholder={lang === 'es'
                                        ? 'Tema individual. Ejemplo: Oficial Soldador'
                                        : 'Single topic. Example: Welder'}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addTopic();
                                        }
                                    }}
                                />
                                <Button variant="outline" size="sm" onClick={addTopic}>
                                    <Plus className="h-3 w-3 mr-1" /> {l.add_topic}
                                </Button>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] text-slate-500">
                                    {lang === 'es'
                                        ? 'Carga masiva de temas (uno por línea o separados por coma)'
                                        : 'Bulk topic load (one per line or comma-separated)'}
                                </Label>
                                <textarea
                                    className="w-full h-20 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono"
                                    value={bulkTopicsText}
                                    onChange={(e) => setBulkTopicsText(e.target.value)}
                                    placeholder={lang === 'es'
                                        ? 'Ejemplo:\nOficial Soldador\nOperador de Amoladora\n1/2 Oficial Electricista'
                                        : 'Example:\nWelder\nGrinder Operator\nElectrician'}
                                />
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={addTopicsBulk}>
                                        {lang === 'es' ? 'Cargar temas' : 'Load topics'}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            setBulkTopicsText('');
                                            setBulkTopicsError(null);
                                            setBulkTopicsStatus(null);
                                        }}
                                    >
                                        {lang === 'es' ? 'Limpiar' : 'Clear'}
                                    </Button>
                                </div>
                                {bulkTopicsError && <p className="text-[11px] text-red-600">{bulkTopicsError}</p>}
                                {bulkTopicsStatus && !bulkTopicsError && <p className="text-[11px] text-emerald-700">{bulkTopicsStatus}</p>}
                            </div>
                        </div>

                        {/* Router Configuration */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                            <Label className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                <Brain className="h-4 w-4 text-purple-600" />
                                {lang === 'es' ? 'Selección de Tema' : 'Topic Selection'}
                            </Label>

                            <div className="space-y-4">
                                {(() => {
                                    const currentEvalConfig = config.evaluation_config || {
                                        teoricas: { mandatory: 2, random: 3 },
                                        practicas: { count: 0, by_topic: true },
                                        selection: undefined,
                                        topic_config: undefined,
                                        mode: 'standard',
                                        sequence: [],
                                    };

                                    const currentTopicConfig = currentEvalConfig.topic_config || {
                                        enabled: true,
                                        no_topic_template: undefined,
                                        confirm_template: undefined,
                                        correction_prompt_template: undefined,
                                        single_task_template: undefined,
                                        enforce_single_task: false,
                                        allow_topic_correction: true,
                                        use_router_llm: true,
                                        skip_confirmation: false,
                                        ask_template: undefined,
                                        router_prompt: undefined,
                                        topic_aliases: undefined,
                                        topic_feedbacks: undefined
                                    };

                                    const updateTopicConfig = (updates: Partial<typeof currentTopicConfig>) => {
                                        updateConfig('evaluation_config', {
                                            ...currentEvalConfig,
                                            topic_config: {
                                                ...currentTopicConfig,
                                                ...updates
                                            }
                                        });
                                    };

                                    const applyBulkAliases = () => {
                                        const pairs = parseTopicValueLines(bulkAliasesText);
                                        if (pairs.length === 0) {
                                            setBulkAliasesError(
                                                lang === 'es'
                                                    ? 'Formato inválido. Usá "Tema: alias1, alias2" por línea.'
                                                    : 'Invalid format. Use one line per "Topic: alias1, alias2".'
                                            );
                                            setBulkAliasesStatus(null);
                                            return;
                                        }

                                        const currentMap = { ...(currentTopicConfig.topic_aliases || {}) };
                                        const touchedTopics: string[] = [];
                                        let applied = 0;
                                        for (const pair of pairs) {
                                            const aliases = parseListInput(pair.value);
                                            if (aliases.length === 0) continue;
                                            currentMap[pair.topic] = aliases;
                                            touchedTopics.push(pair.topic);
                                            applied += 1;
                                        }

                                        if (applied === 0) {
                                            setBulkAliasesError(
                                                lang === 'es'
                                                    ? 'No se detectaron alias válidos.'
                                                    : 'No valid aliases detected.'
                                            );
                                            setBulkAliasesStatus(null);
                                            return;
                                        }

                                        const mergedTopics = Array.from(new Set([...(questionBank.topics || []), ...touchedTopics]));
                                        onChange({
                                            ...config,
                                            question_bank: { ...questionBank, topics: mergedTopics } as BotConfig['question_bank'],
                                            evaluation_config: {
                                                ...currentEvalConfig,
                                                topic_config: {
                                                    ...currentTopicConfig,
                                                    topic_aliases: currentMap,
                                                },
                                            } as BotConfig['evaluation_config'],
                                        });
                                        setBulkAliasesError(null);
                                        setBulkAliasesStatus(
                                            lang === 'es'
                                                ? `Alias cargados para ${applied} tema(s).`
                                                : `Aliases loaded for ${applied} topic(s).`
                                        );
                                        setBulkAliasesText('');
                                    };

                                    const applyBulkFeedbacks = () => {
                                        const pairs = parseTopicValueLines(bulkFeedbacksText);
                                        if (pairs.length === 0) {
                                            setBulkFeedbacksError(
                                                lang === 'es'
                                                    ? 'Formato inválido. Usá "Tema: mensaje de feedback" por línea.'
                                                    : 'Invalid format. Use one line per "Topic: feedback message".'
                                            );
                                            setBulkFeedbacksStatus(null);
                                            return;
                                        }

                                        const currentMap = { ...(currentTopicConfig.topic_feedbacks || {}) };
                                        const touchedTopics: string[] = [];
                                        let applied = 0;
                                        for (const pair of pairs) {
                                            currentMap[pair.topic] = pair.value;
                                            touchedTopics.push(pair.topic);
                                            applied += 1;
                                        }

                                        const mergedTopics = Array.from(new Set([...(questionBank.topics || []), ...touchedTopics]));
                                        onChange({
                                            ...config,
                                            question_bank: { ...questionBank, topics: mergedTopics } as BotConfig['question_bank'],
                                            evaluation_config: {
                                                ...currentEvalConfig,
                                                topic_config: {
                                                    ...currentTopicConfig,
                                                    topic_feedbacks: currentMap,
                                                },
                                            } as BotConfig['evaluation_config'],
                                        });
                                        setBulkFeedbacksError(null);
                                        setBulkFeedbacksStatus(
                                            lang === 'es'
                                                ? `Feedbacks cargados para ${applied} tema(s).`
                                                : `Feedbacks loaded for ${applied} topic(s).`
                                        );
                                        setBulkFeedbacksText('');
                                    };

                                    return (
                                        <>
                                            <div className="flex flex-wrap gap-6">
                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                                        checked={currentTopicConfig.enabled}
                                                        onChange={(e) => updateTopicConfig({ enabled: e.target.checked })}
                                                    />
                                                    {lang === 'es' ? 'Activar selección por tema' : 'Enable topic selection'}
                                                </label>

                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                                        checked={Boolean(currentTopicConfig.enforce_single_task)}
                                                        onChange={(e) => updateTopicConfig({ enforce_single_task: e.target.checked })}
                                                    />
                                                    {lang === 'es' ? 'Exigir una sola tarea' : 'Require single task'}
                                                </label>

                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                                        checked={!currentTopicConfig.skip_confirmation}
                                                        onChange={(e) => updateTopicConfig({ skip_confirmation: !e.target.checked })}
                                                    />
                                                    {lang === 'es' ? 'Confirmar tema detectado' : 'Confirm detected topic'}
                                                </label>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500">
                                                    {lang === 'es' ? 'Mensaje del router (visible)' : 'Router message (visible)'}
                                                </Label>
                                                <Input
                                                    className="h-9 text-sm bg-slate-50"
                                                    value={currentTopicConfig.ask_template || ''}
                                                    placeholder={lang === 'es'
                                                        ? 'Texto que inicia el enrutamiento. Pedí tarea/rol/tema de forma concreta en una sola pregunta.'
                                                        : 'Opening text for routing. Ask task/role/topic clearly in a single question.'}
                                                    onChange={(e) => updateTopicConfig({ ask_template: e.target.value })}
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500">
                                                    {lang === 'es' ? 'Mensaje de confirmación (visible)' : 'Confirmation message (visible)'}
                                                </Label>
                                                <Input
                                                    className="h-9 text-sm bg-slate-50"
                                                    value={currentTopicConfig.confirm_template || ''}
                                                    placeholder={lang === 'es'
                                                        ? 'Texto para confirmar el tema detectado. Podés usar {topic} para insertar el valor.'
                                                        : 'Text to confirm detected topic. You can use {topic} to inject value.'}
                                                    onChange={(e) => updateTopicConfig({ confirm_template: e.target.value })}
                                                />
                                            </div>

                                            <div className="pt-2 border-t border-slate-100">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSection('topic_router_optional')}
                                                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-700"
                                                >
                                                    <span>{lang === 'es' ? 'Opcional: alias y feedback por tema' : 'Optional: aliases and topic feedback'}</span>
                                                    {expandedSections.has('topic_router_optional') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </button>
                                                {expandedSections.has('topic_router_optional') && (
                                                    <div className="space-y-4 mt-3">
                                                        <div className="space-y-2">
                                                            <Label className="text-xs text-slate-500 block">
                                                                {lang === 'es' ? 'Alias por tema' : 'Aliases by topic'}
                                                            </Label>
                                                            <p className="text-[11px] text-slate-500">
                                                                {lang === 'es'
                                                                    ? 'Cargá sinónimos para mejorar detección. Formato masivo: Tema: alias1, alias2'
                                                                    : 'Add synonyms to improve detection. Bulk format: Topic: alias1, alias2'}
                                                            </p>
                                                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                                                {topicOptions.map((topic: string) => (
                                                                    <div key={`aliases-${topic}`} className="flex gap-2 items-start">
                                                                        <div className="min-w-[130px] pt-2">
                                                                            <span className="text-xs font-medium bg-slate-100 px-2 py-1 rounded text-slate-600 block truncate" title={topic}>
                                                                                {topic}
                                                                            </span>
                                                                        </div>
                                                                        <Input
                                                                            className="h-8 text-xs flex-1"
                                                                            placeholder={lang === 'es'
                                                                                ? 'Sinónimos separados por coma o salto de línea'
                                                                                : 'Synonyms separated by comma or newline'}
                                                                            value={(currentTopicConfig.topic_aliases?.[topic] || []).join(', ')}
                                                                            onChange={(e) => {
                                                                                const currentMap = currentTopicConfig.topic_aliases || {};
                                                                                updateTopicConfig({
                                                                                    topic_aliases: {
                                                                                        ...currentMap,
                                                                                        [topic]: parseListInput(e.target.value),
                                                                                    },
                                                                                });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <textarea
                                                                className="w-full h-20 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono"
                                                                value={bulkAliasesText}
                                                                onChange={(e) => setBulkAliasesText(e.target.value)}
                                                                placeholder={lang === 'es'
                                                                    ? 'Carga masiva:\nOficial Soldador: soldar, soldadura, oxicorte\nOperador de Amoladora: amoladora, radial, esmeril'
                                                                    : 'Bulk load:\nWelder: weld, welding\nGrinder Operator: grinder, radial'}
                                                            />
                                                            <div className="flex gap-2">
                                                                <Button size="sm" onClick={applyBulkAliases}>
                                                                    {lang === 'es' ? 'Cargar alias' : 'Load aliases'}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setBulkAliasesText('');
                                                                        setBulkAliasesError(null);
                                                                        setBulkAliasesStatus(null);
                                                                    }}
                                                                >
                                                                    {lang === 'es' ? 'Limpiar' : 'Clear'}
                                                                </Button>
                                                            </div>
                                                            {bulkAliasesError && <p className="text-[11px] text-red-600">{bulkAliasesError}</p>}
                                                            {bulkAliasesStatus && !bulkAliasesError && <p className="text-[11px] text-emerald-700">{bulkAliasesStatus}</p>}
                                                        </div>

                                                        <div className="space-y-2 pt-2 border-t border-slate-100">
                                                            <Label className="text-xs text-slate-500 block">
                                                                {lang === 'es' ? 'Feedback inicial por tema' : 'Initial feedback by topic'}
                                                            </Label>
                                                            <p className="text-[11px] text-slate-500">
                                                                {lang === 'es'
                                                                    ? 'Mensaje opcional que se muestra al confirmar tema, antes de la primera pregunta.'
                                                                    : 'Optional message shown after topic confirmation, before first question.'}
                                                            </p>
                                                            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                                                {topicOptions.map((topic: string) => (
                                                                    <div key={topic} className="flex gap-2 items-start">
                                                                        <div className="min-w-[130px] pt-2">
                                                                            <span className="text-xs font-medium bg-slate-100 px-2 py-1 rounded text-slate-600 block truncate" title={topic}>
                                                                                {topic}
                                                                            </span>
                                                                        </div>
                                                                        <Input
                                                                            className="h-8 text-xs flex-1"
                                                                            placeholder={lang === 'es'
                                                                                ? 'Mensaje opcional para este tema'
                                                                                : 'Optional message for this topic'}
                                                                            value={currentTopicConfig.topic_feedbacks?.[topic] || ''}
                                                                            onChange={(e) => {
                                                                                const currentMap = currentTopicConfig.topic_feedbacks || {};
                                                                                updateTopicConfig({
                                                                                    topic_feedbacks: {
                                                                                        ...currentMap,
                                                                                        [topic]: e.target.value
                                                                                    }
                                                                                });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <textarea
                                                                className="w-full h-20 bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-mono"
                                                                value={bulkFeedbacksText}
                                                                onChange={(e) => setBulkFeedbacksText(e.target.value)}
                                                                placeholder={lang === 'es'
                                                                    ? 'Carga masiva:\nOficial Soldador: Vamos a trabajar con foco en soldadura segura.\nOperador de Amoladora: Revisemos controles de proyección y EPP.'
                                                                    : 'Bulk load:\nWelder: We will focus on safe welding controls.\nGrinder Operator: Let’s review projection and PPE controls.'}
                                                            />
                                                            <div className="flex gap-2">
                                                                <Button size="sm" onClick={applyBulkFeedbacks}>
                                                                    {lang === 'es' ? 'Cargar feedbacks' : 'Load feedbacks'}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setBulkFeedbacksText('');
                                                                        setBulkFeedbacksError(null);
                                                                        setBulkFeedbacksStatus(null);
                                                                    }}
                                                                >
                                                                    {lang === 'es' ? 'Limpiar' : 'Clear'}
                                                                </Button>
                                                            </div>
                                                            {bulkFeedbacksError && <p className="text-[11px] text-red-600">{bulkFeedbacksError}</p>}
                                                            {bulkFeedbacksStatus && !bulkFeedbacksError && <p className="text-[11px] text-emerald-700">{bulkFeedbacksStatus}</p>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="pt-2 border-t border-slate-100">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSection('topic_router_advanced')}
                                                    className="w-full flex items-center justify-between text-xs font-semibold text-slate-700"
                                                >
                                                    <span>{lang === 'es' ? 'Avanzado (opcional)' : 'Advanced (optional)'}</span>
                                                    {expandedSections.has('topic_router_advanced') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                                </button>
                                                {expandedSections.has('topic_router_advanced') && (
                                                    <div className="space-y-3 mt-3">
                                                        <div className="flex flex-wrap gap-6">
                                                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                                                    checked={currentTopicConfig.use_router_llm}
                                                                    onChange={(e) => updateTopicConfig({ use_router_llm: e.target.checked })}
                                                                />
                                                                {lang === 'es' ? 'Usar router IA para detectar tema' : 'Use AI router to detect topic'}
                                                            </label>
                                                            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                                                                    checked={currentTopicConfig.allow_topic_correction !== false}
                                                                    onChange={(e) => updateTopicConfig({ allow_topic_correction: e.target.checked })}
                                                                />
                                                                {lang === 'es' ? 'Permitir corrección de tema' : 'Allow topic correction'}
                                                            </label>
                                                        </div>
                                                        <Input
                                                            className="h-9 text-xs bg-slate-50"
                                                            value={currentTopicConfig.no_topic_template || ''}
                                                            placeholder={lang === 'es'
                                                                ? 'Mensaje cuando no se logra detectar un tema con suficiente claridad.'
                                                                : 'Message shown when no clear topic can be detected.'}
                                                            onChange={(e) => updateTopicConfig({ no_topic_template: e.target.value })}
                                                        />
                                                        <Input
                                                            className="h-9 text-xs bg-slate-50"
                                                            value={currentTopicConfig.correction_prompt_template || ''}
                                                            placeholder={lang === 'es'
                                                                ? 'Mensaje para pedir nueva especificación de tarea/tema.'
                                                                : 'Message requesting task/topic clarification.'}
                                                            onChange={(e) => updateTopicConfig({ correction_prompt_template: e.target.value })}
                                                        />
                                                        <Input
                                                            className="h-9 text-xs bg-slate-50"
                                                            value={currentTopicConfig.single_task_template || ''}
                                                            placeholder={lang === 'es'
                                                                ? 'Mensaje cuando el usuario declara más de una tarea y se exige una sola.'
                                                                : 'Message for multi-task input when single-task mode is required.'}
                                                            onChange={(e) => updateTopicConfig({ single_task_template: e.target.value })}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>


                        {/* Global Blockers */}
                        <GlobalBlockersEditor
                            globalTriggers={(config.global_triggers || []) as FlowStep[]}
                            sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                            onChange={(newGlobals, newVars) => onChange({
                                ...config,
                                global_triggers: newGlobals as BotConfig['global_triggers'],
                                session_vars: newVars as BotConfig['session_vars'],
                            })}
                            lang={lang}
                            title={l.flow_advanced}
                            description={l.flow_advanced_desc}
                            tooltipTitle={l.flow_advanced}
                            tooltipContent={l.flow_advanced_desc}
                        />

                        {/* Evaluation Config */}
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 bg-slate-50 p-3 rounded-xl">
                            <div className="md:col-span-5 flex items-center gap-4 border-b border-slate-200 pb-2 mb-2">
                                <Label className="text-xs font-bold text-slate-700">
                                    {lang === 'es' ? 'Modo de Selección:' : 'Selection Mode:'}
                                </Label>
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                                        <input
                                            type="radio"
                                            name="eval_mode"
                                            checked={config.evaluation_config?.mode !== 'sequence'}
                                            onChange={() => updateConfig('evaluation_config', { ...config.evaluation_config, mode: 'standard' } as BotConfig['evaluation_config'])}
                                        />
                                        {lang === 'es' ? 'Estándar (Buckets)' : 'Standard (Buckets)'}
                                    </label>
                                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                                        <input
                                            type="radio"
                                            name="eval_mode"
                                            checked={config.evaluation_config?.mode === 'sequence'}
                                            onChange={() => updateConfig('evaluation_config', { ...config.evaluation_config, mode: 'sequence' } as BotConfig['evaluation_config'])}
                                        />
                                        {lang === 'es' ? 'Secuencial (Playlist)' : 'Sequential (Playlist)'}
                                    </label>
                                </div>
                            </div>

                            {config.evaluation_config?.mode === 'sequence' ? (
                                <div className="md:col-span-5">
                                    {sequenceEditor}
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <Label className="text-[10px] text-slate-500">{l.mandatory_count}</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            value={selectionConfig.mandatory_count}
                                            onChange={(e) => updateEvaluationSelection({ mandatory_count: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500">{l.random_count}</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            value={selectionConfig.random_count}
                                            onChange={(e) => updateEvaluationSelection({ random_count: Math.max(0, parseInt(e.target.value || '0', 10) || 0) })}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500">{l.order_mode}</Label>
                                        <select
                                            value={selectionConfig.order_mode}
                                            onChange={(e) => updateEvaluationSelection({ order_mode: e.target.value as 'mandatory_first' | 'random_first' | 'mixed' })}
                                            className="w-full h-8 rounded border border-slate-200 px-2 text-xs"
                                        >
                                            <option value="mandatory_first">{l.order_mandatory_first}</option>
                                            <option value="random_first">{l.order_random_first}</option>
                                            <option value="mixed">{l.order_mixed}</option>
                                        </select>
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-2 text-xs text-slate-600">
                                            <input
                                                type="checkbox"
                                                checked={selectionConfig.by_topic}
                                                onChange={(e) => updateEvaluationSelection({ by_topic: e.target.checked })}
                                                className="rounded"
                                            />
                                            {l.by_topic}
                                        </label>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500">
                                            {lang === 'es' ? 'Evaluación semántica' : 'Semantic evaluation'}
                                        </Label>
                                        <select
                                            value={selectionConfig.semantic_mode}
                                            onChange={(e) => updateEvaluationSelection({ semantic_mode: e.target.value as 'ambiguous_only' | 'always' })}
                                            className="w-full h-8 rounded border border-slate-200 px-2 text-xs"
                                        >
                                            <option value="ambiguous_only">
                                                {lang === 'es' ? 'Solo ambigüedad (rápido)' : 'Ambiguous only (faster)'}
                                            </option>
                                            <option value="always">
                                                {lang === 'es' ? 'Siempre LLM (más semántico)' : 'Always LLM (more semantic)'}
                                            </option>
                                        </select>
                                    </div>
                                    <div>
                                        <Label className="text-[10px] text-slate-500">{l.question_type_order}</Label>
                                        <select
                                            value={selectionConfig.question_type_order}
                                            onChange={(e) => updateEvaluationSelection({ question_type_order: e.target.value as 'any' | 'teorica_first' | 'practica_first' })}
                                            className="w-full h-8 rounded border border-slate-200 px-2 text-xs"
                                        >
                                            <option value="any">{l.question_type_any}</option>
                                            <option value="teorica_first">{l.question_type_teorica_first}</option>
                                            <option value="practica_first">{l.question_type_practica_first}</option>
                                        </select>
                                    </div>
                                    <div className="flex items-end">
                                        <label className="flex items-center gap-2 text-xs text-slate-600">
                                            <input
                                                type="checkbox"
                                                checked={selectionConfig.show_question_counter}
                                                onChange={(e) => updateEvaluationSelection({ show_question_counter: e.target.checked })}
                                                className="rounded"
                                            />
                                            {l.show_question_counter}
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>
                        {
                            config.evaluation_config?.mode !== 'sequence' && (
                                <p className="text-[10px] text-slate-500">
                                    {lang === 'es'
                                        ? 'Todas las entradas del banco se tratan como "preguntas". Puedes ordenar por tipo y definir cuántas aleatorias usar.'
                                        : 'All bank entries are treated as "questions". You can order by type and define how many random ones to use.'}
                                </p>
                            )
                        }

                        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-slate-600">
                                    {lang === 'es' ? 'Mensajes Intermedios (Descanso)' : 'Intermission Messages'}
                                </Label>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        const next = [...interstitialMessages, {
                                            id: `break_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                            after_question_number: 1,
                                            message: '',
                                            topics: [],
                                            enabled: true,
                                            wait_for_user: false,
                                            continue_prompt: '',
                                        }];
                                        updateInterstitialMessages(next);
                                    }}
                                >
                                    <Plus className="h-3 w-3 mr-1" />
                                    {lang === 'es' ? 'Agregar mensaje' : 'Add message'}
                                </Button>
                            </div>
                            <p className="text-[11px] text-slate-500">
                                {lang === 'es'
                                    ? 'Opcional. Se disparan después de la pregunta N y antes de la siguiente. Si activás "Esperar respuesta", el bot pausa hasta que el usuario confirme.'
                                    : 'Optional. They fire after question N and before the next one. If "Wait for response" is enabled, the bot pauses until the user confirms.'}
                            </p>
                            <div className="space-y-2 max-h-56 overflow-y-auto">
                                {interstitialMessages.length === 0 && (
                                    <p className="text-[11px] text-slate-400">
                                        {lang === 'es'
                                            ? 'No hay mensajes intermedios configurados.'
                                            : 'No intermission messages configured.'}
                                    </p>
                                )}
                                        {interstitialMessages.map((item, idx) => (
                                            <div key={item.id || idx} className="border border-slate-200 rounded-lg p-2 space-y-2 bg-slate-50">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
                                            <div>
                                                <Label className="text-[10px] text-slate-500">
                                                    {lang === 'es' ? 'Después de la pregunta Nº' : 'After question #'}
                                                </Label>
                                                <Input
                                                    type="number"
                                                    min={1}
                                                    value={item.after_question_number || 1}
                                                    onChange={(e) => {
                                                        const next = [...interstitialMessages];
                                                        next[idx] = {
                                                            ...item,
                                                            after_question_number: Math.max(1, parseInt(e.target.value || '1', 10) || 1),
                                                        };
                                                        updateInterstitialMessages(next);
                                                    }}
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <Label className="text-[10px] text-slate-500">
                                                    {lang === 'es' ? 'Temas (opcional)' : 'Topics (optional)'}
                                                </Label>
                                                <Input
                                                    value={Array.isArray(item.topics) ? item.topics.join(', ') : ''}
                                                    onChange={(e) => {
                                                        const next = [...interstitialMessages];
                                                        next[idx] = {
                                                            ...item,
                                                            topics: parseListInput(e.target.value),
                                                        };
                                                        updateInterstitialMessages(next);
                                                    }}
                                                    placeholder={lang === 'es'
                                                        ? 'vacío = todos los temas'
                                                        : 'empty = all topics'}
                                                    className="h-8 text-xs"
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-1 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.wait_for_user === true}
                                                        onChange={(e) => {
                                                            const next = [...interstitialMessages];
                                                            next[idx] = { ...item, wait_for_user: e.target.checked };
                                                            updateInterstitialMessages(next);
                                                        }}
                                                    />
                                                    {lang === 'es' ? 'Esperar respuesta' : 'Wait for response'}
                                                </label>
                                                <label className="flex items-center gap-1 text-xs">
                                                    <input
                                                        type="checkbox"
                                                        checked={item.enabled !== false}
                                                        onChange={(e) => {
                                                            const next = [...interstitialMessages];
                                                            next[idx] = { ...item, enabled: e.target.checked };
                                                            updateInterstitialMessages(next);
                                                        }}
                                                    />
                                                    {lang === 'es' ? 'Activo' : 'Enabled'}
                                                </label>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-red-500"
                                                    onClick={() => {
                                                        const next = interstitialMessages.filter((_, i) => i !== idx);
                                                        updateInterstitialMessages(next);
                                                    }}
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                        <textarea
                                            value={item.message || ''}
                                            onChange={(e) => {
                                                const next = [...interstitialMessages];
                                                next[idx] = { ...item, message: e.target.value };
                                                updateInterstitialMessages(next);
                                            }}
                                            placeholder={lang === 'es'
                                                ? 'Ej: ¡Excelente! Completaste la teoría. Ahora vamos con los casos prácticos.'
                                                : 'E.g.: Great! You finished theory. Now let’s move to practical cases.'}
                                            className="text-xs min-h-14 w-full border border-slate-200 rounded-md px-3 py-2 bg-white"
                                        />
                                        {item.wait_for_user === true && (
                                            <Input
                                                value={item.continue_prompt || ''}
                                                onChange={(e) => {
                                                    const next = [...interstitialMessages];
                                                    next[idx] = { ...item, continue_prompt: e.target.value };
                                                    updateInterstitialMessages(next);
                                                }}
                                                placeholder={lang === 'es'
                                                    ? 'Prompt de continuación (opcional). Ej: ¿Continuamos?'
                                                    : 'Continue prompt (optional). E.g.: Continue?'}
                                                className="h-8 text-xs"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Question Bank */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs font-bold text-slate-600">{l.question_bank}</Label>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">
                                        {questionBank.questions.length} {lang === 'es' ? 'preguntas' : 'questions'}
                                    </span>
                                    {examinerCriticalCount > 0 && (
                                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                                            {lang === 'es' ? `${examinerCriticalCount} crítico(s)` : `${examinerCriticalCount} critical`}
                                        </span>
                                    )}
                                    {examinerWarningCount > 0 && (
                                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                                            {examinerWarningCount} warning(s)
                                        </span>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const visible = questionBank.questions
                                                .map((q, idx) => ({ q, idx }))
                                                .filter(({ q }) => questionTypeFilter === 'all' || q.type === questionTypeFilter)
                                                .map(({ q, idx }) => resolveQuestionUiKey(q, idx));
                                            setExpandedQuestionRows((prev) => {
                                                const next = new Set(prev);
                                                visible.forEach((key) => next.add(key));
                                                return next;
                                            });
                                        }}
                                    >
                                        {lang === 'es' ? 'Expandir todo' : 'Expand all'}
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const visible = new Set(
                                                questionBank.questions
                                                    .map((q, idx) => ({ q, idx }))
                                                    .filter(({ q }) => questionTypeFilter === 'all' || q.type === questionTypeFilter)
                                                    .map(({ q, idx }) => resolveQuestionUiKey(q, idx))
                                            );
                                            setExpandedQuestionRows((prev) => {
                                                const next = new Set(prev);
                                                visible.forEach((key) => next.delete(key));
                                                return next;
                                            });
                                        }}
                                    >
                                        {lang === 'es' ? 'Colapsar todo' : 'Collapse all'}
                                    </Button>
                                </div>
                            </div>

                            {examinerQuestionIssues.length > 0 && (
                                <div className={cn(
                                    "rounded-xl border p-3 mb-3 space-y-2",
                                    examinerCriticalCount > 0
                                        ? "border-red-200 bg-red-50/70"
                                        : "border-amber-200 bg-amber-50/70"
                                )}>
                                    <p className={cn(
                                        "text-xs font-bold",
                                        examinerCriticalCount > 0
                                            ? "text-red-700"
                                            : "text-amber-800"
                                    )}>
                                        {examinerCriticalCount > 0
                                            ? (lang === 'es'
                                                ? `Preguntas con errores críticos (${examinerCriticalCount})`
                                                : `Questions with critical issues (${examinerCriticalCount})`)
                                            : (lang === 'es'
                                                ? `Preguntas con warnings (${examinerWarningCount})`
                                                : `Questions with warnings (${examinerWarningCount})`)}
                                    </p>
                                    {examinerQuestionIssues.slice(0, 8).map((issue, issueIndex) => (
                                        <button
                                            key={`${issue.questionIndex}-${issue.severity}-${issueIndex}`}
                                            type="button"
                                            onClick={() => focusExaminerIssue(issue)}
                                            className={cn(
                                                "w-full text-left rounded-lg border bg-white px-3 py-2 text-xs",
                                                issue.severity === 'critical'
                                                    ? "border-red-200 text-red-700"
                                                    : "border-amber-200 text-amber-800"
                                            )}
                                        >
                                            {issue.message}
                                        </button>
                                    ))}
                                    {examinerQuestionIssues.length > 8 && (
                                        <p className="text-[11px] text-slate-500">
                                            {lang === 'es'
                                                ? `+${examinerQuestionIssues.length - 8} issue(s) más`
                                                : `+${examinerQuestionIssues.length - 8} more issue(s)`}
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-slate-500">{lang === 'es' ? 'Vista:' : 'View:'}</span>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={questionTypeFilter === 'all' ? 'default' : 'outline'}
                                    onClick={() => setQuestionTypeFilter('all')}
                                >
                                    {lang === 'es' ? 'Todas' : 'All'}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={questionTypeFilter === 'teorica' ? 'default' : 'outline'}
                                    onClick={() => setQuestionTypeFilter('teorica')}
                                >
                                    {lang === 'es' ? 'Teóricas' : 'Theoretical'}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={questionTypeFilter === 'practica' ? 'default' : 'outline'}
                                    onClick={() => setQuestionTypeFilter('practica')}
                                >
                                    {lang === 'es' ? 'Casos prácticos' : 'Practical cases'}
                                </Button>
                            </div>

                            <div className="space-y-2 max-h-80 overflow-y-auto">
                                {questionBank.questions
                                    .map((q: ExaminerQuestion, index: number) => ({ q, index }))
                                    .filter(({ q }) => questionTypeFilter === 'all' || q.type === questionTypeFilter)
                                    .map(({ q, index }) => {
                                        const rowKey = resolveQuestionUiKey(q, index);
                                        const isExpanded = expandedQuestionRows.has(rowKey);
                                        return (
                                            <QuestionRow
                                                key={rowKey}
                                                q={q}
                                                index={index}
                                                topics={questionBank.topics}
                                                issues={examinerQuestionIssuesByIndex.get(index) || []}
                                                onUpdate={updateQuestion}
                                                onDelete={deleteQuestion}
                                                expanded={isExpanded}
                                                onToggle={() => {
                                                    setExpandedQuestionRows((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(rowKey)) next.delete(rowKey);
                                                        else next.add(rowKey);
                                                        return next;
                                                    });
                                                }}
                                                l={l}
                                                p={p}
                                                lang={lang}
                                            />
                                        );
                                    })}
                            </div>

                            <Button variant="outline" size="sm" onClick={addQuestion} className="w-full mt-2">
                                <Plus className="h-3 w-3 mr-1" /> {l.add_question}
                            </Button>
                        </div>

                    </CardContent >
                </Card >
                {imageTriggersSection}
            </div >
        );
    }

    // ===== DETECTOR =====
    if (botType === 'DETECTOR') {
        const detectorOptions = (config.detector_options || {}) as {
            reference_mode?: 'step_flags' | 'single_priority' | 'none';
            include_reference_in_final_report?: boolean;
            correction_reclassify_enabled?: boolean;
            correction_requires_new_image?: boolean;
            correction_patterns?: string[];
            final_verdict_template?: string;
            verdict_labels?: {
                habilitado?: string;
                habilitado_con_observaciones?: string;
                no_habilitado?: string;
                informacion_insuficiente?: string;
            };
        };
        const updateDetectorOptions = (updates: Partial<typeof detectorOptions>) => {
            updateConfig('detector_options', {
                ...detectorOptions,
                ...updates,
            } as BotConfig['detector_options']);
        };
        const stepDataVariables = Array.from(new Set(
            ((config.detection_steps || []) as Array<{ id?: string }>)
                .map((step) => (typeof step.id === 'string' ? step.id.trim() : ''))
                .filter(Boolean)
                .map((stepId) => `data.${stepId}`)
        ));
        const baseTemplateVariables = lang === 'es'
            ? [
                'veredicto',
                'severidad_global',
                'hallazgos_total',
                'hallazgos_critical',
                'hallazgos_warning',
                'hallazgos_uncertain',
                'hallazgos_ok',
                'hallazgos_no_ok',
                'hallazgos_ok_detalle',
                'proximo_paso',
                'proxima_accion',
                'datos_relevados',
                'referencia_visual',
            ]
            : [
                'veredicto',
                'global_severity',
                'findings_total',
                'findings_critical',
                'findings_warning',
                'findings_uncertain',
                'findings_ok',
                'findings_not_ok',
                'findings_ok_detail',
                'next_step',
                'next_action',
                'data',
                'visual_reference',
            ];
        const templateVariables = [...baseTemplateVariables, ...stepDataVariables];

        return (
            <div className={editorSurfaceClass}>
                {introMessageSection}

                <Card className="bg-gradient-to-r from-emerald-50 to-card border-emerald-200/40 rounded-2xl dark:from-emerald-950/20 dark:border-emerald-500/20">
                    <CardHeader className="py-4 px-5">
                        <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                            <Brain className="h-4 w-4 text-emerald-600" />
                            {l.detector}
                            <HelpTooltip
                                title={lang === 'es' ? 'Detector' : 'Detector'}
                                content={lang === 'es'
                                    ? 'Definí pasos de validación (texto/imagen) y feedback por severidad para un flujo guiado de detección.'
                                    : 'Define validation steps (text/image) and severity-based feedback for a guided detection flow.'}
                            />
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-600 dark:text-slate-300">{l.detector_desc}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-xs font-bold text-slate-600 mb-2 block">
                                {l.detection_criteria}
                            </Label>
                            <LocalTextarea
                                value={config.detection_criteria || ''}
                                onCommit={(val) => updateConfig('detection_criteria', val)}
                                placeholder={p.detection_criteria}
                                className="w-full h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs focus:ring-2 focus:ring-emerald-200/40 outline-none transition-all"
                            />
                        </div>

                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-white/70 dark:bg-slate-900/40 space-y-3">
                            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {lang === 'es' ? 'Opciones avanzadas (opcionales)' : 'Advanced options (optional)'}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[11px] text-slate-600 flex items-center gap-1">
                                        {lang === 'es' ? 'Política de referencias visuales' : 'Visual reference policy'}
                                        <HelpTooltip
                                            title={lang === 'es' ? 'Política de referencias visuales' : 'Visual reference policy'}
                                            content={lang === 'es'
                                                ? 'Define cómo se muestran imágenes de referencia en respuestas y reporte final. "1 por prioridad" limita a una sola referencia y prioriza CRITICAL > WARNING > UNCERTAIN; "Por paso" respeta los checks "Mostrar Ref." de cada paso; "No mostrar" desactiva referencias.'
                                                : 'Controls how reference images appear in responses and final report. "1 by severity priority" limits to one reference and prioritizes CRITICAL > WARNING > UNCERTAIN; "Per-step flags" uses each step "Show Ref." toggles; "Do not show" disables references.'}
                                        />
                                    </Label>
                                    <Select
                                        value={detectorOptions.reference_mode || 'single_priority'}
                                        onValueChange={(value: 'step_flags' | 'single_priority' | 'none') => updateDetectorOptions({ reference_mode: value })}
                                    >
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="single_priority">{lang === 'es' ? '1 por prioridad de severidad' : '1 by severity priority'}</SelectItem>
                                            <SelectItem value="step_flags">{lang === 'es' ? 'Según flags del paso' : 'Per-step flags'}</SelectItem>
                                            <SelectItem value="none">{lang === 'es' ? 'No mostrar referencias' : 'Do not show references'}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px] text-slate-600">
                                    {lang === 'es' ? 'Textos de veredicto (opcionales, por defecto se autocompletan)' : 'Verdict labels (optional, defaults are auto-filled)'}
                                </Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <Input
                                        value={detectorOptions.verdict_labels?.habilitado || ''}
                                        onChange={(e) => updateDetectorOptions({
                                            verdict_labels: {
                                                ...detectorOptions.verdict_labels,
                                                habilitado: e.target.value,
                                            },
                                        })}
                                        placeholder={lang === 'es' ? 'HABILITADO' : 'ENABLED'}
                                        className="h-8 text-xs"
                                    />
                                    <Input
                                        value={detectorOptions.verdict_labels?.habilitado_con_observaciones || ''}
                                        onChange={(e) => updateDetectorOptions({
                                            verdict_labels: {
                                                ...detectorOptions.verdict_labels,
                                                habilitado_con_observaciones: e.target.value,
                                            },
                                        })}
                                        placeholder={lang === 'es' ? 'HABILITADO CON OBSERVACIONES' : 'ENABLED WITH OBSERVATIONS'}
                                        className="h-8 text-xs"
                                    />
                                    <Input
                                        value={detectorOptions.verdict_labels?.no_habilitado || ''}
                                        onChange={(e) => updateDetectorOptions({
                                            verdict_labels: {
                                                ...detectorOptions.verdict_labels,
                                                no_habilitado: e.target.value,
                                            },
                                        })}
                                        placeholder={lang === 'es' ? 'NO HABILITADO' : 'NOT ENABLED'}
                                        className="h-8 text-xs"
                                    />
                                    <Input
                                        value={detectorOptions.verdict_labels?.informacion_insuficiente || ''}
                                        onChange={(e) => updateDetectorOptions({
                                            verdict_labels: {
                                                ...detectorOptions.verdict_labels,
                                                informacion_insuficiente: e.target.value,
                                            },
                                        })}
                                        placeholder={lang === 'es' ? 'INFORMACIÓN INSUFICIENTE' : 'INSUFFICIENT INFORMATION'}
                                        className="h-8 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-[11px] text-slate-600">
                                    {lang === 'es'
                                        ? 'Plantilla del resumen final (editable)'
                                        : 'Final summary template (editable)'}
                                </Label>
                                <TemplateTextareaWithVariables
                                    value={detectorOptions.final_verdict_template || ''}
                                    onCommit={(val) => updateDetectorOptions({ final_verdict_template: val })}
                                    placeholder={lang === 'es'
                                        ? 'Ej: Luego de verificar tu andamio, el veredicto es {veredicto}. Severidad: {severidad_global}. Hallazgos críticos: {hallazgos_critical}. Próximo paso: {proximo_paso}.'
                                        : 'Example: After checking your scaffold, the verdict is {veredicto}. Severity: {global_severity}. Critical findings: {findings_critical}. Next step: {next_step}.'}
                                    className="w-full min-h-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs focus:ring-2 focus:ring-emerald-200/40 outline-none transition-all"
                                    variables={templateVariables}
                                    helper={lang === 'es'
                                        ? 'Tip: si esta plantilla tiene contenido, el chat final mostrará solo este texto renderizado. Hacé clic en una variable para insertarla donde tengas el cursor. Para datos de pasos, usá {data.<id_del_paso>} o los botones data.* disponibles.'
                                        : 'Tip: if this template has content, final chat output will only show this rendered text. Click a variable to insert it at the cursor position. For step data, use {data.<step_id>} or the available data.* buttons.'}
                                />
                            </div>

                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={detectorOptions.include_reference_in_final_report !== false}
                                    onChange={(e) => updateDetectorOptions({ include_reference_in_final_report: e.target.checked })}
                                />
                                {lang === 'es' ? 'Incluir referencia visual en reporte final (máximo 1)' : 'Include visual reference in final report (max 1)'}
                            </label>

                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={detectorOptions.correction_reclassify_enabled !== false}
                                    onChange={(e) => updateDetectorOptions({ correction_reclassify_enabled: e.target.checked })}
                                />
                                {lang === 'es' ? 'Reclasificar automáticamente si el usuario corrige un hallazgo' : 'Auto-reclassify when user corrects a finding'}
                            </label>

                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={detectorOptions.correction_requires_new_image !== false}
                                    onChange={(e) => updateDetectorOptions({ correction_requires_new_image: e.target.checked })}
                                />
                                {lang === 'es' ? 'Al reclasificar, pedir nueva foto de detalle' : 'After reclassification, request a new detail photo'}
                            </label>

                            <div className="space-y-1">
                                <Label className="text-[11px] text-slate-600">
                                    {lang === 'es'
                                        ? 'Patrones de corrección (separados por coma, opcional)'
                                        : 'Correction patterns (comma-separated, optional)'}
                                </Label>
                                <Input
                                    value={(detectorOptions.correction_patterns || []).join(', ')}
                                    onChange={(e) => updateDetectorOptions({
                                        correction_patterns: e.target.value
                                            .split(',')
                                            .map((entry) => entry.trim())
                                            .filter(Boolean),
                                    })}
                                    placeholder={lang === 'es'
                                        ? 'ej: en realidad, eso está mal, te corrijo'
                                        : 'e.g. actually, that is wrong, correction'}
                                    className="h-8 text-xs"
                                />
                            </div>
                        </div>

                        <DetectionStepEditor
                            steps={(config.detection_steps || []) as Array<{
                                id: string;
                                order: number;
                                type: 'text' | 'image';
                                instruction: string;
                                required: boolean;
                                example_image_url?: string;
                                keywords?: string[];
                                criteria?: string;
                                feedback_ok?: string;
                                feedback_warn?: string;
                                feedback_block?: string;
                                feedback_uncertain?: string;
                                show_ref_on_warn?: boolean;
                                show_ref_on_block?: boolean;
                                show_ref_on_uncertain?: boolean;
                                allow_critical_retry?: boolean;
                                on_critical?: 'block' | 'continue_flagged';
                                run_if?: {
                                    var: string;
                                    operator?: 'equals' | 'contains_any' | 'in';
                                    value?: string;
                                    values?: string[];
                                };
                            }>}
                            onChange={(nextSteps) => updateConfig('detection_steps', nextSteps as BotConfig['detection_steps'])}
                            lang={lang}
                        />
                    </CardContent>
                </Card>

                <GlobalBlockersEditor
                    globalTriggers={(config.global_triggers || []) as FlowStep[]}
                    sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                    onChange={(newGlobals, newVars) => onChange({
                        ...config,
                        global_triggers: newGlobals as BotConfig['global_triggers'],
                        session_vars: newVars as BotConfig['session_vars'],
                    })}
                    lang={lang}
                    title={l.flow_advanced}
                    description={l.flow_advanced_desc}
                    tooltipTitle={l.flow_advanced}
                    tooltipContent={l.flow_advanced_desc}
                />

                {imageTriggersSection}
            </div>
        );
    }

    // ===== GENERIC =====
    if (botType === 'GENERIC') {
        return (
            <div className={editorSurfaceClass}>
                {/* 1. Identity & System Prompt */}
                <Card className="bg-gradient-to-r from-indigo-50 to-card border-indigo-200/40 rounded-2xl dark:from-indigo-950/20 dark:border-indigo-500/20">
                    <CardHeader className="py-4 px-5">
                        <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                            <Bot className="h-4 w-4 text-indigo-600" />
                            {lang === 'es' ? 'Identidad y Reglas' : 'Identity & Rules'}
                            <HelpTooltip
                                title="Generic"
                                content={lang === 'es'
                                    ? 'Define el comportamiento base del asistente.'
                                    : 'Define the base behavior of the assistant.'}
                            />
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-xs font-bold text-slate-600 mb-2 block">
                                {lang === 'es' ? 'Instrucciones del Sistema (System Prompt)' : 'System Instructions'}
                            </Label>
                            <LocalTextarea
                                value={config.instructions_prefix || ''}
                                onCommit={(val) => updateConfig('instructions_prefix', val)}
                                placeholder={lang === 'es'
                                    ? 'Eres un asistente útil y amable. Tu objetivo es...'
                                    : 'You are a helpful and kind assistant. Your goal is...'}
                                className="w-full h-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm font-mono focus:ring-2 focus:ring-indigo-200/40 outline-none transition-all"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Communication */}
                {introMessageSection}

                <Card className="bg-white border-slate-200 rounded-2xl">
                    <CardHeader
                        className="cursor-pointer hover:bg-slate-50 transition-colors py-4 px-5"
                        onClick={() => toggleSection('generic_messages')}
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold text-slate-800">
                                {lang === 'es' ? 'Mensajes de Cierre' : 'Closing Messages'}
                            </CardTitle>
                            {expandedSections.has('generic_messages') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                    </CardHeader>
                    {expandedSections.has('generic_messages') && (
                        <CardContent className="space-y-4 pt-0">
                            <div>
                                <Label className="text-xs text-slate-500 mb-1 block">{l.goodbye_message}</Label>
                                <LocalTextarea
                                    value={config.goodbye_message || ''}
                                    onCommit={(val) => updateConfig('goodbye_message', val)}
                                    placeholder={p.goodbye_message}
                                    className="w-full h-20 text-xs border rounded p-2"
                                />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500 mb-1 block">{l.closing_message}</Label>
                                <LocalTextarea
                                    value={config.closing_message || ''}
                                    onCommit={(val) => updateConfig('closing_message', val)}
                                    placeholder={p.closing_message}
                                    className="w-full h-20 text-xs border rounded p-2"
                                />
                            </div>
                        </CardContent>
                    )}
                </Card>

                <Card className="bg-white border-slate-200 rounded-2xl">
                    <CardHeader
                        className="cursor-pointer hover:bg-slate-50 transition-colors py-4 px-5"
                        onClick={() => toggleSection('generic_end_rules')}
                    >
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-bold text-slate-800">
                                {l.generic_termination_rules}
                            </CardTitle>
                            {expandedSections.has('generic_end_rules') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </div>
                        <CardDescription className="text-xs text-slate-500">
                            {l.generic_termination_rules_desc}
                        </CardDescription>
                    </CardHeader>
                    {expandedSections.has('generic_end_rules') && (
                        <CardContent className="space-y-4 pt-0">
                            <div>
                                <Label className="text-xs text-slate-500 mb-1 block">{l.generic_goodbye_intents}</Label>
                                <LocalTextarea
                                    value={(genericInteraction.goodbye_intent_phrases || []).join('\n')}
                                    onCommit={(val) => updateGenericInteraction({
                                        goodbye_intent_phrases: parseListInput(val),
                                    })}
                                    placeholder={p.generic_goodbye_intent_phrases}
                                    className="w-full min-h-24 text-xs border rounded p-2"
                                />
                            </div>
                            <div>
                                <Label className="text-xs text-slate-500 mb-1 block">{l.generic_closing_intents}</Label>
                                <LocalTextarea
                                    value={(genericInteraction.closing_intent_phrases || []).join('\n')}
                                    onCommit={(val) => updateGenericInteraction({
                                        closing_intent_phrases: parseListInput(val),
                                    })}
                                    placeholder={p.generic_closing_intent_phrases}
                                    className="w-full min-h-24 text-xs border rounded p-2"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={genericInteraction.ignore_question_messages !== false}
                                    onChange={(e) => updateGenericInteraction({
                                        ignore_question_messages: e.target.checked,
                                    })}
                                />
                                {l.generic_ignore_question_messages}
                            </label>
                        </CardContent>
                    )}
                </Card>

                {/* 3. Knowledge (RAG) - Handled in separate tab, but can link or explain here if needed */}

                {/* 4. Safety & Global Blockers */}
                <GlobalBlockersEditor
                    globalTriggers={(config.global_triggers || []) as FlowStep[]}
                    sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                    onChange={(newGlobals, newVars) => onChange({
                        ...config,
                        global_triggers: newGlobals as BotConfig['global_triggers'],
                        session_vars: newVars as BotConfig['session_vars'],
                    })}
                    lang={lang}
                />

                {imageTriggersSection}
            </div>
        );
    }

    return null;
}
