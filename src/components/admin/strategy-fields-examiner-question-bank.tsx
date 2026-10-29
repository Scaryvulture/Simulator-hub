'use client';

import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseQuestionBankMarkdown } from '@/lib/question-bank-markdown';
import { parseQuestionBankJson } from '@/lib/question-bank-json';
import { cn, parseListInput } from '@/lib/utils';
import type {
    ExaminerQuestion,
    ExaminerQuestionLintIssue,
    QuestionBank,
    StrategyFieldLabels,
    StrategyFieldPlaceholders,
} from './strategy-fields-model';
import { resolveQuestionUiKey } from './strategy-fields-model';
import {
    LocalTextarea,
    STRATEGY_CARD_CLASS,
    STRATEGY_CARD_CONTENT_CLASS,
    STRATEGY_FIELD_LABEL_CLASS,
    STRATEGY_INPUT_CLASS,
    STRATEGY_MONO_TEXTAREA_CLASS,
    STRATEGY_SELECT_CLASS,
    STRATEGY_SUBPANEL_CLASS,
    StrategyCountBadge,
    getStrategyHeaderClass,
} from './strategy-fields-shared';

type QuestionTypeFilter = 'all' | 'teorica' | 'practica';

type QuestionEntry = {
    question: ExaminerQuestion;
    index: number;
    key: string;
    issues: ExaminerQuestionLintIssue[];
};

