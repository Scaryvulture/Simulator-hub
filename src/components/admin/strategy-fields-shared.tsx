'use client';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { lintFlowConfig } from '@/lib/flow-linter';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { cn, parseListInput } from '@/lib/utils';
import { ChevronDown, ChevronRight, Image as ImageIcon, MessageSquare, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { FlowEditor, type FlowStep, type SessionVarConfig } from './flow-editor';
import { HelpTooltip } from './help-tooltip';
import type {
    ExaminerQuestion,
    ExaminerQuestionLintIssue,
    ImageTrigger,
    StrategyFieldLabels,
    StrategyFieldPlaceholders,
    UpdateQuestionFn,
} from './strategy-fields-model';

export const STRATEGY_EDITOR_SURFACE_CLASS = cn(
    'space-y-5'
);

export const STRATEGY_CARD_CLASS = 'admin-editor-card';
export const STRATEGY_CARD_CONTENT_CLASS = 'space-y-4 px-5 pb-5 pt-0 sm:px-6';
export const STRATEGY_SUBPANEL_CLASS = 'admin-editor-subpanel';
export const STRATEGY_FIELD_LABEL_CLASS = 'admin-editor-label';
export const STRATEGY_TEXTAREA_CLASS = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-primary/35 focus:ring-2 focus:ring-primary/15';
export const STRATEGY_MONO_TEXTAREA_CLASS = `${STRATEGY_TEXTAREA_CLASS} font-mono`;
export const STRATEGY_INPUT_CLASS = 'h-10 rounded-xl border-slate-200 bg-white text-sm text-slate-700 shadow-sm placeholder:text-slate-400';
export const STRATEGY_SELECT_CLASS = 'h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm outline-none transition-all focus:border-primary/35 focus:ring-2 focus:ring-primary/15';

type StrategyTone = 'primary' | 'emerald' | 'orange' | 'indigo' | 'slate';

export function getStrategyHeaderClass(_tone: StrategyTone, clickable = false) {
    return cn(
        'admin-editor-card-header',
        'bg-slate-50/85',
        clickable && 'cursor-pointer transition-colors hover:bg-slate-100/80'
    );
}

export function StrategyCountBadge({
    children,
    tone = 'primary',
}: {
    children: ReactNode;
    tone?: StrategyTone;
}) {
    return (
        <span
            className={cn(
                'admin-editor-chip',
                tone === 'primary' && 'border-primary/15 bg-primary/10 text-primary',
                tone === 'emerald' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                tone === 'orange' && 'border-orange-200 bg-orange-50 text-orange-700',
                tone === 'indigo' && 'border-indigo-200 bg-indigo-50 text-indigo-700',
                tone === 'slate' && 'border-slate-200 bg-white text-slate-500'
            )}
        >
            {children}
        </span>
    );
}

export function LocalTextarea({
    value,
    onCommit,
    placeholder,
    className,
}: {
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

export function TemplateTextareaWithVariables({
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

export function ImageTriggerRow({
    trigger,
    index,
    onUpdate,
    onDelete,
    placeholders,
}: {
    trigger: ImageTrigger;
    index: number;
    onUpdate: (index: number, updated: ImageTrigger) => void;
    onDelete: (index: number) => void;
    placeholders: StrategyFieldPlaceholders;
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
        <div
            data-image-trigger-index={index}
            className={cn(STRATEGY_SUBPANEL_CLASS, 'grid grid-cols-12 items-center gap-2')}
        >
            <div className="col-span-4">
                <Input
                    value={localPattern}
                    onChange={(e) => setLocalPattern(e.target.value)}
                    onBlur={() => onUpdate(index, { ...trigger, pattern: localPattern })}
                    placeholder={placeholders.image_pattern}
                    className={STRATEGY_INPUT_CLASS}
                />
            </div>
            <div className="col-span-4">
                <Input
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    onBlur={() => onUpdate(index, { ...trigger, image_url: localUrl })}
                    placeholder={placeholders.image_url}
                    className={STRATEGY_INPUT_CLASS}
                />
            </div>
            <div className="col-span-3">
                <Input
                    value={localCaption}
                    onChange={(e) => setLocalCaption(e.target.value)}
                    onBlur={() => onUpdate(index, { ...trigger, caption: localCaption })}
                    placeholder={placeholders.image_caption}
                    className={STRATEGY_INPUT_CLASS}
                />
            </div>
            <div className="col-span-1 flex justify-center">
                <Button
                    type="button"
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

export function QuestionRow({
    q,
    index,
    topics,
    issues,
    onUpdate,
    onDelete,
    expanded,
    onToggle,
    labels,
    placeholders,
    lang,
}: {
    q: ExaminerQuestion;
    index: number;
    topics: string[];
    issues: ExaminerQuestionLintIssue[];
    onUpdate: UpdateQuestionFn;
    onDelete: (index: number) => void;
    expanded: boolean;
    onToggle: () => void;
    labels: StrategyFieldLabels;
    placeholders: StrategyFieldPlaceholders;
    lang: 'es' | 'en';
}) {
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

    const summary = (q.question || '').trim() || (lang === 'es' ? 'Pregunta sin enunciado' : 'Question without statement');
    const summaryShort = summary.length > 120 ? `${summary.slice(0, 120)}...` : summary;
    const expectedCount = parseListInput(q.expected_keys || '').length;
    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    return (
        <div
            data-question-bank-id={q.id}
            data-question-bank-index={index}
            className={cn(
                'rounded-2xl border bg-white p-4 shadow-sm',
                criticalCount > 0
                    ? 'border-red-300 bg-red-50/40'
                    : warningCount > 0
                        ? 'border-amber-300 bg-amber-50/40'
                        : 'border-slate-200'
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
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                                {q.id || `q_${index + 1}`}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                                {q.type === 'practica'
                                    ? (lang === 'es' ? 'Caso práctico' : 'Practical case')
                                    : (lang === 'es' ? 'Teórica' : 'Theoretical')}
                            </span>
                            {q.topic ? (
                                <StrategyCountBadge tone="primary">
                                    {q.topic}
                                </StrategyCountBadge>
                            ) : (
                                <StrategyCountBadge tone="slate">
                                    {lang === 'es' ? 'Común (sin tema)' : 'Common (no topic)'}
                                </StrategyCountBadge>
                            )}
                            {q.is_mandatory && (
                                <StrategyCountBadge tone="emerald">
                                    {lang === 'es' ? 'Obligatoria' : 'Mandatory'}
                                </StrategyCountBadge>
                            )}
                            <span className="text-[11px] text-slate-500">
                                {expectedCount} {lang === 'es' ? 'claves' : 'keys'}
                            </span>
                            {criticalCount > 0 && (
                                <StrategyCountBadge tone="orange">
                                    {criticalCount} {lang === 'es' ? 'crítico(s)' : 'critical'}
                                </StrategyCountBadge>
                            )}
                            {warningCount > 0 && (
                                <StrategyCountBadge tone="slate">
                                    {warningCount} warning(s)
                                </StrategyCountBadge>
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
                        <div
                            className={cn(
                                'rounded-lg border p-2 space-y-1',
                                criticalCount > 0
                                    ? 'border-red-200 bg-red-50/70'
                                    : 'border-amber-200 bg-amber-50/70'
                            )}
                        >
                            {issues.slice(0, 4).map((issue, issueIndex) => (
                                <p
                                    key={`${issue.severity}-${issueIndex}`}
                                    className={cn(
                                        'text-xs',
                                        issue.severity === 'critical'
                                            ? 'text-red-700'
                                            : 'text-amber-800'
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
                            className={`${STRATEGY_INPUT_CLASS} w-36 font-mono`}
                        />
                        <select
                            value={q.type}
                            onChange={(e) => onUpdate(index, 'type', e.target.value as ExaminerQuestion['type'])}
                            className={STRATEGY_SELECT_CLASS}
                        >
                            <option value="teorica">Teórica</option>
                            <option value="practica">Caso práctico</option>
                        </select>
                        <select
                            value={q.topic}
                            onChange={(e) => onUpdate(index, 'topic', e.target.value)}
                            className={STRATEGY_SELECT_CLASS}
                        >
                            <option value="">{labels.topics}</option>
                            {topics.map((topic) => (
                                <option key={topic} value={topic}>
                                    {topic}
                                </option>
                            ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                            <input
                                type="checkbox"
                                checked={q.is_mandatory}
                                onChange={(e) => onUpdate(index, 'is_mandatory', e.target.checked)}
                            />
                            {labels.mandatory}
                        </label>
                    </div>

                    <textarea
                        value={localQuestion}
                        onChange={(e) => setLocalQuestion(e.target.value)}
                        onBlur={() => onUpdate(index, 'question', localQuestion)}
                        placeholder={placeholders.question}
                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-20 text-xs`}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <textarea
                            value={localExpected}
                            onChange={(e) => setLocalExpected(e.target.value)}
                            onBlur={() => onUpdate(index, 'expected_keys', localExpected)}
                            placeholder={placeholders.expected}
                            className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-20 text-xs`}
                        />
                        <Input
                            value={localMedia}
                            onChange={(e) => setLocalMedia(e.target.value)}
                            onBlur={() => onUpdate(index, 'media_url', localMedia)}
                            placeholder={placeholders.media_url}
                            className={STRATEGY_INPUT_CLASS}
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
                            className={STRATEGY_INPUT_CLASS}
                        />
                        <div>
                            <Label className={STRATEGY_FIELD_LABEL_CLASS}>Máx. reintentos</Label>
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
                                className={STRATEGY_INPUT_CLASS}
                            />
                        </div>
                        <div>
                            <Label className={STRATEGY_FIELD_LABEL_CLASS}>Continuación</Label>
                            <select
                                value={q.continue_mode || 'ask_confirm'}
                                onChange={(e) => onUpdate(index, 'continue_mode', e.target.value as ExaminerQuestion['continue_mode'])}
                                className={STRATEGY_SELECT_CLASS}
                            >
                                <option value="ask_confirm">Pedir confirmación</option>
                                <option value="auto_next">Avanzar automático</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <Label className={STRATEGY_FIELD_LABEL_CLASS}>Mínimo de claves esperadas (opcional)</Label>
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
                            className={STRATEGY_INPUT_CLASS}
                            placeholder="Ej: 3"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                            <Label className={STRATEGY_FIELD_LABEL_CLASS}>
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
                                className={STRATEGY_INPUT_CLASS}
                                placeholder="Ej: 25"
                            />
                        </div>
                        <div>
                            <Label className={STRATEGY_FIELD_LABEL_CLASS}>
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
                                className={STRATEGY_INPUT_CLASS}
                                placeholder="Ej: 3"
                            />
                        </div>
                    </div>

                    <details className={STRATEGY_SUBPANEL_CLASS}>
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                            Plantillas scripted por resultado
                        </summary>
                        <div className="mt-2 space-y-2">
                            <textarea
                                value={localRetryIncomplete}
                                onChange={(e) => setLocalRetryIncomplete(e.target.value)}
                                onBlur={() => onUpdate(index, 'retry_incomplete_template', localRetryIncomplete)}
                                placeholder="Reintento incompleta (ej: Lamentablemente tu respuesta es incompleta. Inténtalo de nuevo {question})"
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <textarea
                                value={localRetryIncorrect}
                                onChange={(e) => setLocalRetryIncorrect(e.target.value)}
                                onBlur={() => onUpdate(index, 'retry_incorrect_template', localRetryIncorrect)}
                                placeholder="Reintento incorrecta"
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <textarea
                                value={localSecondFail}
                                onChange={(e) => setLocalSecondFail(e.target.value)}
                                onBlur={() => onUpdate(index, 'second_fail_template', localSecondFail)}
                                placeholder="Mensaje al segundo fallo"
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <textarea
                                value={localCorrectFeedback}
                                onChange={(e) => setLocalCorrectFeedback(e.target.value)}
                                onBlur={() => onUpdate(index, 'correct_feedback_template', localCorrectFeedback)}
                                placeholder="Feedback cuando está correcta"
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
                            />
                            <textarea
                                value={localContinuePrompt}
                                onChange={(e) => setLocalContinuePrompt(e.target.value)}
                                onBlur={() => onUpdate(index, 'continue_prompt_template', localContinuePrompt)}
                                placeholder="Pregunta para continuar (cuando continue_mode=ask_confirm)"
                                className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-16 text-xs`}
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

export function GlobalBlockersEditor({
    globalTriggers,
    sessionVars,
    onChange,
    lang,
    title,
    tooltipTitle,
    tooltipContent,
}: {
    globalTriggers: FlowStep[];
    sessionVars: Record<string, SessionVarConfig>;
    onChange: (newTriggers: FlowStep[], newSessionVars: Record<string, SessionVarConfig>) => void;
    lang: 'es' | 'en';
    title?: string;
    tooltipTitle?: string;
    tooltipContent?: string;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const hadIssuesRef = useRef(false);

    const lint = useMemo(
        () =>
            lintFlowConfig({
                flow_steps: [],
                global_triggers: globalTriggers,
                session_vars: sessionVars,
            } as unknown as BotConfig),
        [globalTriggers, sessionVars]
    );
    const hasIssues = lint.critical_count > 0 || lint.warning_count > 0;

    useEffect(() => {
        if (hasIssues && !hadIssuesRef.current) {
            setIsExpanded(true);
        }
        hadIssuesRef.current = hasIssues;
    }, [hasIssues]);

    return (
        <Card
            className={cn(
                STRATEGY_CARD_CLASS,
                lint.critical_count > 0
                    ? 'border-red-300'
                    : lint.warning_count > 0
                        ? 'border-amber-300'
                        : 'border-slate-200'
            )}
        >
            <CardHeader
                className={getStrategyHeaderClass('slate', true)}
                onClick={() => setIsExpanded((prev) => !prev)}
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
                            <StrategyCountBadge tone="orange">
                                {globalTriggers.length}
                            </StrategyCountBadge>
                        )}
                        {lint.critical_count > 0 && (
                            <StrategyCountBadge tone="orange">
                                {lang === 'es' ? `${lint.critical_count} crítico(s)` : `${lint.critical_count} critical`}
                            </StrategyCountBadge>
                        )}
                        {lint.warning_count > 0 && (
                            <StrategyCountBadge tone="slate">
                                {lang === 'es' ? `${lint.warning_count} warning(s)` : `${lint.warning_count} warning(s)`}
                            </StrategyCountBadge>
                        )}
                    </div>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
            </CardHeader>
            {isExpanded && (
                <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                    <div className="py-1">
                        <FlowEditor
                            steps={[]}
                            sessionVars={sessionVars}
                            globalTriggers={globalTriggers}
                            lang={lang}
                            hideFlowSteps={true}
                            onChange={(_, newVars, newGlobals) => onChange(newGlobals, newVars)}
                        />
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export function StrategyIntroMessageSection({
    introMessage,
    onCommit,
    labels,
    placeholders,
    lang,
    defaultExpanded = false,
}: {
    introMessage?: string;
    onCommit: (value: string) => void;
    labels: StrategyFieldLabels;
    placeholders: StrategyFieldPlaceholders;
    lang: 'es' | 'en';
    defaultExpanded?: boolean;
}) {
    const [expanded, setExpanded] = useState(defaultExpanded || !introMessage);

    return (
        <Card className={STRATEGY_CARD_CLASS}>
            <CardHeader
                className={getStrategyHeaderClass('primary', true)}
                onClick={() => setExpanded((prev) => !prev)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <CardTitle className="flex items-center gap-1 text-sm font-bold text-slate-800">
                            {labels.intro_message}
                            <HelpTooltip
                                title={lang === 'es' ? 'Mensaje de introducción' : 'Introduction message'}
                                content={lang === 'es'
                                    ? 'Es lo primero que ve el usuario al abrir el chat. Úsalo para contexto inicial y expectativas.'
                                    : 'This is the first message users see when they open chat. Use it to set context and expectations.'}
                            />
                        </CardTitle>
                        {introMessage && (
                            <StrategyCountBadge tone="primary">
                                ✓
                            </StrategyCountBadge>
                        )}
                    </div>
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                    <LocalTextarea
                        value={introMessage || ''}
                        onCommit={onCommit}
                        placeholder={placeholders.intro_message}
                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-32`}
                    />
                </CardContent>
            )}
        </Card>
    );
}

export function StrategyImageTriggersSection({
    triggers,
    onChange,
    labels,
    placeholders,
    lang,
}: {
    triggers: ImageTrigger[];
    onChange: (nextTriggers: ImageTrigger[]) => void;
    labels: StrategyFieldLabels;
    placeholders: StrategyFieldPlaceholders;
    lang: 'es' | 'en';
}) {
    const [expanded, setExpanded] = useState(false);
    const [pendingScrollIndex, setPendingScrollIndex] = useState<number | null>(null);

    useEffect(() => {
        if (pendingScrollIndex === null) return;
        const triggerElement = document.querySelector(
            `[data-image-trigger-index="${pendingScrollIndex}"]`
        ) as HTMLElement | null;
        if (!triggerElement) return;
        triggerElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingScrollIndex(null);
    }, [pendingScrollIndex, triggers.length]);

    const updateImageTrigger = (index: number, updated: ImageTrigger) => {
        const next = [...triggers];
        next[index] = updated;
        onChange(next);
    };

    const deleteImageTrigger = (index: number) => {
        onChange(triggers.filter((_, currentIndex) => currentIndex !== index));
    };

    const addImageTrigger = () => {
        setExpanded(true);
        setPendingScrollIndex(triggers.length);
        onChange([...triggers, { pattern: '', image_url: '', caption: '' }]);
    };

    return (
        <Card className={STRATEGY_CARD_CLASS}>
            <CardHeader
                className={getStrategyHeaderClass('slate', true)}
                onClick={() => setExpanded((prev) => !prev)}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4 text-primary" />
                        <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-1">
                            {labels.image_triggers}
                            <HelpTooltip
                                title={lang === 'es' ? 'Disparadores de imagen' : 'Image triggers'}
                                content={lang === 'es'
                                    ? 'Cuando la respuesta del bot coincide con un patrón, se muestra automáticamente la imagen asociada.'
                                    : 'When bot output matches a pattern, the associated image is shown automatically.'}
                            />
                        </CardTitle>
                        {triggers.length > 0 && (
                            <StrategyCountBadge tone="primary">
                                {triggers.length}
                            </StrategyCountBadge>
                        )}
                    </div>
                    {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
            </CardHeader>
            {expanded && (
                <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                    {triggers.map((trigger, index) => (
                        <ImageTriggerRow
                            key={index}
                            trigger={trigger}
                            index={index}
                            onUpdate={updateImageTrigger}
                            onDelete={deleteImageTrigger}
                            placeholders={placeholders}
                        />
                    ))}
                    <Button variant="outline" size="sm" onClick={addImageTrigger} className="w-full">
                        <Plus className="h-3 w-3 mr-1" /> {labels.add_trigger}
                    </Button>
                </CardContent>
            )}
        </Card>
    );
}
