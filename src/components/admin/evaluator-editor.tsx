'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateBot } from '@/app/actions/bots';
import { toast } from 'sonner';
import { ArrowLeft, Save, CheckCircle2, MessageSquareText, ShieldCheck, Database, Key, Eye, EyeOff, Copy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/components/providers/i18n-context';
import { v4 as uuidv4 } from 'uuid';
import { VersionManager } from './version-manager';
import { normalizeRagConfig } from '@/lib/rag-config';
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes-warning';
import { buildFlowWarningDescription } from '@/lib/flow-lint-feedback';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { EvaluatorCriteriaSection } from '@/components/admin/evaluator-criteria-section';

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
    // Legacy top-level mirrors for older saved configs.
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
                    // Legacy top-level mirrors for older saved configs.
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
            <AdminPageHeader
                variant="evaluator"
                eyebrow={lang === 'es' ? 'Editor de evaluador' : 'Evaluator editor'}
                title={(
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{name || (lang === 'es' ? 'Evaluador #1' : 'Evaluator #1')}</span>
                        <span className="admin-editor-chip">EVALUATOR</span>
                        {hasUnsavedChanges ? (
                            <span className="admin-editor-chip border-amber-200 bg-amber-50 text-amber-700">
                                {lang === 'es' ? 'Cambios pendientes' : 'Pending changes'}
                            </span>
                        ) : null}
                    </div>
                )}
                description={lang === 'es'
                    ? 'Criterios, RAG y guardado del evaluador.'
                    : 'Criteria, RAG and evaluator persistence.'}
                actions={(
                    <>
                        <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 font-bold">
                            <Link href="/admin/evaluators">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                {lang === 'es' ? 'Volver' : 'Back'}
                            </Link>
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving} className="h-11 rounded-2xl px-5 text-sm font-bold shadow-sm">
                            <Save className="mr-2 h-4 w-4" />
                            {isSaving ? (lang === 'es' ? 'Guardando...' : 'Saving...') : (lang === 'es' ? 'Guardar borrador' : 'Save draft')}
                        </Button>
                    </>
                )}
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.95fr)]">
                <div className="space-y-6">
                    <EvaluatorCriteriaSection
                        lang={lang}
                        type="boolean"
                        title={lang === 'es' ? 'Criterios booleanos' : 'Boolean criteria'}
                        description={lang === 'es'
                            ? 'Checklist objetivo para cumplimiento o incumplimiento.'
                            : 'Objective checklist for pass or fail decisions.'}
                        emptyLabel={lang === 'es' ? 'Todavia no hay criterios booleanos.' : 'No boolean criteria yet.'}
                        addLabel={lang === 'es' ? 'Agregar criterio' : 'Add criterion'}
                        icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
                        criteria={config.criteria.boolean}
                        titlePlaceholder={lang === 'es' ? 'Ej. Saludo inicial' : 'e.g. Initial greeting'}
                        instructionPlaceholder={lang === 'es' ? 'Evalua si el usuario saludo con cortesia y dentro del momento esperado.' : 'Evaluate whether the user greeted politely and at the expected time.'}
                        onAdd={() => addCriterion('boolean')}
                        onRemove={(id) => removeCriterion('boolean', id)}
                        onUpdate={(id, field, value) => updateCriterion('boolean', id, field, value)}
                    />

                    <EvaluatorCriteriaSection
                        lang={lang}
                        type="qualitative"
                        title={lang === 'es' ? 'Criterios cualitativos' : 'Qualitative criteria'}
                        description={lang === 'es'
                            ? 'Observaciones y matices para feedback detallado.'
                            : 'Observations and nuance for detailed feedback.'}
                        emptyLabel={lang === 'es' ? 'Todavia no hay criterios cualitativos.' : 'No qualitative criteria yet.'}
                        addLabel={lang === 'es' ? 'Agregar criterio' : 'Add criterion'}
                        icon={<MessageSquareText className="h-5 w-5 text-primary" />}
                        criteria={config.criteria.qualitative}
                        titlePlaceholder={lang === 'es' ? 'Ej. Tono de voz' : 'e.g. Tone of voice'}
                        instructionPlaceholder={lang === 'es' ? 'Analiza si el tono fue profesional, claro y consistente durante la sesion.' : 'Analyze whether the tone stayed professional, clear, and consistent during the session.'}
                        onAdd={() => addCriterion('qualitative')}
                        onRemove={(id) => removeCriterion('qualitative', id)}
                        onUpdate={(id, field, value) => updateCriterion('qualitative', id, field, value)}
                    />
                </div>

                <div className="space-y-6">
                    <AdminPanel
                        variant="section"
                        title={(
                            <span className="flex items-center gap-2">
                                <Key className="h-5 w-5 text-primary" />
                                {lang === 'es' ? 'Identidad y acceso' : 'Identity and access'}
                            </span>
                        )}
                        description={lang === 'es'
                            ? 'Nombre, credenciales y modelo base del evaluador.'
                            : 'Name, credentials, and base model for the evaluator.'}
                        contentClassName="space-y-5"
                    >
                        <div className="space-y-2">
                            <Label className="admin-editor-label">{lang === 'es' ? 'Nombre' : 'Name'}</Label>
                            <Input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                className="h-11 rounded-xl border-slate-200 bg-slate-50 font-semibold text-slate-900"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label className="admin-editor-label">OpenAI API key</Label>
                            <div className="relative">
                                <Input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(event) => {
                                        setApiKey(event.target.value);
                                        setApiKeyChanged(true);
                                    }}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    placeholder={hasStoredApiKey
                                        ? (apiKeyDisplay || (lang === 'es' ? 'Guardada (oculta)' : 'Saved (hidden)'))
                                        : 'sk-...'}
                                    className="h-11 rounded-xl border-slate-200 bg-slate-50 pr-20 font-mono text-slate-900"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey((previous) => !previous)}
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
                                    className="h-8 rounded-xl border-slate-200 text-[11px] font-semibold"
                                    disabled={!hasStoredApiKey || isRevealingApiKey}
                                    onClick={handleRevealApiKey}
                                >
                                    <Eye className="mr-1 h-3.5 w-3.5" />
                                    {lang === 'es' ? 'Revelar' : 'Reveal'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-xl border-slate-200 text-[11px] font-semibold"
                                    disabled={isRevealingApiKey || (!hasStoredApiKey && !apiKey)}
                                    onClick={handleCopyApiKey}
                                >
                                    <Copy className="mr-1 h-3.5 w-3.5" />
                                    Copy
                                </Button>
                            </div>
                            {!isApiKeyValid ? (
                                <p className="text-[11px] text-red-500">
                                    {lang === 'es' ? 'La API key debe comenzar con "sk-".' : 'API key must start with "sk-".'}
                                </p>
                            ) : null}
                        </div>

                        <div className="space-y-2">
                            <Label className="admin-editor-label">Prompt ID</Label>
                            <Input
                                value={promptId}
                                onChange={(event) => setPromptId(event.target.value)}
                                placeholder="pmpt_xxxxx"
                                className="h-10 rounded-xl border-slate-200 bg-slate-50 font-mono text-xs text-slate-700"
                            />
                            {!isPromptIdValid ? (
                                <p className="text-[11px] text-red-500">
                                    {lang === 'es' ? 'Debe iniciar con pmpt_ o quedar vacio.' : 'Must start with pmpt_ or stay empty.'}
                                </p>
                            ) : null}
                            <p className="admin-editor-note">
                                {lang === 'es'
                                    ? 'Si usas pmpt_*, se ejecuta Responses API con prompt gestionado.'
                                    : 'Using pmpt_* triggers the Responses API with a managed prompt.'}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label className="admin-editor-label">{lang === 'es' ? 'Modelo' : 'Model'}</Label>
                            <Input
                                value={modelName}
                                onChange={(event) => setModelName(event.target.value)}
                                placeholder="gpt-4o"
                                className="h-10 rounded-xl border-slate-200 bg-slate-50 font-mono text-xs text-slate-700"
                            />
                            {!isModelValid ? (
                                <p className="text-[11px] text-red-500">
                                    {lang === 'es' ? 'Modelo invalido. Ejemplo: gpt-4o-mini.' : 'Invalid model. Example: gpt-4o-mini.'}
                                </p>
                            ) : null}
                            <p className="admin-editor-note">
                                {lang === 'es'
                                    ? 'Se usa en Chat Completions y como fallback de Responses.'
                                    : 'Used for Chat Completions and as the Responses fallback.'}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label className="admin-editor-label">{lang === 'es' ? 'Version del prompt' : 'Prompt version'}</Label>
                            <Input
                                value={promptVersion}
                                onChange={(event) => setPromptVersion(event.target.value)}
                                placeholder="1"
                                className="h-10 rounded-xl border-slate-200 bg-slate-50 font-mono text-xs text-slate-700"
                            />
                        </div>
                    </AdminPanel>

                    <AdminPanel
                        variant="section"
                        title={lang === 'es' ? 'Instruccion de evaluacion' : 'Evaluation instruction'}
                        description={lang === 'es'
                            ? 'Regla base para salida, criterio y justificacion.'
                            : 'Base rule for output, criteria, and justification.'}
                    >
                        <textarea
                            value={config.evaluation_instruction || ''}
                            onChange={(event) => setConfig((previous) => ({ ...previous, evaluation_instruction: event.target.value }))}
                            placeholder={lang === 'es'
                                ? 'Evalua objetivamente cada criterio, cita evidencia breve y responde solo en JSON.'
                                : 'Evaluate each criterion objectively, cite brief evidence, and respond only in JSON.'}
                            className="min-h-[180px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary/15 resize-y"
                        />
                    </AdminPanel>

                    <AdminPanel
                        variant="section"
                        title={(
                            <span className="flex items-center gap-2">
                                <Database className="h-5 w-5 text-primary" />
                                {lang === 'es' ? 'RAG y evidencia' : 'RAG and evidence'}
                            </span>
                        )}
                        description={lang === 'es'
                            ? 'Controla cuando consultar evidencia y cuan estricta debe ser.'
                            : 'Control when to query evidence and how strict it should be.'}
                        contentClassName="space-y-5"
                    >
                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label className="admin-editor-label">{lang === 'es' ? 'Modo' : 'Mode'}</Label>
                                <select
                                    value={ragConfig.mode}
                                    onChange={(event) => updateRagConfig({ mode: event.target.value, enabled: event.target.value !== 'never' })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700"
                                >
                                    <option value="never">{lang === 'es' ? 'Nunca' : 'Never'}</option>
                                    <option value="always">{lang === 'es' ? 'Siempre' : 'Always'}</option>
                                    <option value="evaluation_only">{lang === 'es' ? 'Solo evaluacion' : 'Evaluation only'}</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <Label className="admin-editor-label">{lang === 'es' ? 'Motor' : 'Engine'}</Label>
                                <select
                                    value={ragConfig.owner}
                                    onChange={(event) => updateRagConfig({ owner: event.target.value, rag_owner: event.target.value })}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700"
                                >
                                    <option value="wrapper">Wrapper</option>
                                    <option value="platform">Platform</option>
                                </select>
                                <p className="admin-editor-note">
                                    {ragConfig.owner === 'wrapper'
                                        ? (lang === 'es' ? 'Wrapper permite mas tuning y fallback configurable.' : 'Wrapper allows finer tuning and configurable fallback.')
                                        : (lang === 'es' ? 'Platform reduce configuracion y usa retrieval nativo.' : 'Platform reduces configuration and uses native retrieval.')}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <Label className="admin-editor-label">{lang === 'es' ? 'Vector Store IDs' : 'Vector Store IDs'}</Label>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-xl border-slate-200 px-3 text-[11px] font-semibold"
                                    onClick={() => updateRagConfig({ vector_store_ids: [...(ragConfig.vector_store_ids || []), ''] })}
                                >
                                    {lang === 'es' ? 'Agregar ID' : 'Add ID'}
                                </Button>
                            </div>
                            {(ragConfig.vector_store_ids || []).length === 0 ? (
                                <div className="admin-editor-subpanel border-dashed">
                                    <p className="text-sm text-slate-500">
                                        {lang === 'es' ? 'No hay stores configurados.' : 'No stores configured yet.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(ragConfig.vector_store_ids || []).map((id: string, index: number) => (
                                        <div key={`${index}-${id || 'empty'}`} className="flex items-center gap-2">
                                            <Input
                                                value={id}
                                                onChange={(event) => {
                                                    const next = [...(ragConfig.vector_store_ids || [])];
                                                    next[index] = event.target.value;
                                                    updateRagConfig({ vector_store_ids: next });
                                                }}
                                                placeholder="vs_abc123"
                                                className="h-10 rounded-xl border-slate-200 bg-slate-50 font-mono text-xs text-slate-700"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-9 w-9 rounded-full text-red-500 hover:bg-red-50"
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
                            )}
                        </div>

                        <div className="admin-editor-subpanel flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <p className="font-semibold text-slate-900">
                                    {lang === 'es' ? 'Evidencia requerida' : 'Evidence required'}
                                </p>
                                <p className="admin-editor-note">
                                    {lang === 'es' ? 'Si no hay evidencia, el evaluador debe caer en una respuesta segura.' : 'If evidence is missing, the evaluator should fall back safely.'}
                                </p>
                            </div>
                            <input
                                type="checkbox"
                                checked={ragConfig.strict_mode}
                                onChange={(event) => updateRagConfig({ strict_mode: event.target.checked })}
                            />
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            className="h-9 w-full rounded-xl text-sm font-semibold text-slate-600"
                            onClick={() => setRagAdvancedOpen((value) => !value)}
                        >
                            {ragAdvancedOpen
                                ? (lang === 'es' ? 'Ocultar avanzado' : 'Hide advanced')
                                : (lang === 'es' ? 'Mostrar avanzado' : 'Show advanced')}
                        </Button>

                        {ragAdvancedOpen ? (
                            <div className="admin-editor-subpanel space-y-4">
                                {ragConfig.owner === 'wrapper' ? (
                                    <>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label className="admin-editor-label">{lang === 'es' ? 'Estrategia' : 'Strategy'}</Label>
                                                <select
                                                    value={ragConfig.wrapper.strategy}
                                                    onChange={(event) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, strategy: event.target.value } })}
                                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                                >
                                                    <option value="metadata_first">{lang === 'es' ? 'Priorizar metadatos' : 'Metadata first'}</option>
                                                    <option value="similarity">{lang === 'es' ? 'Priorizar similitud' : 'Similarity first'}</option>
                                                    <option value="hybrid">{lang === 'es' ? 'Hibrida' : 'Hybrid'}</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="admin-editor-label">Fallback</Label>
                                                <select
                                                    value={ragConfig.wrapper.fallback}
                                                    onChange={(event) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, fallback: event.target.value } })}
                                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                                >
                                                    <option value="rewrite_retry">{lang === 'es' ? 'Reescribir y reintentar' : 'Rewrite and retry'}</option>
                                                    <option value="secondary_store">{lang === 'es' ? 'Store secundario' : 'Secondary store'}</option>
                                                    <option value="safe_reply">{lang === 'es' ? 'Respuesta segura' : 'Safe reply'}</option>
                                                    <option value="none">{lang === 'es' ? 'Sin fallback' : 'No fallback'}</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                            <div className="space-y-2">
                                                <Label className="admin-editor-label">Top-K</Label>
                                                <Input
                                                    type="number"
                                                    value={ragConfig.wrapper.top_k}
                                                    onChange={(event) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, top_k: Number(event.target.value || 8) } })}
                                                    className="h-10 rounded-xl border-slate-200 bg-white text-sm"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="admin-editor-label">{lang === 'es' ? 'Umbral' : 'Threshold'}</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={ragConfig.wrapper.score_threshold ?? ''}
                                                    onChange={(event) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, score_threshold: event.target.value ? Number(event.target.value) : undefined } })}
                                                    className="h-10 rounded-xl border-slate-200 bg-white text-sm"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="admin-editor-label">TTL</Label>
                                                <Input
                                                    type="number"
                                                    value={ragConfig.wrapper.cache_ttl}
                                                    onChange={(event) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, cache_ttl: Number(event.target.value || 120) } })}
                                                    className="h-10 rounded-xl border-slate-200 bg-white text-sm"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="admin-editor-label">{lang === 'es' ? 'Max. evidencia' : 'Max evidence'}</Label>
                                                <Input
                                                    type="number"
                                                    value={ragConfig.wrapper.max_evidence_tokens}
                                                    onChange={(event) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, max_evidence_tokens: Number(event.target.value || 1400) } })}
                                                    className="h-10 rounded-xl border-slate-200 bg-white text-sm"
                                                />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label className="admin-editor-label">max_num_results</Label>
                                            <Input
                                                type="number"
                                                value={ragConfig.platform.max_num_results}
                                                onChange={(event) => updateRagConfig({ platform: { ...ragConfig.platform, max_num_results: Number(event.target.value || 8) } })}
                                                className="h-10 rounded-xl border-slate-200 bg-white text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="admin-editor-label">force_tool</Label>
                                            <div className="flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(ragConfig.platform.force_tool)}
                                                    onChange={(event) => updateRagConfig({ platform: { ...ragConfig.platform, force_tool: event.target.checked } })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </AdminPanel>
                </div>
            </div>

            <VersionManager botId={bot.id} />
        </div>
    );
}
