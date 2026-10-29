'use client';

import { type Dispatch, type SetStateAction, useMemo, useState } from 'react';
import { Brain, ChevronDown, ChevronRight, HelpCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuestionPoolPicker } from './QuestionPoolPicker';
import { ExaminerQuestionBankEditor } from './strategy-fields-examiner-question-bank';
import { HelpTooltip } from './help-tooltip';
import type { FlowStep, SessionVarConfig } from './flow-editor';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { cn, parseListInput } from '@/lib/utils';
import {
    type EvaluationSequenceItem,
    type ExaminerQuestion,
    type ExaminerQuestionLintIssue,
    type QuestionBank,
    type StrategyEditorProps,
    lintExaminerQuestionBank,
    parseTopicValueLines,
    strategyLabels,
    strategyPlaceholders,
} from './strategy-fields-model';
import {
    GlobalBlockersEditor,
    LocalTextarea,
    STRATEGY_CARD_CLASS,
    STRATEGY_CARD_CONTENT_CLASS,
    STRATEGY_EDITOR_SURFACE_CLASS,
    STRATEGY_FIELD_LABEL_CLASS,
    STRATEGY_INPUT_CLASS,
    StrategyImageTriggersSection,
    StrategyIntroMessageSection,
    STRATEGY_MONO_TEXTAREA_CLASS,
    STRATEGY_SELECT_CLASS,
    STRATEGY_SUBPANEL_CLASS,
    StrategyCountBadge,
    getStrategyHeaderClass,
} from './strategy-fields-shared';
import { StrategyEditorSection, StrategyEditorShell } from './strategy-editor-shell';

