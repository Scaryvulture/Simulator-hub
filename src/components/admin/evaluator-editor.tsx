'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { updateBot } from '@/app/actions/bots';
import { toast } from 'sonner';
import { ArrowLeft, Save, Plus, Trash, CheckCircle2, MessageSquareText, ShieldCheck, Database, Key, Eye, EyeOff, Copy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/providers/i18n-context';
import { v4 as uuidv4 } from 'uuid';
import { VersionManager } from './version-manager';
import { normalizeRagConfig } from '@/lib/rag-config';
import { HelpTooltip } from '@/components/admin/help-tooltip';
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes-warning';
import { buildFlowWarningDescription } from '@/lib/flow-lint-feedback';

interface Criterion {
    id: string;
    title: string;
    instruction: string;
}

type EditorBot = NonNullable<Awaited<ReturnType<typeof import('@/app/actions/bots').getBot>>>;

interface Props {
    bot: EditorBot;
}

const defaultRagConfig = {
    enabled: false,
    mode: 'evaluation_only',
    owner: 'wrapper',
    rag_owner: 'wrapper',
    vector_store_ids: [] as string[],
    strict_mode: true,
    history_limit: 10,
    wrapper: {
        strategy: 'hybrid',
        fallback: 'none',
        score_threshold: undefined as number | undefined,
        cache_ttl: 120,
        metadata_filters: {} as Record<string, string | number | boolean>,
        top_k: 8,
        max_evidence_tokens: 1400,
    },
    platform: {
        max_num_results: 8,
        filters: {} as Record<string, string | number | boolean>,
        ranking_options: {} as { score_threshold?: number },
        force_tool: true,
    },
    audit: {
        store_results: true,
        store_queries: true,
        store_scores: true,
    },
    // Legacy mirror fields
    top_k: 8,
    fallback_strategy: 'none',
    metadata_filters: {} as Record<string, string | number | boolean>,
    cache_ttl_seconds: 120,
    max_evidence_tokens: 1400,
};

type EvaluatorRagConfig = typeof defaultRagConfig;
type EvaluatorConfigState = Record<string, unknown> & {
    criteria: {
        boolean: Criterion[];
        qualitative: Criterion[];
    };
    evaluation_instruction: string;
    rag_config: EvaluatorRagConfig;
};

function parseRecordConfig(config: unknown): Record<string, unknown> {
    if (typeof config === 'string') {
        try {
            const parsed = JSON.parse(config) as unknown;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
            return {};
        } catch {
            return {};
        }
    }
    if (config && typeof config === 'object' && !Array.isArray(config)) {
        return config as Record<string, unknown>;
    }
    return {};
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function maskApiKeyForUi(value: string): string {
    if (!value) return '';
    if (value.length <= 8) return '********';
    return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

function normalizeEvaluatorRagMode(mode: string): 'never' | 'always' | 'evaluation_only' {
    if (mode === 'never' || mode === 'always' || mode === 'evaluation_only') return mode;
    return 'evaluation_only';
}

export function EvaluatorEditor({ bot }: Props) {
    const { lang } = useLanguage();
    const router = useRouter();
    const parsedConfig = parseRecordConfig(bot.config);
    const legacyPromptValue = bot.openai_prompt_id || '';
    const initialPromptId = legacyPromptValue.startsWith('pmpt_') ? legacyPromptValue : '';
    const initialModel = typeof parsedConfig.llm_model === 'string'
        ? parsedConfig.llm_model
        : (legacyPromptValue && !legacyPromptValue.startsWith('pmpt_') ? legacyPromptValue : 'gpt-4o');

    const [name, setName] = useState(bot.name);
    const [apiKey, setApiKey] = useState('');
    const [hasStoredApiKey, setHasStoredApiKey] = useState(Boolean(bot.has_api_key));
    const [apiKeyDisplay, setApiKeyDisplay] = useState(bot.api_key_display || '');
    const [apiKeyChanged, setApiKeyChanged] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [isRevealingApiKey, setIsRevealingApiKey] = useState(false);
    const [promptId, setPromptId] = useState(initialPromptId);
    const [modelName, setModelName] = useState(initialModel);
    const [promptVersion, setPromptVersion] = useState(bot.prompt_version || '1');
    const [isSaving, setIsSaving] = useState(false);
    const [ragAdvancedOpen, setRagAdvancedOpen] = useState(false);
    const [pendingCriterionScroll, setPendingCriterionScroll] = useState<{
        type: 'boolean' | 'qualitative';
        id: string;
    } | null>(null);

    const [config, setConfig] = useState<EvaluatorConfigState>(() => {
        const parsedConfig = parseRecordConfig(bot.config);
        const parsedCriteria = (parsedConfig.criteria && typeof parsedConfig.criteria === 'object')
            ? parsedConfig.criteria as { boolean?: unknown; qualitative?: unknown }
            : {};
        const parsedRagConfig = (parsedConfig.rag_config && typeof parsedConfig.rag_config === 'object')
            ? parsedConfig.rag_config as {
                wrapper?: Record<string, unknown>;
                platform?: Record<string, unknown>;
                audit?: Record<string, unknown>;
            } & Record<string, unknown>
            : {};

        const normalizedRag = normalizeRagConfig(parsedRagConfig, bot.openai_vector_store_id);

        return {
            ...parsedConfig,
            criteria: {
                boolean: Array.isArray(parsedCriteria.boolean) ? parsedCriteria.boolean as Criterion[] : [],
                qualitative: Array.isArray(parsedCriteria.qualitative) ? parsedCriteria.qualitative as Criterion[] : [],
            },
            evaluation_instruction: typeof parsedConfig.evaluation_instruction === 'string' ? parsedConfig.evaluation_instruction : '',
            rag_config: {
                ...defaultRagConfig,
                ...parsedRagConfig,
                enabled: normalizedRag.enabled,
                mode: normalizeEvaluatorRagMode(normalizedRag.mode),
                owner: normalizedRag.owner,
                rag_owner: normalizedRag.owner,
                vector_store_ids: normalizedRag.vector_store_ids,
                strict_mode: normalizedRag.strict_mode,
                history_limit: normalizedRag.history_limit,
                wrapper: {
                    ...defaultRagConfig.wrapper,
                    ...(parsedRagConfig.wrapper || {}),
                    ...normalizedRag.wrapper,
                    cache_ttl: normalizedRag.wrapper.cache_ttl_seconds,
                },
                platform: {
                    ...defaultRagConfig.platform,
                    ...(parsedRagConfig.platform || {}),
                    ...normalizedRag.platform,
                },
                audit: {
                    ...defaultRagConfig.audit,
                    ...(parsedRagConfig.audit || {}),
                    ...normalizedRag.audit,
                },
            },
        };
    });
    const initialSnapshotRef = useRef<string>(JSON.stringify({
        name: bot.name,
        hasStoredApiKey: Boolean(bot.has_api_key),
        apiKeyDraft: '',
        promptId: initialPromptId,
        modelName: initialModel,
        promptVersion: bot.prompt_version || '1',
        config,
    }));

    const ragConfig = config.rag_config;
    const isPromptIdValid = !promptId || promptId.startsWith('pmpt_');
    const isModelValid = !modelName || modelName.startsWith('gpt-') || modelName.startsWith('o') || modelName.startsWith('chatgpt-') || modelName.startsWith('codex-');
    const isApiKeyValid = !apiKey || apiKey.startsWith('sk-');

    const fetchRevealedApiKey = async (): Promise<string> => {
        const response = await fetch(`/api/admin/bots/${bot.id}/api-key`, {
            method: 'GET',
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-store' },
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(typeof payload?.error === 'string'
                ? payload.error
                : (lang === 'es' ? 'No se pudo revelar la API key.' : 'Failed to reveal API key.'));
        }
        const key = typeof payload?.api_key === 'string' ? payload.api_key : '';
        if (!key) {
            throw new Error(lang === 'es' ? 'No hay API key configurada.' : 'API key is not configured.');
        }
        return key;
    };

    const handleRevealApiKey = async () => {
        try {
            setIsRevealingApiKey(true);
            const key = await fetchRevealedApiKey();
            setApiKey(key);
            setApiKeyChanged(false);
            setShowApiKey(true);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setIsRevealingApiKey(false);
        }
    };

    const handleCopyApiKey = async () => {
        try {
            setIsRevealingApiKey(true);
            const key = apiKey || await fetchRevealedApiKey();
            await navigator.clipboard.writeText(key);
            toast.success(lang === 'es' ? 'API key copiada' : 'API key copied');
            if (!apiKey) {
                setApiKey(key);
                setApiKeyChanged(false);
                setShowApiKey(true);
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setIsRevealingApiKey(false);
        }
    };

    const handleSave = async () => {
        if (typeof document !== 'undefined') {
            const activeElement = document.activeElement;
            if (activeElement instanceof HTMLElement && typeof activeElement.blur === 'function') {
                activeElement.blur();
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }

        if (!name) {
            toast.error(lang === 'es' ? 'El nombre es obligatorio' : 'Name is required');
            return;
        }
        if (!isPromptIdValid) {
            toast.error(lang === 'es' ? 'Prompt ID inválido: usa pmpt_* o déjalo vacío.' : 'Invalid Prompt ID: use pmpt_* or leave it empty.');
            return;
        }
        if (!isModelValid) {
            toast.error(lang === 'es' ? 'Modelo inválido: usa un modelo compatible (ej: gpt-4o-mini).' : 'Invalid model: use a compatible model (e.g., gpt-4o-mini).');
            return;
        }
        const normalizedApiKey = apiKey.trim();
        const shouldPersistApiKey = !hasStoredApiKey || apiKeyChanged;
        if (shouldPersistApiKey && !normalizedApiKey) {
            toast.error(lang === 'es' ? 'La API Key es obligatoria' : 'API Key is mandatory');
            return;
        }
        if (shouldPersistApiKey && !isApiKeyValid) {
            toast.error(lang === 'es' ? 'La API key debe comenzar con "sk-".' : 'API key must start with "sk-".');
            return;
        }

        const normalized = normalizeRagConfig(config.rag_config || {}, bot.openai_vector_store_id);
        const evaluatorMode = normalizeEvaluatorRagMode(normalized.mode);

        if (evaluatorMode !== 'never' && normalized.vector_store_ids.length === 0) {
            toast.error(lang === 'es' ? 'RAG activo requiere al menos un Vector Store ID' : 'RAG enabled requires at least one Vector Store ID');
            return;
        }

        try {
            setIsSaving(true);
            const configToSave = {
                ...config,
                llm_model: modelName.trim(),
                rag_config: {
                    ...config.rag_config,
                    enabled: evaluatorMode !== 'never',
                    mode: evaluatorMode,
                    owner: normalized.owner,
                    rag_owner: normalized.owner,
                    vector_store_ids: normalized.vector_store_ids,
                    strict_mode: normalized.strict_mode,
                    history_limit: normalized.history_limit,
                    wrapper: {
                        ...normalized.wrapper,
                        cache_ttl: normalized.wrapper.cache_ttl_seconds,
                    },
                    platform: {
                        ...normalized.platform,
                    },
                    audit: {
                        ...normalized.audit,
                    },
                    // Legacy mirror fields
                    top_k: normalized.wrapper.top_k,
                    fallback_strategy: normalized.wrapper.fallback,
                    metadata_filters: normalized.wrapper.metadata_filters,
                    search_threshold: normalized.wrapper.score_threshold,
                    cache_ttl_seconds: normalized.wrapper.cache_ttl_seconds,
                    max_evidence_tokens: normalized.wrapper.max_evidence_tokens,
                },
            };
            const payload: Parameters<typeof updateBot>[1] = {
                name,
                bot_type: 'EVALUATOR',
                openai_prompt_id: promptId.trim(),
                openai_vector_store_id: normalized.vector_store_ids[0] || '',
                prompt_version: promptVersion,
                config: configToSave,
                published: true,
            };
            if (shouldPersistApiKey) {
                payload.api_key = normalizedApiKey;
            }
            const saveResult = await updateBot(bot.id, payload);
            if (!saveResult.success) {
                toast.error(saveResult.error);
                return;
            }
            const lint = saveResult.data.flow_lint;
            if (lint) {
                if (lint.critical_count > 0) {
                    toast.warning(
                        lang === 'es'
                            ? `Guardado con ${lint.critical_count} error(es) crítico(s) de flujo. Revisá antes de publicar.`
                            : `Saved with ${lint.critical_count} critical flow issue(s). Review before publishing.`
                    );
                } else if (lint.warning_count > 0) {
                    const warningTitle = lang === 'es'
                        ? `Guardado con ${lint.warning_count} warning(s) de flujo.`
                        : `Saved with ${lint.warning_count} flow warning(s).`;
                    const warningDescription = buildFlowWarningDescription({
                        report: lint,
                        config: configToSave as unknown as { flow_steps?: Array<{ id?: string }>; global_triggers?: Array<{ id?: string }> },
                        lang,
                    });
                    if (warningDescription) {
                        toast.warning(warningTitle, { description: warningDescription });
                    } else {
                        toast.warning(warningTitle);
                    }
                }
            }
            toast.success(lang === 'es' ? 'Evaluador guardado' : 'Evaluator saved');
            if (shouldPersistApiKey) {
                setHasStoredApiKey(Boolean(normalizedApiKey));
                setApiKeyDisplay(maskApiKeyForUi(normalizedApiKey));
                setApiKey('');
                setApiKeyChanged(false);
                setShowApiKey(false);
            }
            initialSnapshotRef.current = JSON.stringify({
                name,
                hasStoredApiKey: shouldPersistApiKey ? Boolean(normalizedApiKey) : hasStoredApiKey,
                apiKeyDraft: '',
                promptId,
                modelName,
                promptVersion,
                config: configToSave,
            });
            router.push('/admin/evaluators');
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setIsSaving(false);
        }
    };

    const addCriterion = (type: 'boolean' | 'qualitative') => {
        const newCriterion: Criterion = {
            id: uuidv4(),
            title: '',
            instruction: '',
        };
        setConfig((prev) => ({
            ...prev,
            criteria: {
                ...prev.criteria,
                [type]: [...prev.criteria[type], newCriterion],
            },
        }));
        setPendingCriterionScroll({ type, id: newCriterion.id });
    };

    useEffect(() => {
        if (!pendingCriterionScroll) return;
        const selector = `[data-evaluator-criterion-type="${pendingCriterionScroll.type}"][data-evaluator-criterion-id="${pendingCriterionScroll.id}"]`;
        const criterionElement = document.querySelector(selector) as HTMLElement | null;
        if (!criterionElement) return;

        criterionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setPendingCriterionScroll(null);
    }, [config.criteria.boolean, config.criteria.qualitative, pendingCriterionScroll]);

    const removeCriterion = (type: 'boolean' | 'qualitative', id: string) => {
        setConfig((prev) => ({
            ...prev,
            criteria: {
                ...prev.criteria,
                [type]: prev.criteria[type].filter((c: Criterion) => c.id !== id),
            },
        }));
    };

    const updateCriterion = (type: 'boolean' | 'qualitative', id: string, field: 'title' | 'instruction', value: string) => {
        setConfig((prev) => ({
            ...prev,
            criteria: {
                ...prev.criteria,
                [type]: prev.criteria[type].map((c: Criterion) =>
                    c.id === id ? { ...c, [field]: value } : c
                ),
            },
        }));
    };

    const updateRagConfig = (patch: Partial<EvaluatorRagConfig>) => {
        setConfig((prev) => ({
            ...prev,
            rag_config: {
                ...prev.rag_config,
                ...patch,
            },
        }));
    };

    const currentSnapshot = useMemo(() => JSON.stringify({
        name,
        hasStoredApiKey,
        apiKeyDraft: apiKeyChanged ? apiKey : '',
        promptId,
        modelName,
        promptVersion,
        config,
    }), [name, hasStoredApiKey, apiKeyChanged, apiKey, promptId, modelName, promptVersion, config]);
    const hasUnsavedChanges = !isSaving && currentSnapshot !== initialSnapshotRef.current;
    useUnsavedChangesWarning(
        hasUnsavedChanges,
        lang === 'es'
            ? 'Tienes cambios sin guardar en este evaluador. Si sales ahora, los perderás. ¿Deseas continuar?'
            : 'You have unsaved changes in this evaluator. If you leave now, they will be lost. Continue?'
    );

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/evaluators">
                        <Button variant="ghost" size="icon" className="group rounded-full bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200">
                            <ArrowLeft className="h-5 w-5 group-hover:-translate-x-0.5 transition-transform text-slate-600" />
                        </Button>
                    </Link>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[9px] font-black text-slate-500 uppercase tracking-widest border border-slate-200">
                                EVALUATOR
                            </span>
                        </div>
                        <h1 className="text-3xl font-black tracking-tighter text-slate-900">
                            {name || (lang === 'es' ? 'Evaluador #1' : 'Evaluator #1')}
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {hasUnsavedChanges && (
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            {lang === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'}
                        </span>
                    )}
                    <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 group h-12 px-10 rounded-xl transition-all font-black text-xs">
                        {isSaving ? (lang === 'es' ? 'Guardando...' : 'Saving...') : <><Save className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" /> {lang === 'es' ? 'Guardar Evaluador' : 'Save Evaluator'}</>}
                    </Button>
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-1">
                    <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl group transition-all">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 py-5">
                            <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                                <Key className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Identidad & API' : 'Identity & API'}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-5 pt-7">
                            <div className="space-y-2">
                                <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                    {lang === 'es' ? 'NOMBRE' : 'NAME'}
                                </Label>
                                <Input
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="bg-slate-50 border-slate-200 h-12 rounded-xl text-slate-900 font-bold"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                    OPENAI API KEY
                                </Label>
                                <div className="relative">
                                    <Input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKey}
                                        onChange={e => {
                                            setApiKey(e.target.value);
                                            setApiKeyChanged(true);
                                        }}
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                        spellCheck={false}
                                        placeholder={hasStoredApiKey
                                            ? (apiKeyDisplay || (lang === 'es' ? 'Guardada (oculta)' : 'Saved (hidden)'))
                                            : 'sk-...'}
                                        className="bg-slate-50 border-slate-200 h-12 rounded-xl font-mono text-slate-900 pr-20"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(prev => !prev)}
                                        className="absolute right-10 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                                        aria-label={showApiKey
                                            ? (lang === 'es' ? 'Ocultar API key' : 'Hide API key')
                                            : (lang === 'es' ? 'Mostrar API key' : 'Show API key')}
                                    >
                                        {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                    <ShieldCheck className="absolute right-3 top-3.5 h-5 w-5 text-slate-300" />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px]"
                                        disabled={!hasStoredApiKey || isRevealingApiKey}
                                        onClick={handleRevealApiKey}
                                    >
                                        <Eye className="h-3.5 w-3.5 mr-1" />
                                        {lang === 'es' ? 'Revelar' : 'Reveal'}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-[10px]"
                                        disabled={isRevealingApiKey || (!hasStoredApiKey && !apiKey)}
                                        onClick={handleCopyApiKey}
                                    >
                                        <Copy className="h-3.5 w-3.5 mr-1" />
                                        Copy
                                    </Button>
                                </div>
                                {!isApiKeyValid && (
                                    <p className="text-[10px] text-red-500">
                                        {lang === 'es' ? 'La API key debe comenzar con "sk-".' : 'API key must start with "sk-".'}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                    {lang === 'es' ? 'PROMPT ID' : 'PROMPT ID'}
                                </Label>
                                <Input
                                    value={promptId}
                                    onChange={e => setPromptId(e.target.value)}
                                    placeholder="pmpt_xxxxx"
                                    className="bg-slate-50 border-slate-200 h-11 rounded-xl font-mono text-xs text-slate-600"
                                />
                                {!isPromptIdValid && (
                                    <p className="text-[10px] text-red-500">
                                        {lang === 'es' ? 'Debe iniciar con pmpt_ o quedar vacío.' : 'Must start with pmpt_ or be empty.'}
                                    </p>
                                )}
                                <p className="text-[10px] text-slate-400">
                                    {lang === 'es'
                                        ? 'Si usas pmpt_* se ejecuta Responses API con prompt gestionado.'
                                        : 'Using pmpt_* triggers Responses API with managed prompt.'}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                    {lang === 'es' ? 'MODELO' : 'MODEL'}
                                </Label>
                                <Input
                                    value={modelName}
                                    onChange={e => setModelName(e.target.value)}
                                    placeholder="gpt-4o"
                                    className="bg-slate-50 border-slate-200 h-11 rounded-xl font-mono text-xs text-slate-600"
                                />
                                {!isModelValid && (
                                    <p className="text-[10px] text-red-500">
                                        {lang === 'es' ? 'Modelo inválido. Ejemplo válido: gpt-4o-mini.' : 'Invalid model. Valid example: gpt-4o-mini.'}
                                    </p>
                                )}
                                <p className="text-[10px] text-slate-400">
                                    {lang === 'es'
                                        ? 'Modelo usado en Chat Completions y como fallback de Responses. Si queda vacío, usa gpt-4o.'
                                        : 'Model used by Chat Completions and as Responses fallback. If empty, defaults to gpt-4o.'}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                    {lang === 'es' ? 'VERSIÓN PROMPT' : 'PROMPT VERSION'}
                                </Label>
                                <Input
                                    value={promptVersion}
                                    onChange={e => setPromptVersion(e.target.value)}
                                    placeholder="1"
                                    className="bg-slate-50 border-slate-200 h-11 rounded-xl font-mono text-xs text-slate-600"
                                />
                                <p className="text-[10px] text-slate-400">
                                    {lang === 'es'
                                        ? 'Aplica cuando el Prompt ID tiene formato pmpt_*.'
                                        : 'Applies when Prompt ID uses pmpt_* format.'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 py-5">
                            <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                                <Database className="h-5 w-5 text-primary" />
                                {lang === 'es' ? 'Control de RAG' : 'RAG control'}
                                <HelpTooltip
                                    title="RAG"
                                    content={lang === 'es'
                                        ? 'Definí cuándo el evaluador consulta evidencia documental y qué tan estricto debe ser con esa evidencia.'
                                        : 'Define when the evaluator should query documentary evidence and how strict it should be with that evidence.'}
                                />
                            </CardTitle>
                            <CardDescription className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                {lang === 'es' ? 'Simple + avanzado para evaluación' : 'Simple + advanced for evaluation'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6">
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                        {lang === 'es' ? 'Modo' : 'Mode'}
                                        <HelpTooltip
                                            title={lang === 'es' ? 'Modo RAG' : 'RAG mode'}
                                            content={lang === 'es'
                                                ? 'Nunca: no busca evidencia. Siempre: consulta evidencia en cada evaluación. Solo evaluación: prioriza uso en evaluación.'
                                                : 'Never: no retrieval. Always: retrieve evidence every evaluation. Evaluation only: prioritizes evaluation usage.'}
                                        />
                                    </Label>
                                    <select
                                        value={ragConfig.mode}
                                        onChange={(e) => updateRagConfig({ mode: e.target.value, enabled: e.target.value !== 'never' })}
                                        className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700"
                                    >
                                        <option value="never">{lang === 'es' ? 'Nunca' : 'Never'}</option>
                                        <option value="always">{lang === 'es' ? 'Siempre' : 'Always'}</option>
                                        <option value="evaluation_only">{lang === 'es' ? 'Solo evaluación' : 'Evaluation only'}</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                        {lang === 'es' ? 'Motor' : 'Engine'}
                                        <HelpTooltip
                                            title={lang === 'es' ? 'Motor RAG' : 'RAG engine'}
                                            content={lang === 'es'
                                                ? 'Wrapper ofrece más control técnico. Platform usa búsqueda nativa de OpenAI con menos configuración.'
                                                : 'Wrapper provides more technical control. Platform uses native OpenAI retrieval with fewer settings.'}
                                        />
                                    </Label>
                                    <select
                                        value={ragConfig.owner}
                                        onChange={(e) => updateRagConfig({ owner: e.target.value, rag_owner: e.target.value })}
                                        className="w-full h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700"
                                    >
                                        <option value="wrapper">Wrapper</option>
                                        <option value="platform">Platform</option>
                                    </select>
                                    <p className="text-[10px] text-slate-400">
                                        {ragConfig.owner === 'wrapper'
                                            ? (lang === 'es' ? 'Recomendado si necesitas tuning fino y fallback configurable.' : 'Recommended if you need fine tuning and configurable fallback.')
                                            : (lang === 'es' ? 'Recomendado si buscas una configuración más simple.' : 'Recommended if you want simpler setup.')}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                        {lang === 'es' ? 'IDs de Vector Store' : 'Vector Store IDs'}
                                    </Label>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => updateRagConfig({ vector_store_ids: [...(ragConfig.vector_store_ids || []), ''] })}
                                    >
                                        {lang === 'es' ? '+ Agregar ID' : '+ Add ID'}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-slate-400">
                                    {lang === 'es'
                                        ? 'Este botón agrega una fila para pegar un ID (vs_...).'
                                        : 'This button adds a row to paste a Vector Store ID (vs_...).'}
                                </p>
                                {(ragConfig.vector_store_ids || []).length === 0 && (
                                    <p className="text-[10px] text-slate-400 italic">
                                        {lang === 'es' ? 'No hay stores cargados.' : 'No stores configured.'}
                                    </p>
                                )}
                                <div className="space-y-2">
                                    {(ragConfig.vector_store_ids || []).map((id: string, index: number) => (
                                        <div key={`${index}-${id || 'empty'}`} className="flex items-center gap-2">
                                            <Input
                                                value={id}
                                                onChange={(e) => {
                                                    const next = [...(ragConfig.vector_store_ids || [])];
                                                    next[index] = e.target.value;
                                                    updateRagConfig({ vector_store_ids: next });
                                                }}
                                                placeholder="vs_abc123"
                                                className="h-9 bg-slate-50 border-slate-200 rounded-lg font-mono text-xs text-slate-700"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-400"
                                                onClick={() => {
                                                    const next = [...(ragConfig.vector_store_ids || [])];
                                                    next.splice(index, 1);
                                                    updateRagConfig({ vector_store_ids: next });
                                                }}
                                            >
                                                ×
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        {lang === 'es' ? 'Evidencia requerida' : 'Evidence required'}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        {lang === 'es' ? 'Si falta evidencia, evaluación segura.' : 'If evidence is missing, safe evaluation fallback.'}
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={ragConfig.strict_mode}
                                    onChange={(e) => updateRagConfig({ strict_mode: e.target.checked })}
                                />
                            </div>

                            <Button
                                type="button"
                                variant="ghost"
                                className="w-full h-8 text-xs text-slate-600"
                                onClick={() => setRagAdvancedOpen((v) => !v)}
                            >
                                {ragAdvancedOpen
                                    ? (lang === 'es' ? 'Ocultar avanzado' : 'Hide advanced')
                                    : (lang === 'es' ? 'Mostrar avanzado' : 'Show advanced')}
                            </Button>

                            {ragAdvancedOpen && (
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    {ragConfig.owner === 'wrapper' ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-500 font-bold">{lang === 'es' ? 'Estrategia' : 'Strategy'}</Label>
                                                    <select
                                                        value={ragConfig.wrapper.strategy}
                                                        onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, strategy: e.target.value } })}
                                                        className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-xs"
                                                    >
                                                        <option value="metadata_first">{lang === 'es' ? 'Priorizar metadatos' : 'Metadata first'}</option>
                                                        <option value="similarity">{lang === 'es' ? 'Priorizar similitud' : 'Similarity first'}</option>
                                                        <option value="hybrid">{lang === 'es' ? 'Híbrida (balanceada)' : 'Hybrid (balanced)'}</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-500 font-bold">Fallback</Label>
                                                    <select
                                                        value={ragConfig.wrapper.fallback}
                                                        onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, fallback: e.target.value } })}
                                                        className="w-full h-9 rounded border border-slate-200 bg-white px-2 text-xs"
                                                    >
                                                        <option value="rewrite_retry">{lang === 'es' ? 'Reescribir y reintentar' : 'Rewrite and retry'}</option>
                                                        <option value="secondary_store">{lang === 'es' ? 'Buscar en store secundario' : 'Search secondary store'}</option>
                                                        <option value="safe_reply">{lang === 'es' ? 'Respuesta segura (sin inventar)' : 'Safe reply (no hallucination)'}</option>
                                                        <option value="none">{lang === 'es' ? 'Sin fallback' : 'No fallback'}</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-4 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-500 font-bold">Top-K</Label>
                                                    <Input
                                                        type="number"
                                                        value={ragConfig.wrapper.top_k}
                                                        onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, top_k: Number(e.target.value || 8) } })}
                                                        className="h-9 bg-white border-slate-200 text-xs"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-500 font-bold">{lang === 'es' ? 'Umbral de puntaje' : 'Score Threshold'}</Label>
                                                    <Input
                                                        type="number"
                                                        step="0.01"
                                                        value={ragConfig.wrapper.score_threshold ?? ''}
                                                        onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, score_threshold: e.target.value ? Number(e.target.value) : undefined } })}
                                                        className="h-9 bg-white border-slate-200 text-xs"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-500 font-bold">{lang === 'es' ? 'TTL de caché' : 'Cache TTL'}</Label>
                                                    <Input
                                                        type="number"
                                                        value={ragConfig.wrapper.cache_ttl}
                                                        onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, cache_ttl: Number(e.target.value || 120) } })}
                                                        className="h-9 bg-white border-slate-200 text-xs"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-500 font-bold">{lang === 'es' ? 'Máx. tokens evidencia' : 'Max evidence tokens'}</Label>
                                                    <Input
                                                        type="number"
                                                        value={ragConfig.wrapper.max_evidence_tokens}
                                                        onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, max_evidence_tokens: Number(e.target.value || 1400) } })}
                                                        className="h-9 bg-white border-slate-200 text-xs"
                                                    />
                                                </div>
                                            </div>
                                            <p className="text-[10px] text-slate-400">
                                                {lang === 'es'
                                                    ? 'Top-K alto mejora cobertura pero puede meter ruido. Sube umbral para priorizar evidencia más confiable. Bajar máx. tokens evidencia reduce costo por evaluación.'
                                                    : 'Higher Top-K improves coverage but may add noise. Raise threshold to prioritize stronger evidence. Lower max evidence tokens reduces evaluation cost.'}
                                            </p>
                                        </>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 font-bold">max_num_results</Label>
                                                <Input
                                                    type="number"
                                                    value={ragConfig.platform.max_num_results}
                                                    onChange={(e) => updateRagConfig({ platform: { ...ragConfig.platform, max_num_results: Number(e.target.value || 8) } })}
                                                    className="h-9 bg-white border-slate-200 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-500 font-bold">force_tool</Label>
                                                <div className="h-9 rounded border border-slate-200 bg-white px-3 flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(ragConfig.platform.force_tool)}
                                                        onChange={(e) => updateRagConfig({ platform: { ...ragConfig.platform, force_tool: e.target.checked } })}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 py-5">
                            <CardTitle className="text-base font-black text-slate-900">
                                <span className="flex items-center gap-1">
                                    {lang === 'es' ? 'Instrucción de Evaluación' : 'Evaluation Instruction'}
                                    <HelpTooltip
                                        title={lang === 'es' ? 'Instrucción' : 'Instruction'}
                                        content={lang === 'es'
                                            ? 'Es la regla madre del evaluador. Definí criterios, formato de salida y cómo justificar cada puntaje.'
                                            : 'This is the evaluator’s master rule. Define criteria, output format, and how each score should be justified.'}
                                    />
                                </span>
                            </CardTitle>
                            <CardDescription className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">
                                {lang === 'es'
                                    ? 'Define exactamente cómo debe evaluar el modelo.'
                                    : 'Define exactly how the model should evaluate.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <textarea
                                value={config.evaluation_instruction || ''}
                                onChange={(e) => setConfig((prev) => ({ ...prev, evaluation_instruction: e.target.value }))}
                                placeholder={lang === 'es'
                                    ? 'Evalúa objetivamente cada criterio, cita evidencia textual breve y responde solo en JSON.'
                                    : 'Evaluate each criterion objectively, cite short textual evidence, and return only JSON.'}
                                className="w-full min-h-[120px] p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-1 focus:ring-primary/20 resize-y font-mono text-slate-700"
                            />
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 py-5">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                                    <CheckCircle2 className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Criterios Booleanos (Sí/No)' : 'Boolean Criteria (Pass/Fail)'}
                                    <HelpTooltip
                                        title={lang === 'es' ? 'Booleanos' : 'Boolean criteria'}
                                        content={lang === 'es'
                                            ? 'Cada criterio booleano vale cumplimiento o incumplimiento. Es ideal para checklist objetivo.'
                                            : 'Each boolean criterion is pass/fail. Ideal for objective checklist validation.'}
                                    />
                                </CardTitle>
                                <CardDescription className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-1">
                                    {lang === 'es' ? 'Objetivos medibles que se cumplen o no.' : 'Measurable objectives that are either met or not.'}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6 p-6">
                            {config.criteria.boolean.length === 0 && (
                                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                                    <p className="text-xs font-bold uppercase tracking-widest">{lang === 'es' ? 'Sin criterios booleanos' : 'No boolean criteria'}</p>
                                </div>
                            )}
                            {config.criteria.boolean.map((criterion: Criterion, idx: number) => (
                                <div
                                    key={criterion.id}
                                    data-evaluator-criterion-type="boolean"
                                    data-evaluator-criterion-id={criterion.id}
                                    className="scroll-mt-24 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 group hover:border-primary/20 transition-all"
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex gap-3">
                                                <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-black shrink-0 mt-2">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <Label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 block">
                                                        {lang === 'es' ? 'Título (Visible)' : 'Title (Visible)'}
                                                    </Label>
                                                    <Input
                                                        value={criterion.title}
                                                        onChange={e => updateCriterion('boolean', criterion.id, 'title', e.target.value)}
                                                        placeholder={lang === 'es' ? 'ej. Saludo Inicial' : 'e.g. Initial Greeting'}
                                                        className="h-9 text-sm font-bold bg-white border-slate-200"
                                                    />
                                                </div>
                                            </div>
                                            <div className="pl-9">
                                                <Label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 block">
                                                    {lang === 'es' ? 'Instrucción al Modelo (Interno)' : 'Model Instruction (Internal)'}
                                                </Label>
                                                <textarea
                                                    value={criterion.instruction}
                                                    onChange={e => updateCriterion('boolean', criterion.id, 'instruction', e.target.value)}
                                                    placeholder={lang === 'es' ? 'Evalúa si el usuario saludó cortesmente...' : 'Evaluate if user greeted politely...'}
                                                    className="w-full min-h-[60px] p-3 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-primary/20 resize-none font-mono text-slate-600"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeCriterion('boolean', criterion.id)}
                                            className="text-slate-300 hover:text-red-500 hover:bg-red-50 h-8 w-8 p-0 rounded-full"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addCriterion('boolean')}
                                className="w-full"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                {lang === 'es' ? 'Agregar criterio booleano' : 'Add boolean criterion'}
                            </Button>
                        </CardContent>
                    </Card>

                    <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                        <CardHeader className="bg-slate-50 border-b border-slate-100 py-5">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                                    <MessageSquareText className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Criterios Cualitativos (Feedback)' : 'Qualitative Criteria (Feedback)'}
                                    <HelpTooltip
                                        title={lang === 'es' ? 'Cualitativos' : 'Qualitative criteria'}
                                        content={lang === 'es'
                                            ? 'Generan observaciones y recomendaciones de mejora, no solo aprobación/rechazo.'
                                            : 'They produce observations and improvement recommendations, not just pass/fail.'}
                                    />
                                </CardTitle>
                                <CardDescription className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-1">
                                    {lang === 'es' ? 'Análisis detallado y observaciones.' : 'Detailed analysis and observations.'}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-6 p-6">
                            {config.criteria.qualitative.length === 0 && (
                                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                                    <p className="text-xs font-bold uppercase tracking-widest">{lang === 'es' ? 'Sin criterios cualitativos' : 'No qualitative criteria'}</p>
                                </div>
                            )}
                            {config.criteria.qualitative.map((criterion: Criterion, idx: number) => (
                                <div
                                    key={criterion.id}
                                    data-evaluator-criterion-type="qualitative"
                                    data-evaluator-criterion-id={criterion.id}
                                    className="scroll-mt-24 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 group hover:border-primary/20 transition-all"
                                >
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 space-y-3">
                                            <div className="flex gap-3">
                                                <div className="h-6 w-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px] font-black shrink-0 mt-2">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <Label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 block">
                                                        {lang === 'es' ? 'Título (Visible)' : 'Title (Visible)'}
                                                    </Label>
                                                    <Input
                                                        value={criterion.title}
                                                        onChange={e => updateCriterion('qualitative', criterion.id, 'title', e.target.value)}
                                                        placeholder={lang === 'es' ? 'ej. Tono de Voz' : 'e.g. Tone of Voice'}
                                                        className="h-9 text-sm font-bold bg-white border-slate-200"
                                                    />
                                                </div>
                                            </div>
                                            <div className="pl-9">
                                                <Label className="text-[9px] text-slate-400 font-black uppercase tracking-widest mb-1 block">
                                                    {lang === 'es' ? 'Instrucción al Modelo (Interno)' : 'Model Instruction (Internal)'}
                                                </Label>
                                                <textarea
                                                    value={criterion.instruction}
                                                    onChange={e => updateCriterion('qualitative', criterion.id, 'instruction', e.target.value)}
                                                    placeholder={lang === 'es' ? 'Analiza si el tono fue profesional...' : 'Analyze if tone was professional...'}
                                                    className="w-full min-h-[60px] p-3 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-primary/20 resize-none font-mono text-slate-600"
                                                />
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeCriterion('qualitative', criterion.id)}
                                            className="text-slate-300 hover:text-red-500 hover:bg-red-50 h-8 w-8 p-0 rounded-full"
                                        >
                                            <Trash className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addCriterion('qualitative')}
                                className="w-full"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                {lang === 'es' ? 'Agregar criterio cualitativo' : 'Add qualitative criterion'}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <VersionManager botId={bot.id} />
        </div>
    );
}