export function ExaminerQuestionBankEditor({
    questionBank,
    topicOptions,
    issues,
    issuesByIndex,
    onChange,
    labels,
    placeholders,
    lang,
}: {
    questionBank: QuestionBank;
    topicOptions: string[];
    issues: ExaminerQuestionLintIssue[];
    issuesByIndex: Map<number, ExaminerQuestionLintIssue[]>;
    onChange: (nextQuestionBank: QuestionBank) => void;
    labels: StrategyFieldLabels;
    placeholders: StrategyFieldPlaceholders;
    lang: 'es' | 'en';
}) {
    const [questionTypeFilter, setQuestionTypeFilter] = useState<QuestionTypeFilter>('all');
    const [questionTopicFilter, setQuestionTopicFilter] = useState<string>('all');
    const [questionSearchTerm, setQuestionSearchTerm] = useState('');
    const [selectedQuestionKey, setSelectedQuestionKey] = useState<string | null>(null);
    const [pendingScrollKey, setPendingScrollKey] = useState<string | null>(null);
    const [bankUtilitiesExpanded, setBankUtilitiesExpanded] = useState(false);
    const [bankImportMode, setBankImportMode] = useState<'markdown' | 'json'>('markdown');
    const [bankImportText, setBankImportText] = useState('');
    const [bankImportStatus, setBankImportStatus] = useState<string | null>(null);
    const [bankImportError, setBankImportError] = useState<string | null>(null);

    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    const filteredQuestions = useMemo<QuestionEntry[]>(
        () => questionBank.questions
            .map((question, index) => ({
                question,
                index,
                key: resolveQuestionUiKey(question, index),
                issues: issuesByIndex.get(index) || [],
            }))
            .filter(({ question }) => questionTypeFilter === 'all' || question.type === questionTypeFilter)
            .filter(({ question }) => questionTopicFilter === 'all' || (question.topic || '').trim() === questionTopicFilter)
            .filter(({ question }) => {
                const search = questionSearchTerm.trim().toLowerCase();
                if (!search) return true;
                const haystack = [
                    question.id,
                    question.question,
                    question.topic,
                    question.expected_keys,
                ].join(' ').toLowerCase();
                return haystack.includes(search);
            }),
        [issuesByIndex, questionBank.questions, questionSearchTerm, questionTopicFilter, questionTypeFilter]
    );

    useEffect(() => {
        if (filteredQuestions.length === 0) {
            setSelectedQuestionKey(null);
            return;
        }

        const selectedStillVisible = filteredQuestions.some((entry) => entry.key === selectedQuestionKey);
        if (!selectedStillVisible) {
            setSelectedQuestionKey(filteredQuestions[0].key);
        }
    }, [filteredQuestions, selectedQuestionKey]);

    useEffect(() => {
        if (!pendingScrollKey) return;
        const questionElement = document.querySelector(
            `[data-question-bank-key="${pendingScrollKey}"]`
        ) as HTMLElement | null;
        if (!questionElement) return;
        questionElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        setPendingScrollKey(null);
    }, [filteredQuestions, pendingScrollKey]);

    const selectedEntry = filteredQuestions.find((entry) => entry.key === selectedQuestionKey) || null;

    const updateQuestionBank = (updater: (current: QuestionBank) => QuestionBank) => {
        const next = updater(questionBank);
        onChange(next);
    };

    const addQuestion = () => {
        const existingIds = new Set(questionBank.questions.map((question) => question.id));
        let nextOrdinal = questionBank.questions.length + 1;
        let newQuestionId = `q_${nextOrdinal}`;
        while (existingIds.has(newQuestionId)) {
            nextOrdinal += 1;
            newQuestionId = `q_${nextOrdinal}`;
        }

        const defaultType: ExaminerQuestion['type'] = questionTypeFilter === 'all' ? 'teorica' : questionTypeFilter;
        const nextQuestion: ExaminerQuestion = {
            id: newQuestionId,
            topic: questionTopicFilter !== 'all' ? questionTopicFilter : (topicOptions[0] || ''),
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
        };

        updateQuestionBank((current) => ({
            ...current,
            questions: [...current.questions, nextQuestion],
        }));

        const nextKey = `id:${newQuestionId}`;
        setSelectedQuestionKey(nextKey);
        setPendingScrollKey(nextKey);
    };

    const updateQuestion = <K extends keyof ExaminerQuestion>(index: number, field: K, value: ExaminerQuestion[K]) => {
        const previousQuestion = questionBank.questions[index];
        const oldKey = previousQuestion ? resolveQuestionUiKey(previousQuestion, index) : null;
        const updatedQuestions = [...questionBank.questions];
        updatedQuestions[index] = { ...updatedQuestions[index], [field]: value };
        onChange({
            ...questionBank,
            questions: updatedQuestions,
        });

        if (field === 'id' && oldKey) {
            const newKey = resolveQuestionUiKey(updatedQuestions[index], index);
            if (selectedQuestionKey === oldKey) {
                setSelectedQuestionKey(newKey);
            }
        }
    };

    const deleteQuestion = (index: number) => {
        const nextQuestions = questionBank.questions.filter((_, currentIndex) => currentIndex !== index);
        const remainingEntries = filteredQuestions.filter((entry) => entry.index !== index);
        const currentVisibleIndex = filteredQuestions.findIndex((entry) => entry.index === index);
        const replacement = remainingEntries[currentVisibleIndex] || remainingEntries[currentVisibleIndex - 1] || null;

        onChange({
            ...questionBank,
            questions: nextQuestions,
        });

        if (selectedEntry?.index === index) {
            setSelectedQuestionKey(replacement?.key || null);
        }
    };

    const focusExaminerIssue = (issue: ExaminerQuestionLintIssue) => {
        setQuestionSearchTerm('');
        setQuestionTypeFilter('all');
        setQuestionTopicFilter('all');
        const question = questionBank.questions[issue.questionIndex];
        const nextKey = question
            ? resolveQuestionUiKey(question, issue.questionIndex)
            : `idx:${issue.questionIndex}`;
        setSelectedQuestionKey(nextKey);
        setPendingScrollKey(nextKey);
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
                ...parsed.questions.map((question) => (question.topic || '').trim()).filter(Boolean),
            ]));

            const nextQuestionBank: QuestionBank = {
                topics: parsedTopics,
                questions: parsed.questions,
            };

            onChange(nextQuestionBank);
            setSelectedQuestionKey(parsed.questions[0] ? resolveQuestionUiKey(parsed.questions[0], 0) : null);
            setPendingScrollKey(parsed.questions[0] ? resolveQuestionUiKey(parsed.questions[0], 0) : null);
            setBankImportError(null);
            setBankImportStatus(
                lang === 'es'
                    ? `Importación ok (${bankImportMode.toUpperCase()}): ${parsedTopics.length} tema(s), ${parsed.questions.length} pregunta(s). ${parsed.warnings.length > 0 ? `Advertencias: ${parsed.warnings.length}.` : ''}`
                    : `Import OK (${bankImportMode.toUpperCase()}): ${parsedTopics.length} topic(s), ${parsed.questions.length} question(s). ${parsed.warnings.length > 0 ? `Warnings: ${parsed.warnings.length}.` : ''}`
            );
        } catch (error) {
            setBankImportError(
                error instanceof Error
                    ? error.message
                    : (lang === 'es' ? 'No se pudo importar el banco.' : 'Could not import bank.')
            );
            setBankImportStatus(null);
        }
    };

    const loadImportFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.json')) setBankImportMode('json');
        if (lowerName.endsWith('.md') || lowerName.endsWith('.markdown') || lowerName.endsWith('.txt')) {
            setBankImportMode('markdown');
        }

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
            setBankUtilitiesExpanded(true);
        };
        reader.onerror = () => {
            setBankImportError(lang === 'es' ? 'No se pudo leer el archivo.' : 'Could not read file.');
            setBankImportStatus(null);
        };
        reader.readAsText(file);
        event.target.value = '';
    };

    return (
        <Card className={STRATEGY_CARD_CLASS}>
            <CardHeader className={getStrategyHeaderClass('primary')}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-sm font-bold text-slate-800">
                            {labels.question_bank}
                        </CardTitle>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <StrategyCountBadge tone="primary">
                            {questionBank.questions.length} {lang === 'es' ? 'pregunta(s)' : 'question(s)'}
                        </StrategyCountBadge>
                        {topicOptions.length > 0 ? (
                            <StrategyCountBadge tone="slate">
                                {topicOptions.length} {lang === 'es' ? 'tema(s)' : 'topic(s)'}
                            </StrategyCountBadge>
                        ) : null}
                        {criticalCount > 0 ? (
                            <StrategyCountBadge tone="orange">
                                {criticalCount} {lang === 'es' ? 'crítico(s)' : 'critical'}
                            </StrategyCountBadge>
                        ) : null}
                        {warningCount > 0 ? (
                            <StrategyCountBadge tone="slate">
                                {warningCount} warning(s)
                            </StrategyCountBadge>
                        ) : null}
                    </div>
                </div>
            </CardHeader>
            <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                <div className={cn(STRATEGY_SUBPANEL_CLASS, 'space-y-3')}>
                    <button
                        type="button"
                        onClick={() => setBankUtilitiesExpanded((prev) => !prev)}
                        className="flex w-full items-center justify-between text-left"
                    >
                        <div>
                            <p className="text-sm font-semibold text-slate-800">
                                {lang === 'es' ? 'Utilidades del banco' : 'Bank utilities'}
                            </p>
                        </div>
                        {bankUtilitiesExpanded ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                    </button>
                    {bankUtilitiesExpanded ? (
                        <div className="space-y-3 border-t border-slate-200/80 pt-3">
                            <div className="flex items-center gap-2">
                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>
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
                            <textarea
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-36 text-xs`}
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
                                    <FileUp className="mr-1 h-3.5 w-3.5" />
                                    {lang === 'es' ? 'Importar y reemplazar banco' : 'Import and replace bank'}
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
                            {bankImportError ? <p className="text-[11px] text-red-600">{bankImportError}</p> : null}
                            {bankImportStatus && !bankImportError ? (
                                <p className="text-[11px] text-emerald-700">{bankImportStatus}</p>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {issues.length > 0 ? (
                    <div
                        className={cn(
                            STRATEGY_SUBPANEL_CLASS,
                            criticalCount > 0 ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70'
                        )}
                    >
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <p className={cn(
                                    'text-xs font-bold',
                                    criticalCount > 0 ? 'text-red-700' : 'text-amber-800'
                                )}>
                                    {criticalCount > 0
                                        ? (lang === 'es'
                                            ? `Preguntas con errores críticos (${criticalCount})`
                                            : `Questions with critical issues (${criticalCount})`)
                                        : (lang === 'es'
                                            ? `Preguntas con warnings (${warningCount})`
                                            : `Questions with warnings (${warningCount})`)}
                                </p>
                                <p className="text-[11px] text-slate-600">
                                    {lang === 'es'
                                        ? 'Cada issue te lleva directo a la pregunta afectada.'
                                        : 'Each issue jumps straight to the affected question.'}
                                </p>
                            </div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                            {issues.slice(0, 8).map((issue, issueIndex) => (
                                <button
                                    key={`${issue.questionIndex}-${issue.severity}-${issueIndex}`}
                                    type="button"
                                    onClick={() => focusExaminerIssue(issue)}
                                    className={cn(
                                        'rounded-xl border bg-white px-3 py-2 text-left text-xs shadow-sm transition-colors hover:bg-slate-50',
                                        issue.severity === 'critical'
                                            ? 'border-red-200 text-red-700'
                                            : 'border-amber-200 text-amber-800'
                                    )}
                                >
                                    {issue.message}
                                </button>
                            ))}
                        </div>
                        {issues.length > 8 ? (
                            <p className="mt-2 text-[11px] text-slate-500">
                                {lang === 'es'
                                    ? `+${issues.length - 8} issue(s) más`
                                    : `+${issues.length - 8} more issue(s)`}
                            </p>
                        ) : null}
                    </div>
                ) : null}

                <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.92fr)_minmax(0,1.38fr)]">
                    <div className={cn(STRATEGY_SUBPANEL_CLASS, 'space-y-3')}>
                        <div className="space-y-2 border-b border-slate-200/80 pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-800">
                                    {lang === 'es' ? 'Listado de preguntas' : 'Question list'}
                                </p>
                                <Button type="button" size="sm" onClick={addQuestion}>
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    {labels.add_question}
                                </Button>
                            </div>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                                <Input
                                    value={questionSearchTerm}
                                    onChange={(e) => setQuestionSearchTerm(e.target.value)}
                                    placeholder={lang === 'es' ? 'Buscar por ID, tema o enunciado' : 'Search by ID, topic, or statement'}
                                    className={`${STRATEGY_INPUT_CLASS} pl-8`}
                                />
                            </div>
                            <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                                <div>
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>{lang === 'es' ? 'Tipo' : 'Type'}</Label>
                                    <div className="mt-1 flex gap-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={questionTypeFilter === 'all' ? 'default' : 'outline'}
                                            onClick={() => setQuestionTypeFilter('all')}
                                            className="flex-1"
                                        >
                                            {lang === 'es' ? 'Todas' : 'All'}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={questionTypeFilter === 'teorica' ? 'default' : 'outline'}
                                            onClick={() => setQuestionTypeFilter('teorica')}
                                            className="flex-1"
                                        >
                                            {lang === 'es' ? 'Teóricas' : 'Theory'}
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={questionTypeFilter === 'practica' ? 'default' : 'outline'}
                                            onClick={() => setQuestionTypeFilter('practica')}
                                            className="flex-1"
                                        >
                                            {lang === 'es' ? 'Prácticas' : 'Practice'}
                                        </Button>
                                    </div>
                                </div>
                                <div className="md:col-span-2 xl:col-span-1 2xl:col-span-2">
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>{lang === 'es' ? 'Tema' : 'Topic'}</Label>
                                    <select
                                        value={questionTopicFilter}
                                        onChange={(e) => setQuestionTopicFilter(e.target.value)}
                                        className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
                                    >
                                        <option value="all">{lang === 'es' ? 'Todos los temas' : 'All topics'}</option>
                                        {topicOptions.map((topic) => (
                                            <option key={topic} value={topic}>{topic}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 max-h-[680px] overflow-y-auto pr-1">
                            {filteredQuestions.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
                                    {questionBank.questions.length === 0
                                        ? (lang === 'es'
                                            ? 'Todavía no hay preguntas. Creá una nueva o importá un banco.'
                                            : 'There are no questions yet. Create one or import a bank.')
                                        : (lang === 'es'
                                            ? 'No hay resultados con los filtros actuales.'
                                            : 'No results match the current filters.')}
                                </div>
                            ) : (
                                filteredQuestions.map((entry) => (
                                    <ExaminerQuestionListItem
                                        key={entry.key}
                                        entry={entry}
                                        selected={entry.key === selectedQuestionKey}
                                        onSelect={() => setSelectedQuestionKey(entry.key)}
                                        lang={lang}
                                    />
                                ))
                            )}
                        </div>
                    </div>

                    <div className={cn(STRATEGY_SUBPANEL_CLASS, 'min-h-[560px]')}>
                        {selectedEntry ? (
                            <ExaminerQuestionDetailEditor
                                entry={selectedEntry}
                                topics={questionBank.topics}
                                onUpdate={updateQuestion}
                                onDelete={deleteQuestion}
                                labels={labels}
                                placeholders={placeholders}
                                lang={lang}
                            />
                        ) : (
                            <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
                                <div className="max-w-sm space-y-2">
                                    <p className="text-sm font-semibold text-slate-800">
                                        {lang === 'es' ? 'Seleccioná una pregunta para editarla' : 'Select a question to edit it'}
                                    </p>
                                    <p className="text-sm leading-relaxed text-slate-500">
                                        {lang === 'es'
                                            ? 'El panel derecho muestra el detalle completo de la pregunta activa. Si aplicaste filtros y no hay resultados, limpiá los filtros o creá una nueva.'
                                            : 'The right panel shows the full detail of the active question. If filters hide every result, clear them or create a new one.'}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function ExaminerQuestionListItem({
    entry,
    selected,
    onSelect,
    lang,
}: {
    entry: QuestionEntry;
    selected: boolean;
    onSelect: () => void;
    lang: 'es' | 'en';
}) {
    const criticalCount = entry.issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = entry.issues.filter((issue) => issue.severity === 'warning').length;
    const expectedCount = parseListInput(entry.question.expected_keys || '').length;
    const summary = (entry.question.question || '').trim() || (lang === 'es' ? 'Pregunta sin enunciado' : 'Question without statement');

    return (
        <button
            type="button"
            data-question-bank-key={entry.key}
            onClick={onSelect}
            className={cn(
                'w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition-all',
                selected
                    ? 'border-primary/30 bg-primary/8 ring-2 ring-primary/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
            )}
        >
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                    {entry.question.id || `q_${entry.index + 1}`}
                </span>
                <StrategyCountBadge tone={entry.question.type === 'practica' ? 'orange' : 'indigo'}>
                    {entry.question.type === 'practica'
                        ? (lang === 'es' ? 'Caso práctico' : 'Practical')
                        : (lang === 'es' ? 'Teórica' : 'Theory')}
                </StrategyCountBadge>
                {entry.question.topic ? (
                    <StrategyCountBadge tone="primary">{entry.question.topic}</StrategyCountBadge>
                ) : (
                    <StrategyCountBadge tone="slate">{lang === 'es' ? 'Sin tema' : 'No topic'}</StrategyCountBadge>
                )}
                {entry.question.is_mandatory ? (
                    <StrategyCountBadge tone="emerald">{lang === 'es' ? 'Obligatoria' : 'Mandatory'}</StrategyCountBadge>
                ) : null}
            </div>
            <p className="mt-2 line-clamp-2 text-sm font-medium text-slate-800">
                {summary}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>{expectedCount} {lang === 'es' ? 'clave(s)' : 'key(s)'}</span>
                {criticalCount > 0 ? <span className="text-red-600">{criticalCount} {lang === 'es' ? 'crítico(s)' : 'critical'}</span> : null}
                {warningCount > 0 ? <span className="text-amber-700">{warningCount} warning(s)</span> : null}
            </div>
        </button>
    );
}

function ExaminerQuestionDetailEditor({
    entry,
    topics,
    onUpdate,
    onDelete,
    labels,
    placeholders,
    lang,
}: {
    entry: QuestionEntry;
    topics: string[];
    onUpdate: <K extends keyof ExaminerQuestion>(index: number, field: K, value: ExaminerQuestion[K]) => void;
    onDelete: (index: number) => void;
    labels: StrategyFieldLabels;
    placeholders: StrategyFieldPlaceholders;
    lang: 'es' | 'en';
}) {
    const { question: q, index, issues } = entry;
    const [localQuestion, setLocalQuestion] = useState(q.question || '');
    const [localExpected, setLocalExpected] = useState(q.expected_keys || '');
    const [localMedia, setLocalMedia] = useState(q.media_url || '');
    const [localId, setLocalId] = useState(q.id || '');
    const [localBranchKey, setLocalBranchKey] = useState(q.branch_key || '');
    const [localMaxAttempts, setLocalMaxAttempts] = useState(String(q.max_attempts ?? 2));
    const [localMinExpected, setLocalMinExpected] = useState(typeof q.min_expected_matches === 'number' ? String(q.min_expected_matches) : '');
    const [localMinAnswerWords, setLocalMinAnswerWords] = useState(typeof q.min_answer_words === 'number' ? String(q.min_answer_words) : '');
    const [localMinAnswerSentences, setLocalMinAnswerSentences] = useState(typeof q.min_answer_sentences === 'number' ? String(q.min_answer_sentences) : '');
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
        q.branch_key,
        q.continue_prompt_template,
        q.correct_feedback_template,
        q.expected_keys,
        q.id,
        q.max_attempts,
        q.media_url,
        q.min_answer_sentences,
        q.min_answer_words,
        q.min_expected_matches,
        q.question,
        q.retry_incomplete_template,
        q.retry_incorrect_template,
        q.second_fail_template,
    ]);

    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-slate-900">
                            {q.id || `q_${index + 1}`}
                        </p>
                        <StrategyCountBadge tone={q.type === 'practica' ? 'orange' : 'indigo'}>
                            {q.type === 'practica'
                                ? (lang === 'es' ? 'Caso práctico' : 'Practical case')
                                : (lang === 'es' ? 'Teórica' : 'Theoretical')}
                        </StrategyCountBadge>
                        {q.topic ? <StrategyCountBadge tone="primary">{q.topic}</StrategyCountBadge> : null}
                        {q.is_mandatory ? <StrategyCountBadge tone="emerald">{lang === 'es' ? 'Obligatoria' : 'Mandatory'}</StrategyCountBadge> : null}
                        {criticalCount > 0 ? <StrategyCountBadge tone="orange">{criticalCount} {lang === 'es' ? 'crítico(s)' : 'critical'}</StrategyCountBadge> : null}
                        {warningCount > 0 ? <StrategyCountBadge tone="slate">{warningCount} warning(s)</StrategyCountBadge> : null}
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">
                        {lang === 'es'
                            ? 'Editá la pregunta activa con todo el control actual, pero agrupado por intención para que sea más fácil de operar.'
                            : 'Edit the active question with the same current control, but grouped by intent so it is easier to operate.'}
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => onDelete(index)}
                >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    {lang === 'es' ? 'Eliminar' : 'Delete'}
                </Button>
            </div>

            {issues.length > 0 ? (
                <div className={cn(
                    'rounded-2xl border px-4 py-3',
                    criticalCount > 0 ? 'border-red-200 bg-red-50/70' : 'border-amber-200 bg-amber-50/70'
                )}>
                    <p className={cn(
                        'text-xs font-bold',
                        criticalCount > 0 ? 'text-red-700' : 'text-amber-800'
                    )}>
                        {lang === 'es' ? 'Revisá estos puntos antes de guardar' : 'Review these points before saving'}
                    </p>
                    <div className="mt-2 space-y-1">
                        {issues.map((issue, issueIndex) => (
                            <p
                                key={`${issue.severity}-${issueIndex}`}
                                className={cn(
                                    'text-xs',
                                    issue.severity === 'critical' ? 'text-red-700' : 'text-amber-800'
                                )}
                            >
                                • {issue.message}
                            </p>
                        ))}
                    </div>
                </div>
            ) : null}

            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <div className="space-y-4">
                    <div className={STRATEGY_SUBPANEL_CLASS}>
                        <p className="mb-3 text-sm font-semibold text-slate-800">
                            {lang === 'es' ? 'Enunciado y metadatos' : 'Statement and metadata'}
                        </p>
                        <div className="grid gap-3 md:grid-cols-2">
                            <div>
                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>ID</Label>
                                <Input
                                    value={localId}
                                    onChange={(e) => setLocalId(e.target.value)}
                                    onBlur={() => {
                                        const next = localId.trim();
                                        if (next && next !== q.id) onUpdate(index, 'id', next);
                                    }}
                                    placeholder="q_001"
                                    className={`${STRATEGY_INPUT_CLASS} mt-1 font-mono`}
                                />
                            </div>
                            <div>
                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>{lang === 'es' ? 'Tema' : 'Topic'}</Label>
                                <select
                                    value={q.topic}
                                    onChange={(e) => onUpdate(index, 'topic', e.target.value)}
                                    className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
                                >
                                    <option value="">{labels.topics}</option>
                                    {topics.map((topic) => (
                                        <option key={topic} value={topic}>
                                            {topic}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>{lang === 'es' ? 'Tipo de pregunta' : 'Question type'}</Label>
                                <select
                                    value={q.type}
                                    onChange={(e) => onUpdate(index, 'type', e.target.value as ExaminerQuestion['type'])}
                                    className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
                                >
                                    <option value="teorica">Teórica</option>
                                    <option value="practica">Caso práctico</option>
                                </select>
                            </div>
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 text-sm text-slate-700">
                                    <input
                                        type="checkbox"
                                        checked={q.is_mandatory}
                                        onChange={(e) => onUpdate(index, 'is_mandatory', e.target.checked)}
                                    />
                                    {labels.mandatory}
                                </label>
                            </div>
                        </div>

                        <div className="mt-3">
                            <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>{labels.question}</Label>
                            <LocalTextarea
                                value={localQuestion}
                                onCommit={(value) => onUpdate(index, 'question', value)}
                                placeholder={placeholders.question}
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-28 text-xs`}
                            />
                        </div>
                    </div>

                    <div className={STRATEGY_SUBPANEL_CLASS}>
                        <p className="mb-3 text-sm font-semibold text-slate-800">
                            {lang === 'es' ? 'Evaluación esperada' : 'Expected evaluation'}
                        </p>
                        <div className="grid gap-3 2xl:grid-cols-2">
                            <div>
                                <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>{labels.expected}</Label>
                                <LocalTextarea
                                    value={localExpected}
                                    onCommit={(value) => onUpdate(index, 'expected_keys', value)}
                                    placeholder={placeholders.expected}
                                    className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-24 text-xs`}
                                />
                            </div>
                            <div className="grid gap-3">
                                <div>
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                        {lang === 'es' ? 'Mínimo de claves esperadas (opcional)' : 'Minimum expected keys (optional)'}
                                    </Label>
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
                                        className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                        placeholder="Ej: 3"
                                    />
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                    <div>
                                        <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                            {lang === 'es' ? 'Mínimo de palabras' : 'Min words'}
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
                                            className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                            placeholder="25"
                                        />
                                    </div>
                                    <div>
                                        <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                            {lang === 'es' ? 'Mínimo de oraciones' : 'Min sentences'}
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
                                            className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                            placeholder="3"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className={STRATEGY_SUBPANEL_CLASS}>
                        <p className="mb-3 text-sm font-semibold text-slate-800">
                            {lang === 'es' ? 'Media, branching y condiciones' : 'Media, branching, and conditions'}
                        </p>
                        <div className="space-y-3">
                            <div>
                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>{labels.media}</Label>
                                <Input
                                    value={localMedia}
                                    onChange={(e) => setLocalMedia(e.target.value)}
                                    onBlur={() => onUpdate(index, 'media_url', localMedia)}
                                    placeholder={placeholders.media_url}
                                    className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                />
                            </div>
                            <div>
                                <Label className={STRATEGY_FIELD_LABEL_CLASS}>
                                    {lang === 'es' ? 'Condición de tema' : 'Topic condition'}
                                </Label>
                                <Input
                                    value={localBranchKey}
                                    onChange={(e) => setLocalBranchKey(e.target.value)}
                                    onBlur={() => onUpdate(index, 'branch_key', localBranchKey)}
                                    placeholder={lang === 'es' ? 'Vacío = aparece en todos los temas' : 'Empty = visible in all topics'}
                                    className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                />
                            </div>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>{lang === 'es' ? 'Máx. reintentos' : 'Max retries'}</Label>
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
                                        className={`${STRATEGY_INPUT_CLASS} mt-1`}
                                    />
                                </div>
                                <div>
                                    <Label className={STRATEGY_FIELD_LABEL_CLASS}>{lang === 'es' ? 'Continuación' : 'Continue mode'}</Label>
                                    <select
                                        value={q.continue_mode || 'ask_confirm'}
                                        onChange={(e) => onUpdate(index, 'continue_mode', e.target.value as ExaminerQuestion['continue_mode'])}
                                        className={`${STRATEGY_SELECT_CLASS} mt-1 w-full`}
                                    >
                                        <option value="ask_confirm">{lang === 'es' ? 'Pedir confirmación' : 'Ask for confirmation'}</option>
                                        <option value="auto_next">{lang === 'es' ? 'Avanzar automático' : 'Auto next'}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <details className={STRATEGY_SUBPANEL_CLASS} open={Boolean(localRetryIncomplete || localRetryIncorrect || localSecondFail || localCorrectFeedback || localContinuePrompt)}>
                        <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                            {lang === 'es' ? 'Reintentos y feedback' : 'Retries and feedback'}
                        </summary>
                        <div className="mt-3 space-y-2">
                            <LocalTextarea
                                value={localRetryIncomplete}
                                onCommit={(value) => onUpdate(index, 'retry_incomplete_template', value)}
                                placeholder={lang === 'es' ? 'Mensaje de reintento por respuesta incompleta' : 'Retry message for incomplete answer'}
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <LocalTextarea
                                value={localRetryIncorrect}
                                onCommit={(value) => onUpdate(index, 'retry_incorrect_template', value)}
                                placeholder={lang === 'es' ? 'Mensaje de reintento por respuesta incorrecta' : 'Retry message for incorrect answer'}
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <LocalTextarea
                                value={localSecondFail}
                                onCommit={(value) => onUpdate(index, 'second_fail_template', value)}
                                placeholder={lang === 'es' ? 'Mensaje al segundo fallo' : 'Message after second failed attempt'}
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <LocalTextarea
                                value={localCorrectFeedback}
                                onCommit={(value) => onUpdate(index, 'correct_feedback_template', value)}
                                placeholder={lang === 'es' ? 'Feedback cuando la respuesta es correcta' : 'Feedback when the answer is correct'}
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <LocalTextarea
                                value={localContinuePrompt}
                                onCommit={(value) => onUpdate(index, 'continue_prompt_template', value)}
                                placeholder={lang === 'es' ? 'Prompt para continuar cuando no hay auto-next' : 'Continue prompt when auto-next is disabled'}
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <p className="text-[10px] leading-relaxed text-slate-500">
                                Variables: {'{question}'}, {'{expected_keys}'}, {'{expected_keys_bullets}'}, {'{missing_keys}'}, {'{missing_keys_bullets}'}, {'{matched_count}'}, {'{required_count}'}, {'{answer_word_count}'}, {'{answer_sentence_count}'}, {'{min_answer_words}'}, {'{min_answer_sentences}'}, {'{semantic_feedback}'}.
                            </p>
                        </div>
                    </details>
                </div>
            </div>
        </div>
    );
}