const DEFAULT_EXAMINER_EVALUATION_CONFIG: NonNullable<BotConfig['evaluation_config']> = {
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

const DEFAULT_CLOSING_CONFIG = {
    post_exam_doubt_prompt_template: '',
    post_exam_doubt_followup_template: '',
};

const DEFAULT_TOPIC_CONFIG = {
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
    topic_feedbacks: undefined,
};

export function ExaminerStrategyFields({ config, onChange, lang }: StrategyEditorProps) {
    const labels = strategyLabels[lang];
    const placeholders = strategyPlaceholders[lang];
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set([
        'topic_router_optional',
        'interstitial_messages',
    ]));
    const [newTopicName, setNewTopicName] = useState('');
    const [bulkTopicsText, setBulkTopicsText] = useState('');
    const [bulkTopicsStatus, setBulkTopicsStatus] = useState<string | null>(null);
    const [bulkTopicsError, setBulkTopicsError] = useState<string | null>(null);
    const [bulkAliasesText, setBulkAliasesText] = useState('');
    const [bulkAliasesStatus, setBulkAliasesStatus] = useState<string | null>(null);
    const [bulkAliasesError, setBulkAliasesError] = useState<string | null>(null);
    const [bulkFeedbacksText, setBulkFeedbacksText] = useState('');
    const [bulkFeedbacksStatus, setBulkFeedbacksStatus] = useState<string | null>(null);
    const [bulkFeedbacksError, setBulkFeedbacksError] = useState<string | null>(null);
    const [pickerState, setPickerState] = useState<{
        isOpen: boolean;
        mode: 'single' | 'multiple';
        initialIds: string[];
        onCommit: (ids: string[]) => void;
    }>({
        isOpen: false,
        mode: 'single',
        initialIds: [],
        onCommit: () => {},
    });

    const questionBank = useMemo<QuestionBank>(() => {
        const source = config.question_bank as QuestionBank | undefined;
        return {
            topics: Array.isArray(source?.topics) ? source.topics : [],
            questions: Array.isArray(source?.questions) ? source.questions : [],
        };
    }, [config.question_bank]);

    const configuredQuestionCount = questionBank.questions.length;
    const topicOptions = useMemo(
        () => Array.from(new Set([
            ...questionBank.topics,
            ...questionBank.questions.map((question) => (question.topic || '').trim()),
        ].map((topic) => topic.trim()).filter(Boolean))),
        [questionBank]
    );

    const examinerQuestionIssues = useMemo(
        () => lintExaminerQuestionBank({
            questions: questionBank.questions,
            topics: questionBank.topics,
            lang,
        }),
        [questionBank, lang]
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
    const examinerCriticalCount = examinerQuestionIssues.filter((issue) => issue.severity === 'critical').length;
    const examinerWarningCount = examinerQuestionIssues.filter((issue) => issue.severity === 'warning').length;

    const evaluationConfig = config.evaluation_config || DEFAULT_EXAMINER_EVALUATION_CONFIG;
    const closingConfig = evaluationConfig.closing_config || DEFAULT_CLOSING_CONFIG;
    const topicConfig = evaluationConfig.topic_config || DEFAULT_TOPIC_CONFIG;
    const selectionConfig = {
        mandatory_count: evaluationConfig.selection?.mandatory_count ?? evaluationConfig.teoricas?.mandatory ?? 2,
        random_count: evaluationConfig.selection?.random_count ?? ((evaluationConfig.teoricas?.random ?? 0) + (evaluationConfig.practicas?.count ?? 0)),
        by_topic: evaluationConfig.selection?.by_topic ?? evaluationConfig.practicas?.by_topic ?? true,
        order_mode: evaluationConfig.selection?.order_mode ?? 'mandatory_first',
        question_type_order: evaluationConfig.selection?.question_type_order ?? 'any',
        show_question_counter: evaluationConfig.selection?.show_question_counter === true,
        semantic_mode: evaluationConfig.selection?.semantic_mode ?? 'ambiguous_only',
    } as {
        mandatory_count: number;
        random_count: number;
        by_topic: boolean;
        order_mode: 'mandatory_first' | 'random_first' | 'mixed';
        question_type_order: 'any' | 'teorica_first' | 'practica_first';
        show_question_counter: boolean;
        semantic_mode: 'ambiguous_only' | 'always';
    };
    const interstitialMessages = Array.isArray(evaluationConfig.interstitial_messages)
        ? evaluationConfig.interstitial_messages
        : [];

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const updateConfig = <K extends keyof BotConfig>(field: K, value: BotConfig[K]) => {
        onChange({ ...config, [field]: value });
    };

    const updateEvaluationConfig = (nextEvaluationConfig: BotConfig['evaluation_config']) => {
        updateConfig('evaluation_config', nextEvaluationConfig);
    };

    const updateClosingConfig = (updates: Partial<typeof closingConfig>) => {
        updateEvaluationConfig({
            ...evaluationConfig,
            closing_config: {
                ...closingConfig,
                ...updates,
            },
        });
    };

    const updateTopicConfig = (updates: Partial<typeof topicConfig>) => {
        updateEvaluationConfig({
            ...evaluationConfig,
            topic_config: {
                ...topicConfig,
                ...updates,
            },
        });
    };

    const updateEvaluationSelection = (updates: Partial<typeof selectionConfig>) => {
        const next = { ...selectionConfig, ...updates };
        updateEvaluationConfig({
            ...evaluationConfig,
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

    const updateInterstitialMessages = (nextMessages: typeof interstitialMessages) => {
        updateEvaluationConfig({
            ...evaluationConfig,
            interstitial_messages: nextMessages,
        });
    };

    const addTopic = () => {
        const topic = newTopicName.trim();
        if (!topic) return;
        const mergedTopics = Array.from(new Set([...(questionBank.topics || []), topic]));
        updateConfig('question_bank', {
            ...questionBank,
            topics: mergedTopics,
        } as BotConfig['question_bank']);
        setNewTopicName('');
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
        updateConfig('question_bank', {
            ...questionBank,
            topics: mergedTopics,
        } as BotConfig['question_bank']);
        setBulkTopicsError(null);
        setBulkTopicsStatus(
            lang === 'es'
                ? `Temas cargados: +${incoming.length}. Total: ${mergedTopics.length}.`
                : `Topics loaded: +${incoming.length}. Total: ${mergedTopics.length}.`
        );
        setBulkTopicsText('');
    };

    const deleteTopic = (index: number) => {
        const updated = questionBank.topics.filter((_, currentIndex) => currentIndex !== index);
        updateConfig('question_bank', { ...questionBank, topics: updated } as BotConfig['question_bank']);
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

        const currentMap = { ...(topicConfig.topic_aliases || {}) };
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
                ...evaluationConfig,
                topic_config: {
                    ...topicConfig,
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

        const currentMap = { ...(topicConfig.topic_feedbacks || {}) };
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
                ...evaluationConfig,
                topic_config: {
                    ...topicConfig,
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
        <StrategyEditorShell strategy="EXAMINER">
            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Apertura' : 'Opening'}
                title={labels.intro_message}
                tone="primary"
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <StrategyIntroMessageSection
                        introMessage={config.intro_message}
                        onCommit={(value) => updateConfig('intro_message', value)}
                        labels={labels}
                        placeholders={placeholders}
                        lang={lang}
                        defaultExpanded={true}
                    />

                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader className={getStrategyHeaderClass('indigo')}>
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <Brain className="h-4 w-4 text-indigo-600" />
                                {lang === 'es' ? 'Inicio y ruteo visible' : 'Start and visible routing'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                            <div className="flex flex-wrap gap-6">
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={topicConfig.enabled}
                                        onChange={(e) => updateTopicConfig({ enabled: e.target.checked })}
                                    />
                                    {lang === 'es' ? 'Activar selección por tema' : 'Enable topic selection'}
                                </label>
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={!topicConfig.skip_confirmation}
                                        onChange={(e) => updateTopicConfig({ skip_confirmation: !e.target.checked })}
                                    />
                                    {lang === 'es' ? 'Confirmar tema detectado' : 'Confirm detected topic'}
                                </label>
                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        className="rounded border-slate-300"
                                        checked={Boolean(topicConfig.enforce_single_task)}
                                        onChange={(e) => updateTopicConfig({ enforce_single_task: e.target.checked })}
                                    />
                                    {lang === 'es' ? 'Exigir una sola tarea' : 'Require single task'}
                                </label>
                            </div>

                            <div className="grid gap-3 lg:grid-cols-2">
                                <div className="space-y-1">
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                        {lang === 'es' ? 'Mensaje del router (visible)' : 'Router message (visible)'}
                                    </Label>
                                    <Input
                                        className={`${STRATEGY_INPUT_CLASS} h-10 text-sm`}
                                        value={topicConfig.ask_template || ''}
                                        placeholder={lang === 'es'
                                            ? 'Texto que inicia el enrutamiento. Pedí tarea/rol/tema de forma concreta en una sola pregunta.'
                                            : 'Opening text for routing. Ask task/role/topic clearly in a single question.'}
                                        onChange={(e) => updateTopicConfig({ ask_template: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                        {lang === 'es' ? 'Mensaje de confirmación (visible)' : 'Confirmation message (visible)'}
                                    </Label>
                                    <Input
                                        className={`${STRATEGY_INPUT_CLASS} h-10 text-sm`}
                                        value={topicConfig.confirm_template || ''}
                                        placeholder={lang === 'es'
                                            ? 'Texto para confirmar el tema detectado. Podés usar {topic} para insertar el valor.'
                                            : 'Text to confirm detected topic. You can use {topic} to inject value.'}
                                        onChange={(e) => updateTopicConfig({ confirm_template: e.target.value })}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Núcleo de estrategia' : 'Strategy core'}
                title={labels.evaluator}
                tone="indigo"
                summary={(
                    <>
                        <StrategyCountBadge tone="primary">
                            {configuredQuestionCount} {lang === 'es' ? 'pregunta(s)' : 'question(s)'}
                        </StrategyCountBadge>
                        {topicOptions.length > 0 ? (
                            <StrategyCountBadge tone="slate">
                                {topicOptions.length} {lang === 'es' ? 'tema(s)' : 'topic(s)'}
                            </StrategyCountBadge>
                        ) : null}
                        {examinerCriticalCount > 0 ? (
                            <StrategyCountBadge tone="orange">
                                {examinerCriticalCount} {lang === 'es' ? 'crítico(s)' : 'critical'}
                            </StrategyCountBadge>
                        ) : null}
                        {examinerWarningCount > 0 ? (
                            <StrategyCountBadge tone="slate">
                                {examinerWarningCount} warning(s)
                            </StrategyCountBadge>
                        ) : null}
                    </>
                )}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader className={getStrategyHeaderClass('indigo')}>
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <HelpCircle className="h-4 w-4 text-primary" />
                                {lang === 'es' ? 'Temas y router' : 'Topics and router'}
                                <HelpTooltip
                                    title={lang === 'es' ? 'Router de temas' : 'Topic router'}
                                    content={lang === 'es'
                                        ? 'Controla cómo el bot entiende la tarea declarada, confirma el tema y decide qué conjunto de preguntas corresponde.'
                                        : 'Controls how the bot understands the declared task, confirms the topic, and decides which question set applies.'}
                                />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                            <div className={STRATEGY_SUBPANEL_CLASS}>
                                <Label className={`${STRATEGY_FIELD_LABEL_CLASS} flex items-center gap-1`}>
                                    {labels.topics}
                                    <HelpTooltip
                                        title={lang === 'es' ? 'Temas' : 'Topics'}
                                        content={lang === 'es'
                                            ? 'Se usan para filtrar preguntas y para el enrutamiento por tema.'
                                            : 'Used to filter questions and for topic routing.'}
                                    />
                                </Label>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {topicOptions.map((topic, index) => (
                                        <span
                                            key={index}
                                            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary"
                                        >
                                            {topic}
                                            {questionBank.topics.includes(topic) ? (
                                                <button
                                                    onClick={() => deleteTopic(questionBank.topics.findIndex((value) => value === topic))}
                                                    className="hover:text-red-600"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            ) : null}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <Input
                                        value={newTopicName}
                                        onChange={(e) => setNewTopicName(e.target.value)}
                                        className={STRATEGY_INPUT_CLASS}
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
                                        <Plus className="mr-1 h-3 w-3" /> {labels.add_topic}
                                    </Button>
                                </div>

                                <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                                        {lang === 'es'
                                            ? 'Carga masiva de temas'
                                            : 'Bulk topic load'}
                                    </summary>
                                    <div className="mt-3 space-y-2">
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                            {lang === 'es'
                                                ? 'Uno por línea o separados por coma'
                                                : 'One per line or comma-separated'}
                                        </Label>
                                        <textarea
                                            className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24 text-xs`}
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
                                        {bulkTopicsError ? <p className="text-[11px] text-red-600">{bulkTopicsError}</p> : null}
                                        {bulkTopicsStatus && !bulkTopicsError ? (
                                            <p className="text-[11px] text-emerald-700">{bulkTopicsStatus}</p>
                                        ) : null}
                                    </div>
                                </details>
                            </div>

                            <div className={STRATEGY_SUBPANEL_CLASS}>
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm font-bold text-slate-800">
                                        <Brain className="mr-2 inline h-4 w-4 text-purple-600" />
                                        {lang === 'es' ? 'Router' : 'Router'}
                                    </Label>
                                </div>

                                <div className="mt-4 space-y-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleSection('topic_router_optional')}
                                        className="flex w-full items-center justify-between border-b border-slate-200/80 pb-2 text-xs font-semibold text-slate-700"
                                    >
                                        <span>{lang === 'es' ? 'Alias y feedback por tema' : 'Aliases and topic feedback'}</span>
                                        {expandedSections.has('topic_router_optional')
                                            ? <ChevronDown className="h-4 w-4" />
                                            : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                    {expandedSections.has('topic_router_optional') ? (
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 block">
                                                    {lang === 'es' ? 'Alias por tema' : 'Aliases by topic'}
                                                </Label>
                                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                                    {topicOptions.map((topic) => (
                                                        <div key={`aliases-${topic}`} className="flex gap-2 items-start">
                                                            <div className="min-w-[130px] pt-2">
                                                                <span className="block truncate rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600" title={topic}>
                                                                    {topic}
                                                                </span>
                                                            </div>
                                                            <Input
                                                                className={`${STRATEGY_INPUT_CLASS} flex-1`}
                                                                placeholder={lang === 'es'
                                                                    ? 'Sinónimos separados por coma o salto de línea'
                                                                    : 'Synonyms separated by comma or newline'}
                                                                value={(topicConfig.topic_aliases?.[topic] || []).join(', ')}
                                                                onChange={(e) => updateTopicConfig({
                                                                    topic_aliases: {
                                                                        ...(topicConfig.topic_aliases || {}),
                                                                        [topic]: parseListInput(e.target.value),
                                                                    },
                                                                })}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <textarea
                                                    className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24 text-xs`}
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
                                                {bulkAliasesError ? <p className="text-[11px] text-red-600">{bulkAliasesError}</p> : null}
                                                {bulkAliasesStatus && !bulkAliasesError ? (
                                                    <p className="text-[11px] text-emerald-700">{bulkAliasesStatus}</p>
                                                ) : null}
                                            </div>

                                            <div className="space-y-2 border-t border-slate-200/80 pt-3">
                                                <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 block">
                                                    {lang === 'es' ? 'Feedback inicial por tema' : 'Initial feedback by topic'}
                                                </Label>
                                                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                                                    {topicOptions.map((topic) => (
                                                        <div key={topic} className="flex gap-2 items-start">
                                                            <div className="min-w-[130px] pt-2">
                                                                <span className="block truncate rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600" title={topic}>
                                                                    {topic}
                                                                </span>
                                                            </div>
                                                            <Input
                                                                className={`${STRATEGY_INPUT_CLASS} flex-1`}
                                                                placeholder={lang === 'es'
                                                                    ? 'Mensaje opcional para este tema'
                                                                    : 'Optional message for this topic'}
                                                                value={topicConfig.topic_feedbacks?.[topic] || ''}
                                                                onChange={(e) => updateTopicConfig({
                                                                    topic_feedbacks: {
                                                                        ...(topicConfig.topic_feedbacks || {}),
                                                                        [topic]: e.target.value,
                                                                    },
                                                                })}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <textarea
                                                    className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24 text-xs`}
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
                                                {bulkFeedbacksError ? <p className="text-[11px] text-red-600">{bulkFeedbacksError}</p> : null}
                                                {bulkFeedbacksStatus && !bulkFeedbacksError ? (
                                                    <p className="text-[11px] text-emerald-700">{bulkFeedbacksStatus}</p>
                                                ) : null}
                                            </div>
                                        </div>
                                    ) : null}

                                    <button
                                        type="button"
                                        onClick={() => toggleSection('topic_router_advanced')}
                                        className="flex w-full items-center justify-between border-b border-slate-200/80 pb-2 text-xs font-semibold text-slate-700"
                                    >
                                        <span>{lang === 'es' ? 'Router avanzado' : 'Advanced router'}</span>
                                        {expandedSections.has('topic_router_advanced')
                                            ? <ChevronDown className="h-4 w-4" />
                                            : <ChevronRight className="h-4 w-4" />}
                                    </button>
                                    {expandedSections.has('topic_router_advanced') ? (
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap gap-6">
                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300"
                                                        checked={topicConfig.use_router_llm}
                                                        onChange={(e) => updateTopicConfig({ use_router_llm: e.target.checked })}
                                                    />
                                                    {lang === 'es' ? 'Usar router IA para detectar tema' : 'Use AI router to detect topic'}
                                                </label>
                                                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-300"
                                                        checked={topicConfig.allow_topic_correction !== false}
                                                        onChange={(e) => updateTopicConfig({ allow_topic_correction: e.target.checked })}
                                                    />
                                                    {lang === 'es' ? 'Permitir corrección de tema' : 'Allow topic correction'}
                                                </label>
                                            </div>
                                            <Input
                                                className={STRATEGY_INPUT_CLASS}
                                                value={topicConfig.no_topic_template || ''}
                                                placeholder={lang === 'es'
                                                    ? 'Mensaje cuando no se logra detectar un tema con suficiente claridad.'
                                                    : 'Message shown when no clear topic can be detected.'}
                                                onChange={(e) => updateTopicConfig({ no_topic_template: e.target.value })}
                                            />
                                            <Input
                                                className={STRATEGY_INPUT_CLASS}
                                                value={topicConfig.correction_prompt_template || ''}
                                                placeholder={lang === 'es'
                                                    ? 'Mensaje para pedir nueva especificación de tarea/tema.'
                                                    : 'Message requesting task/topic clarification.'}
                                                onChange={(e) => updateTopicConfig({ correction_prompt_template: e.target.value })}
                                            />
                                            <Input
                                                className={STRATEGY_INPUT_CLASS}
                                                value={topicConfig.single_task_template || ''}
                                                placeholder={lang === 'es'
                                                    ? 'Mensaje cuando el usuario declara más de una tarea y se exige una sola.'
                                                    : 'Message for multi-task input when single-task mode is required.'}
                                                onChange={(e) => updateTopicConfig({ single_task_template: e.target.value })}
                                            />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <ExaminerQuestionBankEditor
                        questionBank={questionBank}
                        topicOptions={topicOptions}
                        issues={examinerQuestionIssues}
                        issuesByIndex={examinerQuestionIssuesByIndex}
                        onChange={(nextQuestionBank) => updateConfig('question_bank', nextQuestionBank as BotConfig['question_bank'])}
                        labels={labels}
                        placeholders={placeholders}
                        lang={lang}
                    />

                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader className={getStrategyHeaderClass('primary')}>
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <HelpCircle className="h-4 w-4 text-primary" />
                                {lang === 'es' ? 'Armado del examen' : 'Exam assembly'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                            <div className={cn(STRATEGY_SUBPANEL_CLASS, 'space-y-4')}>
                                <div className="flex flex-wrap items-center gap-4 border-b border-slate-200/80 pb-3">
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                        {lang === 'es' ? 'Modo de selección' : 'Selection mode'}
                                    </Label>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                                            <input
                                                type="radio"
                                                name="eval_mode"
                                                checked={config.evaluation_config?.mode !== 'sequence'}
                                                onChange={() => updateEvaluationConfig({
                                                    ...config.evaluation_config,
                                                    mode: 'standard',
                                                } as BotConfig['evaluation_config'])}
                                            />
                                            {lang === 'es' ? 'Estándar (Buckets)' : 'Standard (Buckets)'}
                                        </label>
                                        <label className="flex items-center gap-2 text-xs cursor-pointer">
                                            <input
                                                type="radio"
                                                name="eval_mode"
                                                checked={config.evaluation_config?.mode === 'sequence'}
                                                onChange={() => updateEvaluationConfig({
                                                    ...config.evaluation_config,
                                                    mode: 'sequence',
                                                } as BotConfig['evaluation_config'])}
                                            />
                                            {lang === 'es' ? 'Secuencial (Playlist)' : 'Sequential (Playlist)'}
                                        </label>
                                    </div>
                                </div>

                                {config.evaluation_config?.mode === 'sequence' ? (
                                    <ExaminerSequenceEditor
                                        config={config}
                                        updateConfig={updateConfig}
                                        setPickerState={setPickerState}
                                        lang={lang}
                                    />
                                ) : (
                                    <div className="space-y-4">
                                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                            <div>
                                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>{labels.mandatory_count}</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={selectionConfig.mandatory_count}
                                                    onChange={(e) => updateEvaluationSelection({
                                                        mandatory_count: Math.max(0, parseInt(e.target.value || '0', 10) || 0),
                                                    })}
                                                    className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                                />
                                            </div>
                                            <div>
                                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>{labels.random_count}</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    value={selectionConfig.random_count}
                                                    onChange={(e) => updateEvaluationSelection({
                                                        random_count: Math.max(0, parseInt(e.target.value || '0', 10) || 0),
                                                    })}
                                                    className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                                />
                                            </div>
                                            <div>
                                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>{labels.order_mode}</Label>
                                                <select
                                                    value={selectionConfig.order_mode}
                                                    onChange={(e) => updateEvaluationSelection({
                                                        order_mode: e.target.value as 'mandatory_first' | 'random_first' | 'mixed',
                                                    })}
                                                    className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
                                                >
                                                    <option value="mandatory_first">{labels.order_mandatory_first}</option>
                                                    <option value="random_first">{labels.order_random_first}</option>
                                                    <option value="mixed">{labels.order_mixed}</option>
                                                </select>
                                            </div>
                                            <div className="flex items-end">
                                                <label className="flex items-center gap-2 text-xs text-slate-700">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectionConfig.by_topic}
                                                        onChange={(e) => updateEvaluationSelection({ by_topic: e.target.checked })}
                                                        className="rounded"
                                                    />
                                                    {labels.by_topic}
                                                </label>
                                            </div>
                                        </div>

                                        <details className="rounded-2xl border border-slate-200 bg-white p-4">
                                            <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                                                {lang === 'es' ? 'Opciones avanzadas de selección' : 'Advanced selection options'}
                                            </summary>
                                            <div className="mt-4 grid gap-3 md:grid-cols-3">
                                                <div>
                                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                                        {lang === 'es' ? 'Evaluación semántica' : 'Semantic evaluation'}
                                                    </Label>
                                                    <select
                                                        value={selectionConfig.semantic_mode}
                                                        onChange={(e) => updateEvaluationSelection({
                                                            semantic_mode: e.target.value as 'ambiguous_only' | 'always',
                                                        })}
                                                        className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
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
                                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>{labels.question_type_order}</Label>
                                                    <select
                                                        value={selectionConfig.question_type_order}
                                                        onChange={(e) => updateEvaluationSelection({
                                                            question_type_order: e.target.value as 'any' | 'teorica_first' | 'practica_first',
                                                        })}
                                                        className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
                                                    >
                                                        <option value="any">{labels.question_type_any}</option>
                                                        <option value="teorica_first">{labels.question_type_teorica_first}</option>
                                                        <option value="practica_first">{labels.question_type_practica_first}</option>
                                                    </select>
                                                </div>
                                                <div className="flex items-end">
                                                    <label className="flex items-center gap-2 text-xs text-slate-700">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectionConfig.show_question_counter}
                                                            onChange={(e) => updateEvaluationSelection({ show_question_counter: e.target.checked })}
                                                            className="rounded"
                                                        />
                                                        {labels.show_question_counter}
                                                    </label>
                                                </div>
                                            </div>
                                        </details>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader
                            className={getStrategyHeaderClass('slate', true)}
                            onClick={() => toggleSection('interstitial_messages')}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="text-sm font-bold text-slate-800">
                                        {lang === 'es' ? 'Mensajes intermedios' : 'Intermission messages'}
                                    </CardTitle>
                                </div>
                                <div className="flex items-center gap-2">
                                    {interstitialMessages.length > 0 ? (
                                        <StrategyCountBadge tone="slate">
                                            {interstitialMessages.length} {lang === 'es' ? 'mensaje(s)' : 'message(s)'}
                                        </StrategyCountBadge>
                                    ) : null}
                                    {expandedSections.has('interstitial_messages')
                                        ? <ChevronDown className="h-4 w-4" />
                                        : <ChevronRight className="h-4 w-4" />}
                                </div>
                            </div>
                        </CardHeader>
                        {expandedSections.has('interstitial_messages') ? (
                            <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                                <div className={cn(STRATEGY_SUBPANEL_CLASS, 'space-y-3')}>
                                    <div className="flex items-center justify-between">
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
                                            <Plus className="mr-1 h-3 w-3" />
                                            {lang === 'es' ? 'Agregar mensaje' : 'Add message'}
                                        </Button>
                                    </div>

                                    <div className="space-y-2 max-h-56 overflow-y-auto">
                                        {interstitialMessages.length === 0 ? (
                                            <p className="text-[11px] text-slate-400">
                                                {lang === 'es'
                                                    ? 'No hay mensajes intermedios configurados.'
                                                    : 'No intermission messages configured.'}
                                            </p>
                                        ) : null}
                                        {interstitialMessages.map((item, idx) => (
                                            <div key={item.id || idx} className={cn(STRATEGY_SUBPANEL_CLASS, 'space-y-2 p-3')}>
                                                <div className="grid grid-cols-1 gap-2 md:grid-cols-4 md:items-end">
                                                    <div>
                                                        <Label className={STRATEGY_FIELD_LABEL_CLASS}>
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
                                                            className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                                        />
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <Label className={STRATEGY_FIELD_LABEL_CLASS}>
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
                                                            placeholder={lang === 'es' ? 'vacío = todos los temas' : 'empty = all topics'}
                                                            className={`${STRATEGY_INPUT_CLASS} mt-1`}
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
                                                            onClick={() => updateInterstitialMessages(interstitialMessages.filter((_, currentIndex) => currentIndex !== idx))}
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
                                                    className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                                                />
                                                {item.wait_for_user === true ? (
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
                                                        className={STRATEGY_INPUT_CLASS}
                                                    />
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                        ) : null}
                    </Card>
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Reglas y automatización' : 'Rules and automation'}
                title={labels.flow_advanced}
                tone="slate"
                summary={((config.global_triggers || []) as FlowStep[]).length > 0
                    ? <StrategyCountBadge tone="orange">{((config.global_triggers || []) as FlowStep[]).length} {lang === 'es' ? 'bloqueador(es)' : 'blocker(s)'}</StrategyCountBadge>
                    : null}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <GlobalBlockersEditor
                        globalTriggers={(config.global_triggers || []) as FlowStep[]}
                        sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                        onChange={(newGlobals, newVars) => onChange({
                            ...config,
                            global_triggers: newGlobals as BotConfig['global_triggers'],
                            session_vars: newVars as BotConfig['session_vars'],
                        })}
                        lang={lang}
                        title={labels.flow_advanced}
                        tooltipTitle={labels.flow_advanced}
                        tooltipContent={labels.flow_advanced_desc}
                    />
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Cierre' : 'Closing'}
                title={lang === 'es' ? 'Salida y cierre del examen' : 'Exit and exam closing'}
                tone="orange"
                summary={(
                    <>
                        {config.goodbye_message ? <StrategyCountBadge tone="orange">Goodbye</StrategyCountBadge> : null}
                        {config.closing_message ? <StrategyCountBadge tone="emerald">Closing</StrategyCountBadge> : null}
                    </>
                )}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader
                            className={getStrategyHeaderClass('orange', true)}
                            onClick={() => toggleSection('goodbye_message')}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">👋</span>
                                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1">
                                        {labels.goodbye_message}
                                        <HelpTooltip title={labels.goodbye_message} content={labels.goodbye_message_desc} />
                                    </CardTitle>
                                    {config.goodbye_message ? <StrategyCountBadge tone="orange">✓</StrategyCountBadge> : null}
                                </div>
                                {expandedSections.has('goodbye_message')
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />}
                            </div>
                        </CardHeader>
                        {expandedSections.has('goodbye_message') ? (
                            <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                                <LocalTextarea
                                    value={config.goodbye_message || ''}
                                    onCommit={(value) => updateConfig('goodbye_message', value)}
                                    placeholder={placeholders.goodbye_message}
                                    className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24`}
                                />
                            </CardContent>
                        ) : null}
                    </Card>

                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader
                            className={getStrategyHeaderClass('emerald', true)}
                            onClick={() => toggleSection('closing_message')}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-base">🎉</span>
                                    <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1">
                                        {labels.closing_message}
                                        <HelpTooltip title={labels.closing_message} content={labels.closing_message_desc} />
                                    </CardTitle>
                                    {config.closing_message ? <StrategyCountBadge tone="emerald">✓</StrategyCountBadge> : null}
                                </div>
                                {expandedSections.has('closing_message')
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />}
                            </div>
                        </CardHeader>
                        {expandedSections.has('closing_message') ? (
                            <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>
                                        {labels.post_exam_doubt_prompt}
                                    </Label>
                                    <LocalTextarea
                                        value={closingConfig.post_exam_doubt_prompt_template || ''}
                                        onCommit={(value) => updateClosingConfig({ post_exam_doubt_prompt_template: value })}
                                        placeholder={placeholders.post_exam_doubt_prompt}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-20`}
                                    />
                                    <p className="text-[10px] text-slate-500">{labels.post_exam_doubt_prompt_desc}</p>
                                </div>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>
                                        {labels.post_exam_doubt_followup}
                                    </Label>
                                    <LocalTextarea
                                        value={closingConfig.post_exam_doubt_followup_template || ''}
                                        onCommit={(value) => updateClosingConfig({ post_exam_doubt_followup_template: value })}
                                        placeholder={placeholders.post_exam_doubt_followup}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-20`}
                                    />
                                    <p className="text-[10px] text-slate-500">{labels.post_exam_doubt_followup_desc}</p>
                                </div>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>
                                        {labels.closing_message}
                                    </Label>
                                    <LocalTextarea
                                        value={config.closing_message || ''}
                                        onCommit={(value) => updateConfig('closing_message', value)}
                                        placeholder={placeholders.closing_message}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24`}
                                    />
                                </div>
                            </CardContent>
                        ) : null}
                    </Card>
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Imagen y extras' : 'Image and extras'}
                title={labels.image_triggers}
                tone="slate"
                summary={((config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>).length > 0
                    ? <StrategyCountBadge tone="primary">{((config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>).length} trigger(s)</StrategyCountBadge>
                    : null}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <StrategyImageTriggersSection
                        triggers={(config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>}
                        onChange={(nextTriggers) => onChange({
                            ...config,
                            image_triggers: nextTriggers as BotConfig['image_triggers'],
                        })}
                        labels={labels}
                        placeholders={placeholders}
                        lang={lang}
                    />
                </div>
            </StrategyEditorSection>

            <QuestionPoolPicker
                isOpen={pickerState.isOpen}
                onClose={() => setPickerState((prev) => ({ ...prev, isOpen: false }))}
                onCommit={pickerState.onCommit}
                initialIds={pickerState.initialIds}
                questions={config.question_bank?.questions || []}
                topics={config.question_bank?.topics || []}
                mode={pickerState.mode}
                lang={lang}
            />
        </StrategyEditorShell>
    );
}

function ExaminerSequenceEditor({
    config,
    updateConfig,
    setPickerState,
    lang,
}: {
    config: BotConfig;
    updateConfig: <K extends keyof BotConfig>(field: K, value: BotConfig[K]) => void;
    setPickerState: Dispatch<SetStateAction<{
        isOpen: boolean;
        mode: 'single' | 'multiple';
        initialIds: string[];
        onCommit: (ids: string[]) => void;
    }>>;
    lang: 'es' | 'en';
}) {
    const sequence = (config.evaluation_config?.sequence || []) as EvaluationSequenceItem[];

    return (
        <div className={cn(STRATEGY_SUBPANEL_CLASS, 'space-y-4')}>
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-sm font-bold text-slate-700">
                        {lang === 'es' ? 'Secuencia de preguntas' : 'Question sequence'}
                    </Label>
                    <p className="mt-1 text-[11px] text-slate-500">
                        {lang === 'es'
                            ? 'Cada paso define exactamente qué se pregunta y en qué orden.'
                            : 'Each step defines exactly what is asked and in which order.'}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        updateConfig('evaluation_config', {
                            ...config.evaluation_config,
                            sequence: [...sequence, {
                                id: `seq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                                type: 'specific',
                                question_id: '',
                            }],
                        } as BotConfig['evaluation_config']);
                    }}
                >
                    <Plus className="mr-1 h-3 w-3" />
                    {lang === 'es' ? 'Agregar paso' : 'Add step'}
                </Button>
            </div>

            <div className="space-y-2">
                {sequence.map((item, idx) => (
                    <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex items-start gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-mono text-slate-500">
                                {idx + 1}
                            </div>
                            <div className="flex-1 space-y-3">
                                <div className="flex flex-col gap-2 lg:flex-row">
                                    <select
                                        className={`${STRATEGY_SELECT_CLASS} w-full lg:w-44`}
                                        value={item.type}
                                        onChange={(e) => {
                                            const next = [...sequence];
                                            next[idx] = { ...item, type: e.target.value as EvaluationSequenceItem['type'] };
                                            updateConfig('evaluation_config', {
                                                ...config.evaluation_config,
                                                sequence: next,
                                            } as BotConfig['evaluation_config']);
                                        }}
                                    >
                                        <option value="specific">{lang === 'es' ? 'Pregunta fija' : 'Specific question'}</option>
                                        <option value="random_pool">{lang === 'es' ? 'Pool aleatorio' : 'Random pool'}</option>
                                        <option value="random_topic">{lang === 'es' ? 'Tema aleatorio' : 'Random topic'}</option>
                                    </select>

                                    {item.type === 'specific' ? (
                                        <Button
                                            variant="outline"
                                            className="h-9 flex-1 justify-start rounded-xl border-slate-200 bg-white text-xs font-normal shadow-sm"
                                            onClick={() => {
                                                setPickerState({
                                                    isOpen: true,
                                                    mode: 'single',
                                                    initialIds: item.question_id ? [item.question_id] : [],
                                                    onCommit: (ids) => {
                                                        const next = [...sequence];
                                                        next[idx] = { ...item, question_id: ids[0] || '' };
                                                        updateConfig('evaluation_config', {
                                                            ...config.evaluation_config,
                                                            sequence: next,
                                                        } as BotConfig['evaluation_config']);
                                                        setPickerState((prev) => ({ ...prev, isOpen: false }));
                                                    },
                                                });
                                            }}
                                        >
                                            {item.question_id
                                                ? ((config.question_bank?.questions.find((question: ExaminerQuestion) => question.id === item.question_id)?.question || item.question_id).slice(0, 56) + '...')
                                                : (lang === 'es' ? 'Seleccionar pregunta...' : 'Select question...')}
                                        </Button>
                                    ) : null}

                                    {item.type === 'random_pool' ? (
                                        <div className="flex flex-1 gap-2">
                                            <Input
                                                type="number"
                                                className={`${STRATEGY_INPUT_CLASS} w-20`}
                                                placeholder="Cant."
                                                value={item.count || 1}
                                                onChange={(e) => {
                                                    const next = [...sequence];
                                                    next[idx] = { ...item, count: parseInt(e.target.value) || 1 };
                                                    updateConfig('evaluation_config', {
                                                        ...config.evaluation_config,
                                                        sequence: next,
                                                    } as BotConfig['evaluation_config']);
                                                }}
                                            />
                                            <Button
                                                variant="outline"
                                                className="h-9 flex-1 justify-start rounded-xl border-slate-200 bg-white text-xs font-normal shadow-sm"
                                                onClick={() => {
                                                    setPickerState({
                                                        isOpen: true,
                                                        mode: 'multiple',
                                                        initialIds: item.pool_ids || [],
                                                        onCommit: (ids) => {
                                                            const next = [...sequence];
                                                            next[idx] = { ...item, pool_ids: ids };
                                                            updateConfig('evaluation_config', {
                                                                ...config.evaluation_config,
                                                                sequence: next,
                                                            } as BotConfig['evaluation_config']);
                                                            setPickerState((prev) => ({ ...prev, isOpen: false }));
                                                        },
                                                    });
                                                }}
                                            >
                                                {(item.pool_ids || []).length > 0
                                                    ? `${(item.pool_ids || []).length} ${lang === 'es' ? 'preguntas' : 'questions'}`
                                                    : (lang === 'es' ? 'Seleccionar pool...' : 'Select pool...')}
                                            </Button>
                                        </div>
                                    ) : null}

                                    {item.type === 'random_topic' ? (
                                        <div className="flex flex-1 gap-2">
                                            <Input
                                                type="number"
                                                className={`${STRATEGY_INPUT_CLASS} w-20`}
                                                placeholder="Cant."
                                                value={item.count || 1}
                                                onChange={(e) => {
                                                    const next = [...sequence];
                                                    next[idx] = { ...item, count: parseInt(e.target.value) || 1 };
                                                    updateConfig('evaluation_config', {
                                                        ...config.evaluation_config,
                                                        sequence: next,
                                                    } as BotConfig['evaluation_config']);
                                                }}
                                            />
                                            <select
                                                className={`${STRATEGY_SELECT_CLASS} flex-1`}
                                                value={item.topic || ''}
                                                onChange={(e) => {
                                                    const next = [...sequence];
                                                    next[idx] = { ...item, topic: e.target.value };
                                                    updateConfig('evaluation_config', {
                                                        ...config.evaluation_config,
                                                        sequence: next,
                                                    } as BotConfig['evaluation_config']);
                                                }}
                                            >
                                                <option value="">{lang === 'es' ? '-- Cualquier tema --' : '-- Any topic --'}</option>
                                                <option value="all">{lang === 'es' ? 'Cualquier tema (mezclado)' : 'Any topic (mixed)'}</option>
                                                {(config.question_bank?.topics || []).map((topic: string) => (
                                                    <option key={topic} value={topic}>{topic}</option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-500 hover:bg-red-50"
                                onClick={() => {
                                    updateConfig('evaluation_config', {
                                        ...config.evaluation_config,
                                        sequence: sequence.filter((_, index) => index !== idx),
                                    } as BotConfig['evaluation_config']);
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                ))}

                {sequence.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-slate-200 py-8 text-center text-xs italic text-slate-400">
                        {lang === 'es'
                            ? 'No hay pasos definidos. El examen finalizará inmediatamente.'
                            : 'No steps defined. Exam will end immediately.'}
                    </div>
                ) : null}
            </div>

            <p className="text-[10px] text-slate-500">
                {lang === 'es'
                    ? '“Pregunta fija” usa una pregunta concreta. “Tema aleatorio” toma N preguntas de un tema. “Pool aleatorio” toma N preguntas de una selección manual.'
                    : '"Specific question" uses one exact question. "Random topic" takes N questions from a topic. "Random pool" takes N questions from a manual selection.'}
            </p>
        </div>
    );
}
