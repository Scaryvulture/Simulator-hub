'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, ChevronDown, ChevronUp, Zap, MessageSquare, Bot, Settings2, AlertTriangle } from 'lucide-react';
import { cn, parseCSV } from '@/lib/utils';
import { HelpTooltip } from '@/components/admin/help-tooltip';
import { lintFlowConfig, type FlowLintIssue } from '@/lib/flow-linter';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { FlowEditorSessionVarRow } from './flow-editor-session-var-row';
import type { FlowAction, FlowRagAction, FlowStep, FlowTrigger, SessionVarConfig } from './flow-editor-types';

export type { FlowAction, FlowRagAction, FlowStep, FlowTrigger, SessionVarConfig } from './flow-editor-types';

interface Props {
    steps: FlowStep[];
    sessionVars: Record<string, SessionVarConfig>;
    globalTriggers?: FlowStep[];
    onChange: (
        steps: FlowStep[],
        sessionVars: Record<string, SessionVarConfig>,
        globalTriggers: FlowStep[]
    ) => void;
    lang: 'es' | 'en';
    hideFlowSteps?: boolean;
}

interface FlowStepEditorProps {
    scope: 'flow_steps' | 'global_triggers';
    step: FlowStep;
    stepIndex: number;
    allSteps: FlowStep[];
    criticalIssues: FlowLintIssue[];
    warningIssues: FlowLintIssue[];
    sessionVarNames: string[];
    onUpdateStep: (index: number, updates: Partial<FlowStep>) => void;
    onDeleteStep: (index: number) => void;
    onMoveStep: (index: number, direction: 'up' | 'down') => void;
    onAddTrigger: (stepIndex: number, type: FlowTrigger['type']) => void;
    onUpdateTrigger: (stepIndex: number, triggerIndex: number, updates: Partial<FlowTrigger>) => void;
    onDeleteTrigger: (stepIndex: number, triggerIndex: number) => void;
    onAddAction: (stepIndex: number, type: FlowAction['type']) => void;
    onUpdateAction: (stepIndex: number, actionIndex: number, updates: Partial<FlowAction>) => void;
    onDeleteAction: (stepIndex: number, actionIndex: number) => void;
    isExpanded: boolean;
    onToggle: () => void;
    lang: 'es' | 'en';
}

function FlowStepEditor({
    scope,
    step, stepIndex, allSteps, sessionVarNames,
    criticalIssues,
    warningIssues,
    onUpdateStep, onDeleteStep, onMoveStep,
    onAddTrigger, onUpdateTrigger, onDeleteTrigger,
    onAddAction, onUpdateAction, onDeleteAction,
    isExpanded, onToggle,
    lang
}: FlowStepEditorProps) {
    const [localId, setLocalId] = useState(step.id);
    const [localMessage, setLocalMessage] = useState(step.message || '');
    const [localLlmContext, setLocalLlmContext] = useState(step.llm_context || '');
    const [localRagQuery, setLocalRagQuery] = useState(step.rag_action?.query_template || '');
    const [localTriggerPatterns, setLocalTriggerPatterns] = useState<Record<number, string>>({});
    const [localConditionValues, setLocalConditionValues] = useState<Record<number, string>>({});
    const [localPhraseValues, setLocalPhraseValues] = useState<Record<number, string>>({});
    const [localNegativePhraseValues, setLocalNegativePhraseValues] = useState<Record<number, string>>({});

    useEffect(() => {
        setLocalId(step.id);
    }, [step.id]);

    useEffect(() => {
        setLocalMessage(step.message || '');
    }, [step.message]);

    useEffect(() => {
        setLocalLlmContext(step.llm_context || '');
    }, [step.llm_context]);

    useEffect(() => {
        setLocalRagQuery(step.rag_action?.query_template || '');
    }, [step.rag_action?.query_template]);

    useEffect(() => {
        const patterns: Record<number, string> = {};
        const condValues: Record<number, string> = {};
        const phraseValues: Record<number, string> = {};
        const negativePhraseValues: Record<number, string> = {};
        step.triggers.forEach((t, i) => {
            if (t.type === 'REGEX') patterns[i] = t.pattern || '';
            if (t.type === 'CONDITION') condValues[i] = String(t.condition?.value || '');
            if (t.type === 'PHRASE_LIST') {
                phraseValues[i] = (t.phrase_list?.phrases || []).join(', ');
                negativePhraseValues[i] = (t.phrase_list?.negative_phrases || []).join(', ');
            }
        });
        setLocalTriggerPatterns(patterns);
        setLocalConditionValues(condValues);
        setLocalPhraseValues(phraseValues);
        setLocalNegativePhraseValues(negativePhraseValues);
    }, [step.triggers]);

    const commitId = () => {
        if (localId !== step.id) {
            onUpdateStep(stepIndex, { id: localId });
        }
    };

    const commitMessage = () => {
        onUpdateStep(stepIndex, { message: localMessage });
    };

    const commitLlmContext = () => {
        onUpdateStep(stepIndex, { llm_context: localLlmContext });
    };

    const commitRagAction = (updates: Partial<FlowRagAction>) => {
        const current = step.rag_action || {};
        onUpdateStep(stepIndex, { rag_action: { ...current, ...updates } });
    };

    const parseTypedValue = (type: 'string' | 'number' | 'boolean', raw: string): string | number | boolean => {
        if (type === 'number') return Number(raw || 0);
        if (type === 'boolean') return raw === 'true';
        return raw;
    };

    const toVisualPriority = (internal?: number): number => {
        const normalized = typeof internal === 'number' && Number.isFinite(internal) ? internal : 0;
        return -Math.trunc(normalized);
    };

    const toInternalPriority = (raw: string): number => {
        const parsed = Number(raw || 0);
        if (!Number.isFinite(parsed)) return 0;
        return -Math.trunc(parsed);
    };

    const inferActionValueType = (value: FlowAction['value']): 'string' | 'number' | 'boolean' | 'null' => {
        if (value === null) return 'null';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        return 'string';
    };

    const coerceActionValue = (
        valueType: 'string' | 'number' | 'boolean' | 'null',
        rawValue: string,
        fallback: FlowAction['value']
    ): FlowAction['value'] => {
        if (valueType === 'null') return null;
        if (valueType === 'number') {
            const parsed = Number(rawValue);
            return Number.isFinite(parsed) ? parsed : (typeof fallback === 'number' ? fallback : 0);
        }
        if (valueType === 'boolean') {
            return rawValue === 'true';
        }
        return rawValue;
    };

    const getFilterType = (value: unknown): 'string' | 'number' | 'boolean' => {
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        return 'string';
    };

    const updateRagFilter = (oldKey: string, nextKey: string, type: 'string' | 'number' | 'boolean', rawValue: string) => {
        const filters = { ...(step.rag_action?.metadata_filters || {}) } as Record<string, string | number | boolean>;
        delete filters[oldKey];
        const normalizedKey = nextKey.trim();
        if (normalizedKey) {
            filters[normalizedKey] = parseTypedValue(type, rawValue);
        }
        commitRagAction({ metadata_filters: filters });
    };

    const addRagFilter = () => {
        const filters = { ...(step.rag_action?.metadata_filters || {}) } as Record<string, string | number | boolean>;
        let i = 1;
        let key = `field_${i}`;
        while (Object.prototype.hasOwnProperty.call(filters, key)) {
            i += 1;
            key = `field_${i}`;
        }
        filters[key] = '';
        commitRagAction({ metadata_filters: filters });
    };

    const removeRagFilter = (key: string) => {
        const filters = { ...(step.rag_action?.metadata_filters || {}) } as Record<string, string | number | boolean>;
        delete filters[key];
        commitRagAction({ metadata_filters: filters });
    };

    const commitTriggerPattern = (triggerIndex: number) => {
        onUpdateTrigger(stepIndex, triggerIndex, { pattern: localTriggerPatterns[triggerIndex] || '' });
    };

    const commitConditionValue = (triggerIndex: number) => {
        onUpdateTrigger(stepIndex, triggerIndex, {
            condition: { ...step.triggers[triggerIndex].condition!, value: localConditionValues[triggerIndex] || '' }
        });
    };

    const commitPhraseList = (triggerIndex: number) => {
        const trigger = step.triggers[triggerIndex];
        const currentPhrase = trigger.phrase_list || {};
        onUpdateTrigger(stepIndex, triggerIndex, {
            phrase_list: {
                ...currentPhrase,
                phrases: parseCSV(localPhraseValues[triggerIndex] || ''),
                negative_phrases: parseCSV(localNegativePhraseValues[triggerIndex] || ''),
            },
        });
    };

    const triggerCriticalIssueIndexes = useMemo(() => {
        const indexes = new Set<number>();
        criticalIssues.forEach((issue) => {
            const match = issue.path?.match(/\.triggers\.(\d+)\./);
            if (match) indexes.add(Number(match[1]));
        });
        return indexes;
    }, [criticalIssues]);

    const triggerWarningIssueIndexes = useMemo(() => {
        const indexes = new Set<number>();
        warningIssues.forEach((issue) => {
            const match = issue.path?.match(/\.triggers\.(\d+)\./);
            if (match) indexes.add(Number(match[1]));
        });
        return indexes;
    }, [warningIssues]);

    const hasNextStepCriticalIssue = criticalIssues.some((issue) =>
        issue.code === 'NEXT_STEP_UNKNOWN'
        || issue.path === `${scope}.${stepIndex}.next_step`
        || issue.path?.startsWith(`${scope}.${stepIndex}.next_step.`)
    );

    const hasNextStepWarningIssue = warningIssues.some((issue) =>
        issue.path === `${scope}.${stepIndex}.next_step`
        || issue.path?.startsWith(`${scope}.${stepIndex}.next_step.`)
    );

    return (
        <Card
            className={cn(
                "bg-white border-slate-200 rounded-2xl overflow-hidden",
                criticalIssues.length > 0 && "border-red-300 shadow-[0_0_0_1px_rgba(239,68,68,0.25)] dark:border-red-500/60",
                criticalIssues.length === 0 && warningIssues.length > 0 && "border-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.25)] dark:border-amber-500/60"
            )}
            data-flow-step-id={step.id}
            data-flow-step-scope={scope}
            data-flow-step-index={stepIndex}
        >
            <CardHeader
                className={cn(
                    "py-3 px-4 cursor-pointer flex flex-row items-center justify-between border-b",
                    step.mode === 'SCRIPTED' ? "bg-secondary border-border" : "bg-primary/10 border-primary/20",
                    criticalIssues.length > 0 && "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-500/60",
                    criticalIssues.length === 0 && warningIssues.length > 0 && "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-500/60"
                )}
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        step.mode === 'SCRIPTED' ? "bg-secondary text-primary border border-primary/15" : "bg-primary/20 text-primary border border-primary/25"
                    )}>
                        {step.mode === 'SCRIPTED' ? <MessageSquare className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-800">{step.id}</span>
                            <span className={cn(
                                "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full",
                                step.mode === 'SCRIPTED' ? "bg-secondary text-primary border border-primary/15" : "bg-primary/20 text-primary border border-primary/25"
                            )}>
                                {step.mode === 'SCRIPTED'
                                    ? (lang === 'es' ? 'Guionado' : 'Scripted')
                                    : (lang === 'es' ? 'Con IA' : 'AI')}
                            </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                            {step.triggers.length} {lang === 'es' ? 'disparador(es)' : 'trigger(s)'} • {step.actions?.length || 0} {lang === 'es' ? 'acción(es)' : 'action(s)'}
                        </span>
                        {criticalIssues.length > 0 && (
                            <p className="text-[10px] font-bold text-red-600 dark:text-red-400 mt-1">
                                {lang === 'es'
                                    ? `${criticalIssues.length} error(es) crítico(s)`
                                    : `${criticalIssues.length} critical error(s)`}
                            </p>
                        )}
                        {criticalIssues.length === 0 && warningIssues.length > 0 && (
                            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 mt-1">
                                {lang === 'es'
                                    ? `${warningIssues.length} warning(s)`
                                    : `${warningIssues.length} warning(s)`}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onMoveStep(stepIndex, 'up'); }}>
                        <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onMoveStep(stepIndex, 'down'); }}>
                        <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={(e) => { e.stopPropagation(); onDeleteStep(stepIndex); }}>
                        <Trash2 className="h-4 w-4" />
                    </Button>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="p-4 space-y-4">
                    {criticalIssues.length > 0 && (
                        <div className="rounded-xl border border-red-300 bg-red-50/80 dark:bg-red-950/25 dark:border-red-500/60 p-3 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-300">
                                {lang === 'es' ? 'Errores críticos en este paso' : 'Critical errors in this step'}
                            </p>
                            <ul className="space-y-1">
                                {criticalIssues.slice(0, 6).map((issue, issueIndex) => {
                                    const prefix = `${scope}.${stepIndex}.`;
                                    const localPath = issue.path?.startsWith(prefix) ? issue.path.slice(prefix.length) : issue.path;
                                    return (
                                        <li key={`${issue.code}-${issueIndex}`} className="text-xs text-red-700 dark:text-red-200">
                                            • {issue.message}{localPath ? ` [${localPath}]` : ''}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    {warningIssues.length > 0 && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50/80 dark:bg-amber-950/25 dark:border-amber-500/60 p-3 space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                                {lang === 'es' ? 'Warnings en este paso' : 'Warnings in this step'}
                            </p>
                            <ul className="space-y-1">
                                {warningIssues.slice(0, 6).map((issue, issueIndex) => {
                                    const prefix = `${scope}.${stepIndex}.`;
                                    const localPath = issue.path?.startsWith(prefix) ? issue.path.slice(prefix.length) : issue.path;
                                    return (
                                        <li key={`${issue.code}-${issueIndex}`} className="text-xs text-amber-800 dark:text-amber-200">
                                            • {issue.message}{localPath ? ` [${localPath}]` : ''}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-4 gap-4">
                        <div>
                            <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'ID del paso' : 'Step ID'}</Label>
                            <Input
                                value={localId}
                                onChange={(e) => setLocalId(e.target.value)}
                                onBlur={commitId}
                                className="h-9 text-sm font-mono"
                            />
                        </div>
                        <div>
                            <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Tipo' : 'Type'}</Label>
                            <select
                                value={step.mode}
                                onChange={(e) => onUpdateStep(stepIndex, { mode: e.target.value as 'SCRIPTED' | 'LLM' })}
                                className="w-full h-9 rounded-lg border border-slate-200 text-sm px-2"
                            >
                                <option value="SCRIPTED">{lang === 'es' ? 'Guionado (sin IA)' : 'Scripted (no AI)'}</option>
                                <option value="LLM">{lang === 'es' ? 'Con IA' : 'With AI'}</option>
                            </select>
                        </div>
                        <div>
                            <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Siguiente paso' : 'Next step'}</Label>
                            <select
                                value={step.next_step || ''}
                                onChange={(e) => onUpdateStep(stepIndex, { next_step: e.target.value || undefined })}
                                className={cn(
                                    "w-full h-9 rounded-lg border border-slate-200 text-sm px-2",
                                    hasNextStepCriticalIssue && "border-red-400 bg-red-50 dark:bg-red-950/20 dark:border-red-500",
                                    !hasNextStepCriticalIssue && hasNextStepWarningIssue && "border-amber-400 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-500"
                                )}
                            >
                                <option value="">{lang === 'es' ? '(mantener actual)' : '(keep current)'}</option>
                                {allSteps.map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Prioridad' : 'Priority'}</Label>
                            <Input
                                type="number"
                                value={toVisualPriority(step.priority)}
                                onChange={(e) => onUpdateStep(stepIndex, { priority: toInternalPriority(e.target.value) })}
                                className="h-9 text-sm"
                                title={lang === 'es'
                                    ? 'Se usa para ordenar candidatos en fallback ambiguo de PHRASE_LIST.'
                                    : 'Used to order candidates in ambiguous PHRASE_LIST fallback.'}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">
                                {lang === 'es'
                                    ? 'Solo aplica al desempate en fallback ambiguo; en coincidencia determinística manda el orden de pasos.'
                                    : 'Only applies to ambiguous fallback tie-breaks; deterministic matches still follow step order.'}
                            </p>
                        </div>
                    </div>

                    <div>
                        <Label className="text-[10px] text-slate-400 uppercase">
                            {step.mode === 'SCRIPTED'
                                ? (lang === 'es' ? 'Mensaje (usar {variable} para interpolar)' : 'Message (use {variable} interpolation)')
                                : (lang === 'es' ? 'Instrucciones adicionales para IA' : 'Additional AI instructions')}
                        </Label>
                        <textarea
                            value={step.mode === 'SCRIPTED' ? localMessage : localLlmContext}
                            onChange={(e) => {
                                if (step.mode === 'SCRIPTED') setLocalMessage(e.target.value);
                                else setLocalLlmContext(e.target.value);
                            }}
                            onBlur={() => {
                                if (step.mode === 'SCRIPTED') commitMessage();
                                else commitLlmContext();
                            }}
                            className="w-full h-24 rounded-lg border border-slate-200 text-sm p-3 resize-none"
                            placeholder={step.mode === 'SCRIPTED'
                                ? (lang === 'es' ? 'Hoy es {day}. {name} llega en su {vehicle}...' : 'Today is {day}. {name} arrives in their {vehicle}...')
                                : (lang === 'es' ? 'Respondé como cliente {archetype}. Mantené coherencia.' : 'Respond as customer {archetype}. Keep consistency.')}
                        />
                    </div>

                    {step.mode === 'LLM' && (
                        <div className="space-y-3 border border-primary/20 bg-primary/5 rounded-xl p-3 dark:bg-primary/10">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] text-primary uppercase font-bold tracking-wide">
                                    {lang === 'es' ? 'RAG por paso' : 'Per-step RAG'}
                                </Label>
                                <label className="text-xs flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={step.rag_action?.enabled ?? false}
                                        onChange={(e) => commitRagAction({ enabled: e.target.checked })}
                                    />
                                    {lang === 'es' ? 'Activado' : 'Enabled'}
                                </label>
                            </div>

                            {(step.rag_action?.enabled ?? false) && (
                                <>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[10px] text-slate-500 uppercase">{lang === 'es' ? 'Propósito' : 'Purpose'}</Label>
                                            <select
                                                value={step.rag_action?.purpose || 'context'}
                                                onChange={(e) => commitRagAction({ purpose: e.target.value as FlowRagAction['purpose'] })}
                                                className="w-full h-9 rounded-lg border border-slate-200 text-sm px-2"
                                            >
                                                <option value="context">{lang === 'es' ? 'Contexto para responder' : 'Context for response'}</option>
                                                <option value="validate_user_response">{lang === 'es' ? 'Validar respuesta del usuario' : 'Validate user response'}</option>
                                                <option value="evaluate_conversation">{lang === 'es' ? 'Evaluar conversación' : 'Evaluate conversation'}</option>
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-slate-500 uppercase">{lang === 'es' ? 'Estrategia' : 'Strategy'}</Label>
                                            <select
                                                value={step.rag_action?.strategy || 'similarity'}
                                                onChange={(e) => commitRagAction({ strategy: e.target.value as FlowRagAction['strategy'] })}
                                                className="w-full h-9 rounded-lg border border-slate-200 text-sm px-2"
                                            >
                                                <option value="metadata_first">{lang === 'es' ? 'Primero metadatos' : 'Metadata-first'}</option>
                                                <option value="similarity">{lang === 'es' ? 'Similitud' : 'Similarity'}</option>
                                                <option value="hybrid">{lang === 'es' ? 'Híbrido' : 'Hybrid'}</option>
                                            </select>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {lang === 'es'
                                                    ? 'Define cómo se recupera la evidencia: metadatos, similitud o híbrido.'
                                                    : 'Defines how evidence is retrieved: metadata, similarity, or hybrid.'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <Label className="text-[10px] text-slate-500 uppercase">{lang === 'es' ? 'Estricto' : 'Strict'}</Label>
                                            <select
                                                value={step.rag_action?.strict === undefined ? 'inherit' : (step.rag_action.strict ? 'true' : 'false')}
                                                onChange={(e) => {
                                                    if (e.target.value === 'inherit') commitRagAction({ strict: undefined });
                                                    else commitRagAction({ strict: e.target.value === 'true' });
                                                }}
                                                className="w-full h-9 rounded-lg border border-slate-200 text-sm px-2"
                                            >
                                                <option value="inherit">{lang === 'es' ? 'Heredar del bot' : 'Inherit from bot'}</option>
                                                <option value="true">{lang === 'es' ? 'Sí, estricto' : 'Yes, strict'}</option>
                                                <option value="false">{lang === 'es' ? 'No estricto' : 'Not strict'}</option>
                                            </select>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {lang === 'es'
                                                    ? 'Modo estricto exige mejor evidencia antes de responder.'
                                                    : 'Strict mode requires stronger evidence before responding.'}
                                            </p>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] text-slate-500 uppercase">Top-K ({lang === 'es' ? 'opcional' : 'optional'})</Label>
                                            <Input
                                                type="number"
                                                value={step.rag_action?.top_k ?? ''}
                                                onChange={(e) => commitRagAction({ top_k: e.target.value ? Number(e.target.value) : undefined })}
                                                className="h-9 text-sm"
                                                placeholder={lang === 'es' ? 'Heredar' : 'Inherit'}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <Label className="text-[10px] text-slate-500 uppercase">{lang === 'es' ? 'Plantilla de consulta' : 'Query Template'}</Label>
                                        <Input
                                            value={localRagQuery}
                                            onChange={(e) => {
                                                const value = e.target.value;
                                                setLocalRagQuery(value);
                                                commitRagAction({ query_template: value });
                                            }}
                                            onBlur={() => commitRagAction({ query_template: localRagQuery })}
                                            className="h-9 text-sm"
                                            placeholder={lang === 'es' ? 'Pregunta {question_id} del dominio OPESSA' : 'Question {question_id} from OPESSA domain'}
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {lang === 'es'
                                                ? 'Texto que se envía a búsqueda RAG. Puedes interpolar variables como {question_id}.'
                                                : 'Text sent to RAG retrieval. You can interpolate variables like {question_id}.'}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] text-slate-500 uppercase">{lang === 'es' ? 'Filtros de metadatos' : 'Metadata Filters'}</Label>
                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addRagFilter}>
                                                + {lang === 'es' ? 'Filtro' : 'Filter'}
                                            </Button>
                                        </div>
                                        <div className="space-y-2">
                                            {Object.entries(step.rag_action?.metadata_filters || {}).map(([key, value]) => {
                                                const detectedType = getFilterType(value);
                                                return (
                                                    <div key={key} className="grid grid-cols-12 gap-2 items-center">
                                                        <Input
                                                            value={key}
                                                            onChange={(e) => updateRagFilter(key, e.target.value, detectedType, String(value))}
                                                            className="col-span-4 h-8 text-xs font-mono"
                                                            placeholder="question_id"
                                                        />
                                                        <select
                                                            value={detectedType}
                                                            onChange={(e) => updateRagFilter(key, key, e.target.value as 'string' | 'number' | 'boolean', String(value))}
                                                            className="col-span-3 h-8 rounded border border-slate-200 text-xs px-2"
                                                        >
                                                            <option value="string">string</option>
                                                            <option value="number">number</option>
                                                            <option value="boolean">boolean</option>
                                                        </select>
                                                        {detectedType === 'boolean' ? (
                                                            <select
                                                                value={String(value)}
                                                                onChange={(e) => updateRagFilter(key, key, 'boolean', e.target.value)}
                                                                className="col-span-4 h-8 rounded border border-slate-200 text-xs px-2"
                                                            >
                                                                <option value="true">true</option>
                                                                <option value="false">false</option>
                                                            </select>
                                                        ) : (
                                                            <Input
                                                                value={String(value)}
                                                                onChange={(e) => updateRagFilter(key, key, detectedType, e.target.value)}
                                                                className="col-span-4 h-8 text-xs"
                                                                placeholder={lang === 'es' ? 'valor' : 'value'}
                                                            />
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="col-span-1 h-7 w-7 text-red-400"
                                                            onClick={() => removeRagFilter(key)}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                );
                                            })}
                                            {Object.keys(step.rag_action?.metadata_filters || {}).length === 0 && (
                                                <p className="text-xs text-slate-400 italic">
                                                    {lang === 'es' ? 'Sin filtros configurados.' : 'No filters configured.'}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Disparadores' : 'Triggers'}</Label>
                            <div className="flex gap-1">
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddTrigger(stepIndex, 'START')}>
                                    + {lang === 'es' ? 'Inicio' : 'Start'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddTrigger(stepIndex, 'REGEX')}>
                                    + {lang === 'es' ? 'Texto' : 'Text'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddTrigger(stepIndex, 'PHRASE_LIST')}>
                                    + {lang === 'es' ? 'Lista' : 'Phrase list'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddTrigger(stepIndex, 'AFTER_STEP')}>
                                    + {lang === 'es' ? 'Después' : 'After'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddTrigger(stepIndex, 'CONDITION')}>
                                    + {lang === 'es' ? 'Condición' : 'Condition'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddTrigger(stepIndex, 'DEFAULT')}>
                                    + {lang === 'es' ? 'Por defecto' : 'Default'}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-[11px] text-slate-500">
                                {lang === 'es'
                                    ? 'Prioridad (número): en este editor mayor número = mayor prioridad, pero solo para fallback ambiguo de PHRASE_LIST.'
                                    : 'Priority (number): in this editor higher number = higher priority, but only for ambiguous PHRASE_LIST fallback.'}
                            </p>
                            {step.triggers.map((trigger, triggerIndex) => {
                                const hasTriggerCriticalIssue = triggerCriticalIssueIndexes.has(triggerIndex);
                                const hasTriggerWarningIssue = triggerWarningIssueIndexes.has(triggerIndex);
                                if (trigger.type === 'PHRASE_LIST') {
                                    const phraseCfg = trigger.phrase_list || {};
                                    const scope = phraseCfg.scope || {};
                                    const fuzzy = phraseCfg.fuzzy || {};
                                    const guardrails = phraseCfg.guardrails || {};
                                    const modelFallback = phraseCfg.model_fallback || {};

                                    return (
                                        <div
                                            key={triggerIndex}
                                            className={cn(
                                                "p-3 bg-slate-50 rounded-lg border border-slate-100 space-y-3",
                                                hasTriggerCriticalIssue && "border-red-300 bg-red-50/70 dark:border-red-500/60 dark:bg-red-950/20",
                                                !hasTriggerCriticalIssue && hasTriggerWarningIssue && "border-amber-300 bg-amber-50/70 dark:border-amber-500/60 dark:bg-amber-950/20"
                                            )}
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-1 rounded">
                                                    {trigger.type}
                                                </span>
                                                <Label className="text-[10px] text-slate-500 uppercase">
                                                    {lang === 'es' ? 'Prioridad' : 'Priority'}
                                                </Label>
                                                <Input
                                                    type="number"
                                                    value={toVisualPriority(trigger.priority)}
                                                    onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, { priority: toInternalPriority(e.target.value) })}
                                                    className="h-7 w-20 text-xs"
                                                    placeholder="0"
                                                    aria-label={lang === 'es' ? 'Prioridad del disparador' : 'Trigger priority'}
                                                    title={lang === 'es'
                                                        ? 'Solo impacta el fallback ambiguo de PHRASE_LIST.'
                                                        : 'Only impacts ambiguous PHRASE_LIST fallback.'}
                                                />
                                                <HelpTooltip
                                                    title={lang === 'es' ? 'Prioridad del disparador' : 'Trigger priority'}
                                                    content={lang === 'es'
                                                        ? 'No cambia la condición del trigger. Solo se usa para ordenar candidatos ambiguos en fallback de PHRASE_LIST.'
                                                        : 'It does not change trigger conditions. It is only used to order ambiguous candidates in PHRASE_LIST fallback.'}
                                                />
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 ml-auto" onClick={() => onDeleteTrigger(stepIndex, triggerIndex)}>
                                                    <Trash2 className="h-3 w-3" />
                                                </Button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Frases que sí activan (coma separada)' : 'Phrases that should activate (comma-separated)'}
                                                    </Label>
                                                    <Input
                                                        value={localPhraseValues[triggerIndex] ?? (phraseCfg.phrases || []).join(', ')}
                                                        onChange={(e) => setLocalPhraseValues(prev => ({ ...prev, [triggerIndex]: e.target.value }))}
                                                        onBlur={() => commitPhraseList(triggerIndex)}
                                                        className="h-8 text-sm"
                                                        placeholder={lang === 'es' ? '"gracias, hasta luego", chau' : '"thanks, bye", see you'}
                                                    />
                                                </div>
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Frases que NO deben activar (opc.)' : 'Phrases that should NOT activate (opt.)'}
                                                    </Label>
                                                    <Input
                                                        value={localNegativePhraseValues[triggerIndex] ?? (phraseCfg.negative_phrases || []).join(', ')}
                                                        onChange={(e) => setLocalNegativePhraseValues(prev => ({ ...prev, [triggerIndex]: e.target.value }))}
                                                        onBlur={() => commitPhraseList(triggerIndex)}
                                                        className="h-8 text-sm"
                                                        placeholder={lang === 'es' ? '"gracias pero", "y otra cosa"' : '"thanks but", "and another thing"'}
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-4 gap-2">
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Dónde buscar la frase' : 'Where to search'}
                                                    </Label>
                                                    <select
                                                        value={scope.mode || 'full_message'}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                scope: { ...scope, mode: e.target.value as 'full_message' | 'tail_only' },
                                                            },
                                                        })}
                                                        className="h-8 w-full rounded border border-slate-200 text-sm px-2"
                                                    >
                                                        <option value="full_message">{lang === 'es' ? 'Todo el mensaje' : 'Full message'}</option>
                                                        <option value="tail_only">{lang === 'es' ? 'Solo el final del mensaje' : 'Message ending only'}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Tipo de coincidencia exacta' : 'Exact matching type'}
                                                    </Label>
                                                    <select
                                                        value={phraseCfg.exact_mode || 'token_boundary'}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                exact_mode: e.target.value as 'token_boundary' | 'suffix' | 'substring',
                                                            },
                                                        })}
                                                        className="h-8 w-full rounded border border-slate-200 text-sm px-2"
                                                    >
                                                        <option value="token_boundary">{lang === 'es' ? 'Palabra completa (recomendado)' : 'Whole token (recommended)'}</option>
                                                        <option value="suffix">{lang === 'es' ? 'Final del mensaje' : 'Message ending'}</option>
                                                        <option value="substring">{lang === 'es' ? 'Texto dentro de texto' : 'Text inside text'}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Tolerancia a typos' : 'Typo tolerance'}
                                                    </Label>
                                                    <select
                                                        value={fuzzy.enabled === false ? 'off' : 'on'}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                fuzzy: { ...fuzzy, enabled: e.target.value === 'on' },
                                                            },
                                                        })}
                                                        className="h-8 w-full rounded border border-slate-200 text-sm px-2"
                                                    >
                                                        <option value="on">{lang === 'es' ? 'Activada' : 'On'}</option>
                                                        <option value="off">{lang === 'es' ? 'Desactivada' : 'Off'}</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Si queda ambiguo, usar modelo' : 'If ambiguous, use model'}
                                                    </Label>
                                                    <select
                                                        value={modelFallback.mode || 'off'}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                model_fallback: { ...modelFallback, mode: e.target.value as 'off' | 'ambiguous_only' },
                                                            },
                                                        })}
                                                        className="h-8 w-full rounded border border-slate-200 text-sm px-2"
                                                    >
                                                        <option value="off">{lang === 'es' ? 'No' : 'No'}</option>
                                                        <option value="ambiguous_only">{lang === 'es' ? 'Sí, solo en ambigüedad' : 'Yes, ambiguous only'}</option>
                                                    </select>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-3 gap-2">
                                                <label className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(guardrails.block_on_question)}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                guardrails: { ...guardrails, block_on_question: e.target.checked },
                                                            },
                                                        })}
                                                    />
                                                    {lang === 'es' ? 'Bloquear si parece pregunta' : 'Block if message looks like a question'}
                                                </label>
                                                <label className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(guardrails.block_on_continuation_words)}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                guardrails: { ...guardrails, block_on_continuation_words: e.target.checked },
                                                            },
                                                        })}
                                                    />
                                                    {lang === 'es' ? 'Bloquear si continúa la charla ("pero", "además", etc.)' : 'Block if user continues conversation ("but", "also", etc.)'}
                                                </label>
                                                <div>
                                                    <Label className="text-[10px] text-slate-400 uppercase">
                                                        {lang === 'es' ? 'Nombre interno (opcional)' : 'Internal name (optional)'}
                                                    </Label>
                                                    <Input
                                                        value={phraseCfg.intent_name || ''}
                                                        onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, {
                                                            phrase_list: {
                                                                ...phraseCfg,
                                                                intent_name: e.target.value,
                                                            },
                                                        })}
                                                        className="h-8 text-xs"
                                                        placeholder={lang === 'es' ? 'ej: cierre_conversacion' : 'e.g. close_conversation'}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={triggerIndex}
                                        className={cn(
                                            "flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-100",
                                            hasTriggerCriticalIssue && "border-red-300 bg-red-50/70 dark:border-red-500/60 dark:bg-red-950/20",
                                            !hasTriggerCriticalIssue && hasTriggerWarningIssue && "border-amber-300 bg-amber-50/70 dark:border-amber-500/60 dark:bg-amber-950/20"
                                        )}
                                    >
                                        <span className="text-[10px] font-bold text-primary uppercase bg-primary/10 px-2 py-1 rounded">
                                            {trigger.type}
                                        </span>
                                        <Label className="text-[10px] text-slate-500 uppercase">
                                            {lang === 'es' ? 'Prioridad' : 'Priority'}
                                        </Label>
                                        <Input
                                            type="number"
                                            value={toVisualPriority(trigger.priority)}
                                            onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, { priority: toInternalPriority(e.target.value) })}
                                            className="h-8 w-20 text-xs"
                                            placeholder="0"
                                            aria-label={lang === 'es' ? 'Prioridad del disparador' : 'Trigger priority'}
                                            title={lang === 'es'
                                                ? 'Solo impacta el fallback ambiguo de PHRASE_LIST.'
                                                : 'Only impacts ambiguous PHRASE_LIST fallback.'}
                                        />
                                        {trigger.type === 'REGEX' && (
                                            <Input
                                                value={localTriggerPatterns[triggerIndex] ?? (trigger.pattern || '')}
                                                onChange={(e) => setLocalTriggerPatterns(prev => ({ ...prev, [triggerIndex]: e.target.value }))}
                                                onBlur={() => commitTriggerPattern(triggerIndex)}
                                                className="h-8 text-sm flex-1 font-mono"
                                                placeholder="chau|hasta luego|nos vemos"
                                            />
                                        )}
                                        {trigger.type === 'AFTER_STEP' && (
                                            <select
                                                value={trigger.step_id || ''}
                                                onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, { step_id: e.target.value })}
                                                className="h-8 flex-1 rounded border border-slate-200 text-sm px-2"
                                            >
                                                <option value="">{lang === 'es' ? 'Seleccionar paso...' : 'Select step...'}</option>
                                                {allSteps.filter(s => s.id !== step.id).map(s => <option key={s.id} value={s.id}>{s.id}</option>)}
                                            </select>
                                        )}
                                        {trigger.type === 'CONDITION' && (
                                            <div className="flex-1 flex items-center gap-2">
                                                <select
                                                    value={trigger.condition?.var || 'user_message'}
                                                    onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, { condition: { ...trigger.condition!, var: e.target.value } })}
                                                    className="h-8 rounded border border-slate-200 text-sm px-2"
                                                >
                                                    <option value="user_message">{lang === 'es' ? 'Mensaje del usuario' : 'User message'}</option>
                                                    {sessionVarNames.map(v => <option key={v} value={v}>{v}</option>)}
                                                </select>
                                                <select
                                                    value={trigger.condition?.op || 'contains'}
                                                    onChange={(e) => onUpdateTrigger(stepIndex, triggerIndex, { condition: { ...trigger.condition!, op: e.target.value as NonNullable<FlowTrigger['condition']>['op'] } })}
                                                    className="h-8 rounded border border-slate-200 text-sm px-2"
                                                >
                                                    <option value="contains">{lang === 'es' ? 'contiene' : 'contains'}</option>
                                                    <option value="not_contains">{lang === 'es' ? 'no contiene' : 'does not contain'}</option>
                                                    <option value="ends_with">{lang === 'es' ? 'termina con' : 'ends with'}</option>
                                                    <option value="not_ends_with">{lang === 'es' ? 'no termina con' : 'does not end with'}</option>
                                                    <option value="equals">{lang === 'es' ? 'es igual a' : 'equals'}</option>
                                                </select>
                                                <Input
                                                    value={localConditionValues[triggerIndex] ?? String(trigger.condition?.value || '')}
                                                    onChange={(e) => setLocalConditionValues(prev => ({ ...prev, [triggerIndex]: e.target.value }))}
                                                    onBlur={() => commitConditionValue(triggerIndex)}
                                                    className="h-8 text-sm flex-1"
                                                    placeholder={lang === 'es' ? 'valor' : 'value'}
                                                />
                                            </div>
                                        )}
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => onDeleteTrigger(stepIndex, triggerIndex)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                );
                            })}
                            {step.triggers.length === 0 && (
                                <p className="text-xs text-slate-400 italic p-2">
                                    {lang === 'es' ? 'Sin disparadores. Agrega uno arriba.' : 'No triggers yet. Add one above.'}
                                </p>
                            )}
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Acciones' : 'Actions'}</Label>
                            <div className="flex gap-1">
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddAction(stepIndex, 'END_SESSION')}>
                                    + {lang === 'es' ? 'Terminar' : 'End'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddAction(stepIndex, 'SET_VAR')}>
                                    + {lang === 'es' ? 'Definir variable' : 'Set variable'}
                                </Button>
                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAddAction(stepIndex, 'INCREMENT')}>
                                    + {lang === 'es' ? 'Incrementar' : 'Increment'}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            {step.actions?.map((action, actionIndex) => (
                                <div key={actionIndex} className="space-y-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                                    <span className="text-[10px] font-bold text-primary uppercase bg-primary/20 border border-primary/25 px-2 py-1 rounded">
                                        {action.type === 'END_SESSION' && (lang === 'es' ? '🛑 Terminar sesión' : '🛑 End session')}
                                        {action.type === 'SET_VAR' && (lang === 'es' ? '📝 Definir variable' : '📝 Set variable')}
                                        {action.type === 'INCREMENT' && (lang === 'es' ? '➕ Incrementar' : '➕ Increment')}
                                    </span>

                                    {(action.type === 'SET_VAR' || action.type === 'INCREMENT') && (
                                        <div className="grid grid-cols-12 gap-2 items-end">
                                            <div className="col-span-4">
                                                <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Variable' : 'Variable'}</Label>
                                                <Input
                                                    value={action.var || ''}
                                                    onChange={(e) => onUpdateAction(stepIndex, actionIndex, { var: e.target.value })}
                                                    className="h-8 text-xs"
                                                    placeholder={lang === 'es' ? 'ej: arquetipo' : 'e.g. archetype'}
                                                    list={`session-vars-${scope}-${stepIndex}`}
                                                />
                                                <datalist id={`session-vars-${scope}-${stepIndex}`}>
                                                    {sessionVarNames.map((name) => (
                                                        <option key={name} value={name} />
                                                    ))}
                                                </datalist>
                                            </div>

                                            {action.type === 'SET_VAR' && (
                                                <>
                                                    <div className="col-span-3">
                                                        <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Tipo' : 'Type'}</Label>
                                                        <select
                                                            value={inferActionValueType(action.value)}
                                                            onChange={(e) => {
                                                                const nextType = e.target.value as 'string' | 'number' | 'boolean' | 'null';
                                                                const currentRaw = action.value === null || action.value === undefined ? '' : String(action.value);
                                                                onUpdateAction(stepIndex, actionIndex, {
                                                                    value: coerceActionValue(nextType, currentRaw, action.value),
                                                                });
                                                            }}
                                                            className="w-full h-8 rounded border border-slate-200 text-xs px-2"
                                                        >
                                                            <option value="string">string</option>
                                                            <option value="number">number</option>
                                                            <option value="boolean">boolean</option>
                                                            <option value="null">null</option>
                                                        </select>
                                                    </div>
                                                    <div className="col-span-4">
                                                        <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Valor' : 'Value'}</Label>
                                                        {inferActionValueType(action.value) === 'boolean' ? (
                                                            <select
                                                                value={String(Boolean(action.value))}
                                                                onChange={(e) => onUpdateAction(stepIndex, actionIndex, { value: e.target.value === 'true' })}
                                                                className="w-full h-8 rounded border border-slate-200 text-xs px-2"
                                                            >
                                                                <option value="true">true</option>
                                                                <option value="false">false</option>
                                                            </select>
                                                        ) : inferActionValueType(action.value) === 'null' ? (
                                                            <Input value="null" readOnly className="h-8 text-xs text-slate-500" />
                                                        ) : (
                                                            <Input
                                                                value={action.value === null || action.value === undefined ? '' : String(action.value)}
                                                                onChange={(e) => {
                                                                    const currentType = inferActionValueType(action.value);
                                                                    onUpdateAction(stepIndex, actionIndex, {
                                                                        value: coerceActionValue(currentType, e.target.value, action.value),
                                                                    });
                                                                }}
                                                                className="h-8 text-xs"
                                                                placeholder={lang === 'es' ? 'valor' : 'value'}
                                                            />
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            {action.type === 'INCREMENT' && (
                                                <div className="col-span-7">
                                                    <Label className="text-[10px] text-slate-400 uppercase">{lang === 'es' ? 'Incremento' : 'Increment by'}</Label>
                                                    <Input
                                                        type="number"
                                                        value={(() => {
                                                            const candidate = typeof action.value === 'number' ? action.value : Number(action.value ?? 1);
                                                            return Number.isFinite(candidate) ? candidate : 1;
                                                        })()}
                                                        onChange={(e) => {
                                                            const parsed = Number(e.target.value || 0);
                                                            onUpdateAction(stepIndex, actionIndex, { value: Number.isFinite(parsed) ? parsed : 0 });
                                                        }}
                                                        className="h-8 text-xs"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex justify-end">
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => onDeleteAction(stepIndex, actionIndex)}>
                                            <Trash2 className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}

export function FlowEditor({ steps, sessionVars, globalTriggers = [], onChange, lang, hideFlowSteps }: Props) {
    const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
    const [expandedGlobalSteps, setExpandedGlobalSteps] = useState<Set<string>>(new Set());
    const [showVars, setShowVars] = useState(false);
    const [pendingScrollStepId, setPendingScrollStepId] = useState<string | null>(null);

    const toggleStep = (id: string) => {
        setExpandedSteps(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleGlobalStep = (id: string) => {
        setExpandedGlobalSteps(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const addStep = () => {
        const existingCount = steps.length;
        const newId = `${lang === 'es' ? 'paso' : 'step'}${existingCount + 1}`;
        const newStep: FlowStep = {
            id: newId,
            priority: 0,
            mode: 'SCRIPTED',
            message: '',
            triggers: [],
            next_step: '',
        };
        onChange([...steps, newStep], sessionVars, globalTriggers);
        setExpandedSteps(prev => new Set([...prev, newId]));
        setPendingScrollStepId(newId);
    };

    const addGlobalStep = () => {
        const existingCount = globalTriggers.length;
        const newId = `global_${lang === 'es' ? 'paso' : 'step'}_${existingCount + 1}`;
        const newStep: FlowStep = {
            id: newId,
            priority: 0,
            mode: 'SCRIPTED',
            message: '',
            triggers: [],
            next_step: '',
        };
        onChange(steps, sessionVars, [...globalTriggers, newStep]);
        setExpandedGlobalSteps(prev => new Set([...prev, newId]));
    };

    useEffect(() => {
        if (!pendingScrollStepId) return;
        const stepElement = document.querySelector(
            `[data-flow-step-id="${pendingScrollStepId}"]`
        ) as HTMLElement | null;
        if (!stepElement) return;

        stepElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingScrollStepId(null);
    }, [steps, pendingScrollStepId]);

    const updateStep = useCallback((index: number, updates: Partial<FlowStep>) => {
        const newSteps = [...steps];
        const previousId = newSteps[index]?.id;
        newSteps[index] = { ...newSteps[index], ...updates };
        if (updates.id && previousId && updates.id !== previousId) {
            setExpandedSteps((prev) => {
                if (!prev.has(previousId)) return prev;
                const next = new Set(prev);
                next.delete(previousId);
                next.add(updates.id as string);
                return next;
            });
        }
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const updateGlobalStep = useCallback((index: number, updates: Partial<FlowStep>) => {
        const newGlobal = [...globalTriggers];
        const previousId = newGlobal[index]?.id;
        newGlobal[index] = { ...newGlobal[index], ...updates };
        if (updates.id && previousId && updates.id !== previousId) {
            setExpandedGlobalSteps((prev) => {
                if (!prev.has(previousId)) return prev;
                const next = new Set(prev);
                next.delete(previousId);
                next.add(updates.id as string);
                return next;
            });
        }
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const deleteStep = useCallback((index: number) => {
        const newSteps = steps.filter((_, i) => i !== index);
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const deleteGlobalStep = useCallback((index: number) => {
        const newGlobal = globalTriggers.filter((_, i) => i !== index);
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const moveStep = useCallback((index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === steps.length - 1)) return;
        const newSteps = [...steps];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newSteps[index], newSteps[targetIndex]] = [newSteps[targetIndex], newSteps[index]];
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const moveGlobalStep = useCallback((index: number, direction: 'up' | 'down') => {
        if ((direction === 'up' && index === 0) || (direction === 'down' && index === globalTriggers.length - 1)) return;
        const newGlobal = [...globalTriggers];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newGlobal[index], newGlobal[targetIndex]] = [newGlobal[targetIndex], newGlobal[index]];
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const buildDefaultTrigger = useCallback((type: FlowTrigger['type']): FlowTrigger => {
        const trigger: FlowTrigger = { type, priority: 0 };
        if (type === 'REGEX') {
            trigger.pattern = '';
            trigger.flags = 'i';
        }
        if (type === 'AFTER_STEP') {
            trigger.step_id = '';
        }
        if (type === 'CONDITION') {
            trigger.condition = { var: 'user_message', op: 'contains', value: '' };
        }
        if (type === 'PHRASE_LIST') {
            trigger.phrase_list = {
                phrases: [],
                negative_phrases: [],
                scope: {
                    mode: 'full_message',
                    end_window_chars: 90,
                    end_window_tokens: 10,
                },
                exact_mode: 'token_boundary',
                fuzzy: {
                    enabled: true,
                    min_similarity: 0.84,
                    max_edits_short: 1,
                    max_edits_medium: 2,
                    max_edits_long: 3,
                    gray_zone_min_similarity: 0.7,
                },
                guardrails: {
                    block_on_question: false,
                    block_on_continuation_words: false,
                },
                model_fallback: {
                    mode: 'off',
                    min_confidence: 0.75,
                },
            };
        }
        return trigger;
    }, []);

    const addTrigger = useCallback((stepIndex: number, type: FlowTrigger['type']) => {
        const newSteps = [...steps];
        const trigger = buildDefaultTrigger(type);
        newSteps[stepIndex].triggers = [...(newSteps[stepIndex].triggers || []), trigger];
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange, buildDefaultTrigger]);

    const addGlobalTrigger = useCallback((stepIndex: number, type: FlowTrigger['type']) => {
        const newGlobal = [...globalTriggers];
        const trigger = buildDefaultTrigger(type);
        newGlobal[stepIndex].triggers = [...(newGlobal[stepIndex].triggers || []), trigger];
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange, buildDefaultTrigger]);

    const updateTrigger = useCallback((stepIndex: number, triggerIndex: number, updates: Partial<FlowTrigger>) => {
        const newSteps = [...steps];
        newSteps[stepIndex].triggers[triggerIndex] = { ...newSteps[stepIndex].triggers[triggerIndex], ...updates };
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const updateGlobalTrigger = useCallback((stepIndex: number, triggerIndex: number, updates: Partial<FlowTrigger>) => {
        const newGlobal = [...globalTriggers];
        newGlobal[stepIndex].triggers[triggerIndex] = { ...newGlobal[stepIndex].triggers[triggerIndex], ...updates };
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const deleteTrigger = useCallback((stepIndex: number, triggerIndex: number) => {
        const newSteps = [...steps];
        newSteps[stepIndex].triggers = newSteps[stepIndex].triggers.filter((_, i) => i !== triggerIndex);
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const deleteGlobalTrigger = useCallback((stepIndex: number, triggerIndex: number) => {
        const newGlobal = [...globalTriggers];
        newGlobal[stepIndex].triggers = newGlobal[stepIndex].triggers.filter((_, i) => i !== triggerIndex);
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const addAction = useCallback((stepIndex: number, type: FlowAction['type']) => {
        const newSteps = [...steps];
        const action: FlowAction = { type };
        if (type === 'SET_VAR' || type === 'INCREMENT') {
            action.var = '';
            action.value = type === 'INCREMENT' ? 1 : '';
        }
        newSteps[stepIndex].actions = [...(newSteps[stepIndex].actions || []), action];
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const addGlobalAction = useCallback((stepIndex: number, type: FlowAction['type']) => {
        const newGlobal = [...globalTriggers];
        const action: FlowAction = { type };
        if (type === 'SET_VAR' || type === 'INCREMENT') {
            action.var = '';
            action.value = type === 'INCREMENT' ? 1 : '';
        }
        newGlobal[stepIndex].actions = [...(newGlobal[stepIndex].actions || []), action];
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const deleteAction = useCallback((stepIndex: number, actionIndex: number) => {
        const newSteps = [...steps];
        newSteps[stepIndex].actions = newSteps[stepIndex].actions?.filter((_, i) => i !== actionIndex);
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const updateAction = useCallback((stepIndex: number, actionIndex: number, updates: Partial<FlowAction>) => {
        const newSteps = [...steps];
        const current = newSteps[stepIndex].actions?.[actionIndex];
        if (!current) return;
        newSteps[stepIndex].actions![actionIndex] = { ...current, ...updates };
        onChange(newSteps, sessionVars, globalTriggers);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const deleteGlobalAction = useCallback((stepIndex: number, actionIndex: number) => {
        const newGlobal = [...globalTriggers];
        newGlobal[stepIndex].actions = newGlobal[stepIndex].actions?.filter((_, i) => i !== actionIndex);
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const updateGlobalAction = useCallback((stepIndex: number, actionIndex: number, updates: Partial<FlowAction>) => {
        const newGlobal = [...globalTriggers];
        const current = newGlobal[stepIndex].actions?.[actionIndex];
        if (!current) return;
        newGlobal[stepIndex].actions![actionIndex] = { ...current, ...updates };
        onChange(steps, sessionVars, newGlobal);
    }, [steps, sessionVars, globalTriggers, onChange]);

    const addVar = () => {
        const existingCount = Object.keys(sessionVars).length;
        const varName = `var${existingCount + 1}`;
        onChange(steps, { ...sessionVars, [varName]: { type: 'random', options: [] } }, globalTriggers);
    };

    const updateVar = (oldName: string, newName: string, config: SessionVarConfig) => {
        const newVars = { ...sessionVars };
        if (oldName !== newName) {
            delete newVars[oldName];
        }
        newVars[newName] = config;
        onChange(steps, newVars, globalTriggers);
    };

    const deleteVar = (varName: string) => {
        const newVars = { ...sessionVars };
        delete newVars[varName];
        onChange(steps, newVars, globalTriggers);
    };

    const sessionVarNames = Object.keys(sessionVars);
    const allStepOptions = [...globalTriggers, ...steps];

    const lintReport = useMemo(() => {
        return lintFlowConfig({
            flow_steps: steps,
            global_triggers: globalTriggers,
            session_vars: sessionVars,
        } as unknown as BotConfig);
    }, [steps, globalTriggers, sessionVars]);

    const criticalIssues = useMemo(
        () => lintReport.issues.filter((issue) => issue.severity === 'critical'),
        [lintReport]
    );

    const warningIssues = useMemo(
        () => lintReport.issues.filter((issue) => issue.severity === 'warning'),
        [lintReport]
    );

    const issuesByScopeIndex = useMemo(() => {
        const mapIssuesByScope = (issues: FlowLintIssue[]) => {
            const flowMap = new Map<number, FlowLintIssue[]>();
            const globalMap = new Map<number, FlowLintIssue[]>();

            const pushIssue = (scope: 'flow_steps' | 'global_triggers', index: number, issue: FlowLintIssue) => {
                const target = scope === 'flow_steps' ? flowMap : globalMap;
                const existing = target.get(index) || [];
                existing.push(issue);
                target.set(index, existing);
            };

            issues.forEach((issue) => {
                const scopedMatch = issue.path?.match(/^(flow_steps|global_triggers)\.(\d+)(?:\.|$)/);
                if (scopedMatch) {
                    pushIssue(scopedMatch[1] as 'flow_steps' | 'global_triggers', Number(scopedMatch[2]), issue);
                    return;
                }

                const idMatch = issue.message.match(/"([^"]+)"/);
                const referencedId = idMatch?.[1];
                if (!referencedId) return;

                steps.forEach((step, index) => {
                    if (step.id === referencedId) pushIssue('flow_steps', index, issue);
                });
                globalTriggers.forEach((step, index) => {
                    if (step.id === referencedId) pushIssue('global_triggers', index, issue);
                });
            });

            return { flowMap, globalMap };
        };

        const critical = mapIssuesByScope(criticalIssues);
        const warning = mapIssuesByScope(warningIssues);

        return {
            flowCriticalMap: critical.flowMap,
            globalCriticalMap: critical.globalMap,
            flowWarningMap: warning.flowMap,
            globalWarningMap: warning.globalMap,
        };
    }, [criticalIssues, warningIssues, steps, globalTriggers]);

    const focusIssue = useCallback((issue: FlowLintIssue) => {
        const openByScopeAndIndex = (scope: 'flow_steps' | 'global_triggers', index: number) => {
            if (scope === 'flow_steps') {
                const step = steps[index];
                if (step) {
                    setExpandedSteps((prev) => {
                        const next = new Set(prev);
                        next.add(step.id);
                        return next;
                    });
                }
            } else {
                const step = globalTriggers[index];
                if (step) {
                    setExpandedGlobalSteps((prev) => {
                        const next = new Set(prev);
                        next.add(step.id);
                        return next;
                    });
                }
            }

            requestAnimationFrame(() => {
                const el = document.querySelector(
                    `[data-flow-step-scope="${scope}"][data-flow-step-index="${index}"]`
                ) as HTMLElement | null;
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        };

        const scopedMatch = issue.path?.match(/^(flow_steps|global_triggers)\.(\d+)(?:\.|$)/);
        if (scopedMatch) {
            openByScopeAndIndex(scopedMatch[1] as 'flow_steps' | 'global_triggers', Number(scopedMatch[2]));
            return;
        }

        const idMatch = issue.message.match(/"([^"]+)"/);
        const referencedId = idMatch?.[1];
        if (!referencedId) return;

        const flowIndex = steps.findIndex((step) => step.id === referencedId);
        if (flowIndex >= 0) {
            openByScopeAndIndex('flow_steps', flowIndex);
            return;
        }

        const globalIndex = globalTriggers.findIndex((step) => step.id === referencedId);
        if (globalIndex >= 0) {
            openByScopeAndIndex('global_triggers', globalIndex);
        }
    }, [steps, globalTriggers]);

    return (
        <div className={cn("space-y-6")}>
            {criticalIssues.length > 0 && (
                <Card className="rounded-2xl border-red-200 bg-red-50/80">
                    <CardHeader className="border-b border-red-200 px-6 py-4">
                        <CardTitle className="flex items-center gap-2 text-sm font-black text-red-700">
                            <Zap className="h-4 w-4" />
                            {lang === 'es'
                                ? `Errores críticos de flujo (${criticalIssues.length})`
                                : `Critical flow errors (${criticalIssues.length})`}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2">
                        {criticalIssues.slice(0, 8).map((issue, idx) => (
                            <button
                                key={`${issue.code}-${idx}`}
                                type="button"
                                onClick={() => focusIssue(issue)}
                                className="w-full rounded-lg border border-red-200 bg-white/80 px-3 py-2 text-left hover:bg-white"
                            >
                                <p className="text-xs font-semibold text-red-700">{issue.message}</p>
                                {issue.path && (
                                    <p className="mt-1 text-[10px] font-mono text-red-500">
                                        {issue.path}
                                    </p>
                                )}
                            </button>
                        ))}
                        {criticalIssues.length > 8 && (
                            <p className="text-[11px] text-red-600">
                                {lang === 'es'
                                    ? `... y ${criticalIssues.length - 8} error(es) más`
                                    : `... and ${criticalIssues.length - 8} more error(s)`}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
            {warningIssues.length > 0 && (
                <Card className="rounded-2xl border-amber-200 bg-amber-50/80">
                    <CardHeader className="border-b border-amber-200 px-6 py-4">
                        <CardTitle className="flex items-center gap-2 text-sm font-black text-amber-700">
                            <AlertTriangle className="h-4 w-4" />
                            {lang === 'es'
                                ? `Warnings de flujo (${warningIssues.length})`
                                : `Flow warnings (${warningIssues.length})`}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2">
                        {warningIssues.slice(0, 8).map((issue, idx) => (
                            <button
                                key={`${issue.code}-${idx}`}
                                type="button"
                                onClick={() => focusIssue(issue)}
                                className="w-full rounded-lg border border-amber-200 bg-white/80 px-3 py-2 text-left hover:bg-white"
                            >
                                <p className="text-xs font-semibold text-amber-800">{issue.message}</p>
                                {issue.path && (
                                    <p className="mt-1 text-[10px] font-mono text-amber-600">
                                        {issue.path}
                                    </p>
                                )}
                            </button>
                        ))}
                        {warningIssues.length > 8 && (
                            <p className="text-[11px] text-amber-700">
                                {lang === 'es'
                                    ? `... y ${warningIssues.length - 8} warning(s) más`
                                    : `... and ${warningIssues.length - 8} more warning(s)`}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}

            <Card className="bg-white border-slate-200 rounded-2xl overflow-hidden">
                <CardHeader
                    className="bg-slate-50 border-b border-slate-100 py-4 px-6 cursor-pointer flex flex-row items-center justify-between"
                    onClick={() => setShowVars(!showVars)}
                >
                    <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Settings2 className="h-4 w-4 text-primary" />
                        {lang === 'es' ? 'Variables de sesión' : 'Session variables'} ({Object.keys(sessionVars).length})
                        <HelpTooltip
                            title={lang === 'es' ? 'Variables' : 'Variables'}
                            content={lang === 'es'
                                ? 'Guardan datos durante la conversación. Si no se guarda una variable, ese dato se pierde al terminar la sesión.'
                                : 'They store data during conversation. If a variable is not saved, that data is lost when the session ends.'}
                        />
                    </CardTitle>
                    {showVars ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </CardHeader>
                {showVars && (
                    <CardContent className="p-4 space-y-3">
                        {Object.entries(sessionVars).map(([varName, config], index) => (
                            <FlowEditorSessionVarRow
                                key={`var_${index}`}
                                varName={varName}
                                config={config}
                                allVars={sessionVars}
                                onUpdate={(newName, newConfig) => updateVar(varName, newName, newConfig)}
                                onDelete={() => deleteVar(varName)}
                                lang={lang}
                            />
                        ))}
                        <Button variant="outline" size="sm" onClick={addVar} className="w-full mt-2">
                            <Plus className="h-4 w-4 mr-2" /> {lang === 'es' ? 'Agregar variable' : 'Add variable'}
                        </Button>
                    </CardContent>
                )}
            </Card>

            <div className="space-y-4">
                <div className="flex items-center">
                    <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                        <Zap className="h-4 w-4 text-primary" />
                        {lang === 'es' ? 'Interrupciones globales' : 'Global interrupts'} ({globalTriggers.length})
                        <HelpTooltip
                            title={lang === 'es' ? 'Interrupciones globales' : 'Global interrupts'}
                            content={lang === 'es'
                                ? 'Se evalúan antes del paso actual y sirven para reconducción/off-topic/abuso sin duplicar reglas en cada paso.'
                                : 'They are evaluated before the current step and are useful for reconduction/off-topic/abuse without duplicating rules in each step.'}
                        />
                    </h3>
                </div>

                {globalTriggers.map((step, stepIndex) => (
                    <FlowStepEditor
                        key={`global-${step.id}-${stepIndex}`}
                        scope="global_triggers"
                        step={step}
                        stepIndex={stepIndex}
                        allSteps={allStepOptions}
                        criticalIssues={issuesByScopeIndex.globalCriticalMap.get(stepIndex) || []}
                        warningIssues={issuesByScopeIndex.globalWarningMap.get(stepIndex) || []}
                        sessionVarNames={sessionVarNames}
                        onUpdateStep={updateGlobalStep}
                        onDeleteStep={deleteGlobalStep}
                        onMoveStep={moveGlobalStep}
                        onAddTrigger={addGlobalTrigger}
                        onUpdateTrigger={updateGlobalTrigger}
                        onDeleteTrigger={deleteGlobalTrigger}
                        onAddAction={addGlobalAction}
                        onUpdateAction={updateGlobalAction}
                        onDeleteAction={deleteGlobalAction}
                        isExpanded={expandedGlobalSteps.has(step.id)}
                        onToggle={() => toggleGlobalStep(step.id)}
                        lang={lang}
                    />
                ))}

                {globalTriggers.length > 0 && (
                    <Button onClick={addGlobalStep} variant="outline" size="sm" className="w-full">
                        <Plus className="h-4 w-4 mr-1" /> {lang === 'es' ? 'Agregar interrupción global' : 'Add global interrupt'}
                    </Button>
                )}

                {globalTriggers.length === 0 && (
                    <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                        <p className="text-slate-400 text-sm">
                            {lang === 'es'
                                ? 'Sin interrupciones globales. Opcional.'
                                : 'No global interrupts configured. Optional.'}
                        </p>
                        <Button onClick={addGlobalStep} variant="outline" size="sm" className="mt-3">
                            <Plus className="h-4 w-4 mr-1" /> {lang === 'es' ? 'Agregar primera interrupción' : 'Add first interrupt'}
                        </Button>
                    </div>
                )}
            </div>

            {!hideFlowSteps && (
                <div className="space-y-4">
                    <div className="flex items-center">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                            <Zap className="h-4 w-4 text-primary" />
                            {lang === 'es' ? 'Pasos del flujo' : 'Flow steps'} ({steps.length})
                            <HelpTooltip
                                title={lang === 'es' ? 'Pasos' : 'Steps'}
                                content={lang === 'es'
                                    ? 'Cada paso define cuándo se activa (disparadores), qué responde y qué acción ejecuta luego.'
                                    : 'Each step defines when it activates (triggers), what it replies, and what action runs next.'}
                            />
                        </h3>
                    </div>

                    {steps.map((step, stepIndex) => (
                        <FlowStepEditor
                            key={step.id}
                            scope="flow_steps"
                            step={step}
                            stepIndex={stepIndex}
                            allSteps={allStepOptions}
                            criticalIssues={issuesByScopeIndex.flowCriticalMap.get(stepIndex) || []}
                            warningIssues={issuesByScopeIndex.flowWarningMap.get(stepIndex) || []}
                            sessionVarNames={sessionVarNames}
                            onUpdateStep={updateStep}
                            onDeleteStep={deleteStep}
                            onMoveStep={moveStep}
                            onAddTrigger={addTrigger}
                            onUpdateTrigger={updateTrigger}
                            onDeleteTrigger={deleteTrigger}
                            onAddAction={addAction}
                            onUpdateAction={updateAction}
                            onDeleteAction={deleteAction}
                            isExpanded={expandedSteps.has(step.id)}
                            onToggle={() => toggleStep(step.id)}
                            lang={lang}
                        />
                    ))}

                    {steps.length > 0 && (
                        <Button onClick={addStep} variant="outline" size="sm" className="w-full">
                            <Plus className="h-4 w-4 mr-1" /> {lang === 'es' ? 'Agregar paso' : 'Add step'}
                        </Button>
                    )}

                    {steps.length === 0 && (
                        <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                            <Zap className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-slate-400 text-sm">{lang === 'es' ? 'No hay pasos configurados' : 'No steps configured yet'}</p>
                            <Button onClick={addStep} variant="outline" size="sm" className="mt-3">
                                <Plus className="h-4 w-4 mr-1" /> {lang === 'es' ? 'Agregar primer paso' : 'Add first step'}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
