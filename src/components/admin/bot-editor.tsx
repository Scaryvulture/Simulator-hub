'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { updateBot } from '@/app/actions/bots';
import { toast } from 'sonner';
import { Terminal, Key, Database, HelpCircle, Eye, EyeOff, BookOpen, ShieldCheck, FileSignature, ImagePlus, X, Copy, Check, Code } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import helpData from '@/lib/field-help.json';
import { useLanguage } from '@/components/providers/i18n-context';
import { StrategyFields } from './strategy-fields';
import { HelpTooltip } from './help-tooltip';
import { BotConfigSchema } from '@/lib/schemas/bot-config';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { Switch } from '@/components/ui/switch';
import { updateBotOrganizations } from '@/app/actions/organizations';
import { normalizeRagConfig } from '@/lib/rag-config';
import { cn } from "@/lib/utils"
import { VersionManager } from '@/components/admin/version-manager';
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes-warning';
import { sanitizeImageTriggersForSave } from '@/lib/image-trigger-utils';
import { buildFlowWarningDescription } from '@/lib/flow-lint-feedback';
import { BotEditorHeader } from '@/components/admin/bot-editor-header';
import { BotEditorOrganizationsCard } from '@/components/admin/bot-editor-organizations-card';
import { BotEditorToolsCard } from '@/components/admin/bot-editor-tools-card';

interface Props {
    bot: EditorBot;
    availableOrganizations: AvailableOrganization[];
    availableEvaluators?: AvailableEvaluator[];
}

type EditorBot = NonNullable<Awaited<ReturnType<typeof import('@/app/actions/bots').getBot>>> & {
    organizations?: Array<{ organization_id: string }>;
    logo?: string | null;
};
type AvailableOrganization = Awaited<ReturnType<typeof import('@/app/actions/organizations').getAllOrganizations>>[number];
type AvailableEvaluator = Awaited<ReturnType<typeof import('@/app/actions/bots').getAllEvaluators>>[number];
type BotEditorConfig = BotConfig & Record<string, unknown>;

function formatToolsForEditor(tools: unknown): string {
    if (!Array.isArray(tools) || tools.length === 0) {
        return '';
    }
    try {
        return JSON.stringify(tools, null, 2);
    } catch {
        return '';
    }
}

function parseToolsJsonForConfig(rawText: string): { tools: BotConfig['tools'] | undefined; error: string | null } {
    const trimmed = rawText.trim();
    if (!trimmed) {
        return { tools: undefined, error: null };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return { tools: undefined, error: 'invalid_json' };
    }

    const result = BotConfigSchema.safeParse({ tools: parsed });
    if (!result.success) {
        const issue = result.error.issues[0];
        const issuePath = issue?.path?.join('.') || 'tools';
        return { tools: undefined, error: `${issuePath} - ${issue?.message || 'validation_error'}` };
    }

    const tools = Array.isArray(result.data.tools) && result.data.tools.length > 0
        ? result.data.tools
        : undefined;
    return { tools, error: null };
}

function parseBotConfig(raw: unknown): BotEditorConfig {
    const rawConfig = (() => {
        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw) as unknown;
            } catch {
                return {};
            }
        }
        return raw || {};
    })();

    const parsed = BotConfigSchema.safeParse(rawConfig);
    if (parsed.success) {
        return parsed.data as BotEditorConfig;
    }
    if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
        return rawConfig as BotEditorConfig;
    }
    return {};
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function getHelpText(lang: 'es' | 'en', field: string): string {
    const helpDictionary = helpData as Record<string, Record<string, string>>;
    return helpDictionary[lang]?.[field] || '';
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function maskApiKeyForUi(value: string): string {
    if (!value) return '';
    if (value.length <= 8) return '********';
    return `${value.slice(0, 3)}...${value.slice(-4)}`;
}

type ModelTextFormat = 'text' | 'json_object';
type ModelReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
type ModelVerbosity = 'low' | 'medium' | 'high';
type ModelSummary = 'auto' | 'concise' | 'detailed';

type ModelControls = {
    text_format: ModelTextFormat;
    reasoning_effort: ModelReasoningEffort;
    verbosity: ModelVerbosity;
    summary: ModelSummary;
    store_logs: boolean;
};

const DEFAULT_MODEL_CONTROLS: ModelControls = {
    text_format: 'text',
    reasoning_effort: 'medium',
    verbosity: 'medium',
    summary: 'auto',
    store_logs: true,
};

function normalizeModelControls(raw: unknown): ModelControls {
    const source = (raw && typeof raw === 'object' && !Array.isArray(raw))
        ? raw as Record<string, unknown>
        : {};

    const textFormat = source.text_format;
    const reasoningEffort = source.reasoning_effort;
    const verbosity = source.verbosity;
    const summary = source.summary;

    return {
        text_format: textFormat === 'json_object' ? 'json_object' : 'text',
        reasoning_effort: (
            reasoningEffort === 'none'
            || reasoningEffort === 'minimal'
            || reasoningEffort === 'low'
            || reasoningEffort === 'medium'
            || reasoningEffort === 'high'
            || reasoningEffort === 'xhigh'
        ) ? reasoningEffort : DEFAULT_MODEL_CONTROLS.reasoning_effort,
        verbosity: (verbosity === 'low' || verbosity === 'medium' || verbosity === 'high')
            ? verbosity
            : DEFAULT_MODEL_CONTROLS.verbosity,
        summary: (summary === 'auto' || summary === 'concise' || summary === 'detailed')
            ? summary
            : DEFAULT_MODEL_CONTROLS.summary,
        store_logs: typeof source.store_logs === 'boolean' ? source.store_logs : DEFAULT_MODEL_CONTROLS.store_logs,
    };
}

export function BotEditor({ bot, availableOrganizations, availableEvaluators }: Props) {
    const { lang } = useLanguage();
    const router = useRouter();
    const initialConfig = parseBotConfig(bot.config);
    const legacyPromptValue = bot.openai_prompt_id || '';
    const initialPromptId = legacyPromptValue.startsWith('pmpt_') ? legacyPromptValue : '';
    const initialModel = stringValue(initialConfig.llm_model)
        || (legacyPromptValue && !legacyPromptValue.startsWith('pmpt_') ? legacyPromptValue : 'gpt-4o');
    const initialSelectedOrgIds = (bot.organizations?.map((o) => o.organization_id) || []).sort();
    const initialToolsJson = formatToolsForEditor(initialConfig.tools);

    const [name, setName] = useState(bot.name);
    const [botType, setBotType] = useState(bot.bot_type || 'SIMULATOR');
    const [apiKey, setApiKey] = useState('');
    const [hasStoredApiKey, setHasStoredApiKey] = useState(Boolean(bot.has_api_key));
    const [apiKeyDisplay, setApiKeyDisplay] = useState(bot.api_key_display || '');
    const [apiKeyChanged, setApiKeyChanged] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [isRevealingApiKey, setIsRevealingApiKey] = useState(false);
    const [promptId, setPromptId] = useState(initialPromptId);
    const [modelName, setModelName] = useState(initialModel);
    const [vectorStoreId, setVectorStoreId] = useState(bot.openai_vector_store_id || '');
    const [promptVersion, setPromptVersion] = useState(bot.prompt_version || '1');
    const [config, setConfig] = useState<BotEditorConfig>(initialConfig);
    const [isSaving, setIsSaving] = useState(false);
    const [viewMode, setViewMode] = useState<'STANDARD' | 'PROFESSIONAL'>('STANDARD');
    const [ragAdvancedOpen, setRagAdvancedOpen] = useState(false);
    const [modelAdvancedOpen, setModelAdvancedOpen] = useState(false);
    const [toolsSectionOpen, setToolsSectionOpen] = useState(false);
    const [toolsJsonText, setToolsJsonText] = useState(initialToolsJson);
    const [toolsJsonError, setToolsJsonError] = useState<string | null>(null);

    const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>(
        initialSelectedOrgIds
    );
    const [openOrg, setOpenOrg] = useState(false);

    const handleToggleOrg = (orgId: string) => {
        setSelectedOrgIds(prev =>
            prev.includes(orgId)
                ? prev.filter(id => id !== orgId)
                : [...prev, orgId]
        );
    };

    const [proJsonText, setProJsonText] = useState('');
    const [proJsonError, setProJsonError] = useState<string | null>(null);
    const wasProModeRef = useRef(false);
    const initialSnapshotRef = useRef<string>(JSON.stringify({
        name: bot.name,
        botType: bot.bot_type || 'SIMULATOR',
        hasStoredApiKey: Boolean(bot.has_api_key),
        apiKeyDraft: '',
        promptId: initialPromptId,
        modelName: initialModel,
        vectorStoreId: bot.openai_vector_store_id || '',
        promptVersion: bot.prompt_version || '1',
        config: initialConfig,
        toolsJsonText: initialToolsJson,
        selectedOrgIds: initialSelectedOrgIds,
    }));

    const defaultRagConfig = {
        enabled: false,
        mode: 'never',
        owner: 'wrapper',
        rag_owner: 'wrapper',
        vector_store_ids: [] as string[],
        strict_mode: false,
        history_limit: 10,
        wrapper: {
            strategy: 'similarity',
            fallback: 'none',
            score_threshold: undefined as number | undefined,
            cache_ttl: 120,
            metadata_filters: {} as Record<string, string | number | boolean>,
            top_k: 4,
            max_evidence_tokens: 1200,
        },
        platform: {
            max_num_results: 6,
            filters: {} as Record<string, string | number | boolean>,
            ranking_options: {} as { score_threshold?: number },
            force_tool: false,
        },
        audit: {
            store_results: true,
            store_queries: true,
            store_scores: true,
        },
        // Legacy top-level mirrors for older saved configs.
        top_k: 4,
        fallback_strategy: 'none',
        metadata_filters: {} as Record<string, string | number | boolean>,
        cache_ttl_seconds: 120,
        max_evidence_tokens: 1200,
    };

    useEffect(() => {
        const isProfessional = viewMode === 'PROFESSIONAL';
        if (isProfessional && !wasProModeRef.current) {
            const fullObj = {
                bot_id: bot.id,
                identity: { name, type: botType, security: "locked" },
                orchestration: { prompt_id: promptId, model: modelName, vector_store: vectorStoreId, version: promptVersion },
                logic_layer: config
            };
            setProJsonText(JSON.stringify(fullObj, null, 4));
            setProJsonError(null);
        }
        wasProModeRef.current = isProfessional;
    }, [viewMode, bot.id, name, botType, promptId, modelName, vectorStoreId, promptVersion, config]);

    useEffect(() => {
        if (viewMode !== 'STANDARD') return;
        setToolsJsonText(formatToolsForEditor(config.tools));
        setToolsJsonError(null);
    }, [viewMode, config.tools]);

    const handleProJsonChange = (text: string) => {
        setProJsonText(text);
        try {
            const val = JSON.parse(text);
            if (val.identity?.name) setName(val.identity.name);
            if (val.identity?.type) setBotType(val.identity.type);
            if (val.orchestration?.prompt_id !== undefined) setPromptId(String(val.orchestration.prompt_id || ''));
            if (val.orchestration?.model !== undefined) setModelName(String(val.orchestration.model || ''));
            if (val.orchestration?.vector_store !== undefined) setVectorStoreId(val.orchestration.vector_store);
            if (val.orchestration?.version !== undefined) setPromptVersion(String(val.orchestration.version));

            if (val.logic_layer) {
                const result = BotConfigSchema.safeParse(val.logic_layer);
                if (!result.success) {
                    setProJsonError(`Schema Error: ${result.error.issues[0].path.join('.')} - ${result.error.issues[0].message}`);
                } else {
                    setConfig(val.logic_layer);
                    if (typeof val.logic_layer.llm_model === 'string') {
                        setModelName(val.logic_layer.llm_model);
                    }
                    setProJsonError(null);
                }
            } else {
                setProJsonError(null);
            }
        } catch {
            setProJsonError('JSON inválido - los cambios se aplicarán cuando el JSON sea válido');
        }
    };

    const validators = {
        apiKey: (val: string) => !val || val.startsWith('sk-'),
        promptId: (val: string) => !val || val.startsWith('pmpt_'),
        model: (val: string) => !val || val.startsWith('gpt-') || val.startsWith('o') || val.startsWith('chatgpt-') || val.startsWith('codex-'),
        vectorStoreId: (val: string) => !val || val.startsWith('vs_'),
        name: (val: string) => val.length > 0,
    };

    const validationMessages = {
        es: {
            apiKey: 'Debe comenzar con "sk-"',
            promptId: 'Usa pmpt_xxxxx o déjalo vacío',
            model: 'Usa un modelo válido (ej: gpt-4o-mini) o déjalo vacío',
            vectorStoreId: 'Debe comenzar con "vs_" o estar vacío',
            name: 'El nombre es obligatorio',
        },
        en: {
            apiKey: 'Must start with "sk-"',
            promptId: 'Use pmpt_xxxxx or leave empty',
            model: 'Use a valid model (e.g., gpt-4o-mini) or leave empty',
            vectorStoreId: 'Must start with "vs_" or be empty',
            name: 'Name is required',
        }
    };

    const isApiKeyValid = validators.apiKey(apiKey);
    const isPromptIdValid = validators.promptId(promptId);
    const isModelValid = validators.model(modelName);
    const isNameValid = validators.name(name);

    const getInputClassName = (isValid: boolean, baseClass: string) => {
        return `${baseClass} ${!isValid ? 'border-red-400 bg-red-50/50 focus:ring-red-200' : ''}`;
    };

    const modelControls = normalizeModelControls(
        (config && typeof config === 'object' && !Array.isArray(config))
            ? (config as Record<string, unknown>).model_controls
            : undefined
    );

    const updateModelControl = <K extends keyof ModelControls>(field: K, value: ModelControls[K]) => {
        setConfig((prev) => {
            const current = normalizeModelControls(
                (prev && typeof prev === 'object' && !Array.isArray(prev))
                    ? (prev as Record<string, unknown>).model_controls
                    : undefined
            );
            return {
                ...prev,
                model_controls: {
                    ...current,
                    [field]: value,
                },
            };
        });
    };

    const getToolsErrorText = (error: string): string => {
        if (error === 'invalid_json') {
            return lang === 'es'
                ? 'JSON inválido en herramientas. Si querés desactivar tools, dejá el campo vacío.'
                : 'Invalid tools JSON. Leave the field empty to disable tools.';
        }
        return lang === 'es'
            ? `Formato inválido de tools: ${error}`
            : `Invalid tools format: ${error}`;
    };

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

        const normalizedApiKey = apiKey.trim();
        const shouldPersistApiKey = !hasStoredApiKey || apiKeyChanged;

        if (shouldPersistApiKey && !normalizedApiKey) {
            toast.error(lang === 'es' ? 'La API Key es obligatoria' : 'API Key is mandatory');
            return;
        }
        if (shouldPersistApiKey && !validators.apiKey(normalizedApiKey)) {
            toast.error(validationMessages[lang].apiKey);
            return;
        }
        if (!isPromptIdValid) {
            toast.error(validationMessages[lang].promptId);
            return;
        }
        if (!isModelValid) {
            toast.error(validationMessages[lang].model);
            return;
        }
        const parsedTools = parseToolsJsonForConfig(toolsJsonText);
        if (parsedTools.error) {
            const message = getToolsErrorText(parsedTools.error);
            setToolsJsonError(message);
            toast.error(message);
            return;
        }
        setToolsJsonError(null);

        try {
            setIsSaving(true);
            const currentRag = {
                ...defaultRagConfig,
                ...(config.rag_config || {}),
            };
            const normalized = normalizeRagConfig(currentRag, vectorStoreId);
            if (normalized.mode !== 'never' && normalized.mode !== 'evaluation_only' && normalized.vector_store_ids.length === 0) {
                toast.error(lang === 'es' ? 'RAG activo requiere al menos un Vector Store ID' : 'RAG enabled requires at least one Vector Store ID');
                return;
            }

            const normalizedConfig: BotEditorConfig = {
                ...(typeof config === 'string' ? JSON.parse(config) : config),
                llm_model: modelName.trim(),
                tools: parsedTools.tools,
                model_controls: {
                    ...modelControls,
                },
                chat_features: {
                    ...chatFeatures,
                },
                rag_config: {
                    ...currentRag,
                    enabled: normalized.enabled,
                    mode: normalized.mode,
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
            if (!parsedTools.tools) {
                delete normalizedConfig.tools;
            }

            const triggerValidation = sanitizeImageTriggersForSave(normalizedConfig.image_triggers);
            if (triggerValidation.partialRow) {
                toast.error(
                    lang === 'es'
                        ? `Disparador de imagen incompleto en la fila ${triggerValidation.partialRow}. Completá patrón y URL, o eliminá la fila.`
                        : `Incomplete image trigger on row ${triggerValidation.partialRow}. Fill pattern and URL, or remove the row.`
                );
                return;
            }
            if (triggerValidation.invalidUrlRow) {
                toast.error(
                    lang === 'es'
                        ? `URL de imagen inválida en la fila ${triggerValidation.invalidUrlRow}.`
                        : `Invalid image URL on row ${triggerValidation.invalidUrlRow}.`
                );
                return;
            }
            if (triggerValidation.invalidHostRow) {
                toast.error(
                    lang === 'es'
                        ? `Dominio no permitido en la fila ${triggerValidation.invalidHostRow}: ${triggerValidation.invalidHost || 'host desconocido'}.`
                        : `Disallowed domain on row ${triggerValidation.invalidHostRow}: ${triggerValidation.invalidHost || 'unknown host'}.`
                );
                return;
            }
            normalizedConfig.image_triggers = triggerValidation.sanitized && triggerValidation.sanitized.length > 0
                ? triggerValidation.sanitized
                : undefined;

            const payload: Parameters<typeof updateBot>[1] = {
                name,
                bot_type: botType,
                openai_prompt_id: promptId.trim(),
                openai_vector_store_id: normalized.vector_store_ids[0] || '',
                prompt_version: promptVersion,
                config: normalizedConfig,
                published: bot.published,
            };
            if (shouldPersistApiKey) {
                payload.api_key = normalizedApiKey;
            }
            const saveResult = await updateBot(bot.id, payload);
            if (!saveResult.success) {
                toast.error(saveResult.error);
                return;
            }
            const savedToolsText = formatToolsForEditor(parsedTools.tools);
            setConfig(normalizedConfig);
            setToolsJsonText(savedToolsText);

            const lint = saveResult.data.flow_lint;
            if (lint) {
                if (lint.critical_count > 0) {
                    toast.warning(
                        lang === 'es'
                            ? `Guardado con ${lint.critical_count} error(es) crítico(s) de flujo. Revisá el editor antes de publicar.`
                            : `Saved with ${lint.critical_count} critical flow issue(s). Review before publishing.`
                    );
                } else if (lint.warning_count > 0) {
                    const warningTitle = lang === 'es'
                        ? `Guardado con ${lint.warning_count} warning(s) de flujo.`
                        : `Saved with ${lint.warning_count} flow warning(s).`;
                    const warningDescription = buildFlowWarningDescription({
                        report: lint,
                        config: normalizedConfig,
                        lang,
                    });
                    if (warningDescription) {
                        toast.warning(warningTitle, { description: warningDescription });
                    } else {
                        toast.warning(warningTitle);
                    }
                }
            }

            const organizationUpdateResult = await updateBotOrganizations(bot.id, selectedOrgIds);
            if (!organizationUpdateResult.success) {
                toast.error(organizationUpdateResult.error);
                return;
            }

            toast.success(lang === 'es' ? 'Configuración guardada' : 'Configuration saved');
            if (shouldPersistApiKey) {
                setHasStoredApiKey(Boolean(normalizedApiKey));
                setApiKeyDisplay(maskApiKeyForUi(normalizedApiKey));
                setApiKey('');
                setApiKeyChanged(false);
                setShowApiKey(false);
            }
            initialSnapshotRef.current = JSON.stringify({
                name,
                botType,
                hasStoredApiKey: shouldPersistApiKey ? Boolean(normalizedApiKey) : hasStoredApiKey,
                apiKeyDraft: '',
                promptId,
                modelName,
                vectorStoreId,
                promptVersion,
                config: normalizedConfig,
                toolsJsonText: savedToolsText,
                selectedOrgIds: [...selectedOrgIds].sort(),
            });
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setIsSaving(false);
        }
    };

    const updateConfigField = (field: string, value: unknown) => {
        setConfig((prev) => ({ ...prev, [field]: value }));
    };

    const updateRagConfig = (patch: Record<string, unknown>) => {
        setConfig((prev) => {
            const current = {
                ...defaultRagConfig,
                ...(prev?.rag_config || {}),
            };
            return {
                ...prev,
                rag_config: { ...current, ...patch },
            } as BotEditorConfig;
        });
    };

    const chatFeatures = {
        allow_image_upload: Boolean((config.chat_features as Record<string, unknown> | undefined)?.allow_image_upload),
        allow_voice_input: (config.chat_features as Record<string, unknown> | undefined)?.allow_voice_input !== false,
        allow_voice_output: (config.chat_features as Record<string, unknown> | undefined)?.allow_voice_output !== false,
        tts_settings: (() => {
            const raw = ((config.chat_features as Record<string, unknown> | undefined)?.tts_settings as Record<string, unknown> | undefined) || {};
            const speedRaw = typeof raw.speed === 'number' ? raw.speed : Number(raw.speed);
            const speed = Number.isFinite(speedRaw) ? Math.min(1.5, Math.max(0.7, speedRaw)) : 1.15;
            const genderRaw = raw.gender;
            const gender = genderRaw === 'female' || genderRaw === 'male' || genderRaw === 'neutral' || genderRaw === 'random'
                ? genderRaw
                : 'neutral';
            return {
                speed,
                voice: typeof raw.voice === 'string' ? raw.voice : '',
                accent: typeof raw.accent === 'string' ? raw.accent : '',
                gender,
                style: typeof raw.style === 'string' ? raw.style : '',
                use_archetype: Boolean(raw.use_archetype),
            };
        })(),
    };

    const updateChatFeature = (field: 'allow_image_upload' | 'allow_voice_input' | 'allow_voice_output', value: boolean) => {
        setConfig((prev) => {
            const current = (prev.chat_features && typeof prev.chat_features === 'object' && !Array.isArray(prev.chat_features))
                ? prev.chat_features as Record<string, unknown>
                : {};
            return {
                ...prev,
                chat_features: {
                    ...current,
                    [field]: value,
                },
            };
        });
    };

    const updateTtsSetting = (
        field: 'speed' | 'voice' | 'accent' | 'gender' | 'style' | 'use_archetype',
        value: number | string | boolean
    ) => {
        setConfig((prev) => {
            const current = (prev.chat_features && typeof prev.chat_features === 'object' && !Array.isArray(prev.chat_features))
                ? prev.chat_features as Record<string, unknown>
                : {};
            const currentTts = (current.tts_settings && typeof current.tts_settings === 'object' && !Array.isArray(current.tts_settings))
                ? current.tts_settings as Record<string, unknown>
                : {};
            return {
                ...prev,
                chat_features: {
                    ...current,
                    tts_settings: {
                        ...currentTts,
                        [field]: value,
                    },
                },
            };
        });
    };

    const HelpTrigger = ({ field }: { field: string }) => (
        <Popover>
            <PopoverTrigger asChild>
                <button className="ml-2 text-slate-400 hover:text-primary transition-colors focus:outline-none">
                    <HelpCircle className="h-3.5 w-3.5" />
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="space-y-2">
                    <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900">
                        <BookOpen className="h-3 w-3 text-primary" /> {lang === 'es' ? 'Guía técnica' : 'Technical Guide'}: {field.replace('_', ' ').toUpperCase()}
                    </h4>
                    <p className="text-[11px] font-medium leading-relaxed text-slate-600">
                        {getHelpText(lang, field)}
                    </p>
                </div>
            </PopoverContent>
        </Popover>
    );

    const labels = {
        es: {
            bot_config: "Configuración del Bot",
            basic_info: "Identidad",
            basic_desc: "Parámetros obligatorios del director de IA.",
            save_assets: "Guardar Cambios",
            sync: "Sincronizando...",
            pro_view: "Modo Pro (JSON)",
            std_view: "Vista Estándar",
            name: "Nombre del Bot",
            strategy: "Estrategia Operativa",
            api_key: "OpenAI API Key (Mandatoria)",
            rag_prompts: "Cerebro & Datos (RAG)",
            rag_desc: "Configuración de Prompts y Bases de Conocimiento.",
            m_prompt: "Prompt ID",
            m_model: "Modelo",
            version: "Versión de Prompt",
            vs_id: "Vector Store ID",
            instr: "Instrucciones",
            instr_desc: "Contexto base del bot.",
            rules: "Reglas de Comportamiento",
            bypass: "Respuestas Directas (Bypass)",
            tools: "Herramientas (JSON Tools)",
            scenarios: "Escenarios Dinámicos",
            metadata: "Metadatos Técnicos",
            api_placeholder: "sk-...",
            flow_engine: "Motor de Flujo",
            flow_desc: "Configura pasos automáticos y respuestas guionadas.",
        },
        en: {
            bot_config: "Bot Configuration",
            basic_info: "Identity",
            basic_desc: "Mandatory AI director parameters.",
            save_assets: "Save Changes",
            sync: "Synchronizing...",
            pro_view: "Pro Mode (JSON)",
            std_view: "Standard View",
            name: "Bot Name",
            strategy: "Operational Strategy",
            api_key: "OpenAI API Key (Mandatory)",
            rag_prompts: "Brain & Data (RAG)",
            rag_desc: "Managed Prompts and Knowledge Base IDs.",
            m_prompt: "Prompt ID",
            m_model: "Model",
            version: "Prompt Version",
            vs_id: "Vector Store ID",
            instr: "Instructions",
            instr_desc: "Bot's base context.",
            rules: "Behavioral Rules",
            bypass: "Direct Responses (Bypass)",
            tools: "Tools (JSON Tools)",
            scenarios: "Dynamic Scenarios",
            metadata: "Technical Metadata",
            api_placeholder: "sk-...",
            flow_engine: "Flow Engine",
            flow_desc: "Configure automated steps and scripted responses.",
        }
    }[lang];

    const normalizedRag = normalizeRagConfig(config?.rag_config || {}, vectorStoreId);
    const rawRagConfig = (config?.rag_config && typeof config.rag_config === 'object' && !Array.isArray(config.rag_config))
        ? config.rag_config as Record<string, unknown>
        : {};
    const rawVectorStoreIds = Array.isArray(rawRagConfig.vector_store_ids)
        ? rawRagConfig.vector_store_ids.map((id) => (typeof id === 'string' ? id : ''))
        : [];
    const editorVectorStoreIds = rawVectorStoreIds.length > 0
        ? rawVectorStoreIds
        : normalizedRag.vector_store_ids;
    const ragConfig = {
        ...defaultRagConfig,
        ...(config?.rag_config || {}),
        enabled: normalizedRag.enabled,
        mode: normalizedRag.mode,
        owner: normalizedRag.owner,
        rag_owner: normalizedRag.owner,
        vector_store_ids: editorVectorStoreIds,
        strict_mode: normalizedRag.strict_mode,
        history_limit: normalizedRag.history_limit,
        wrapper: {
            ...defaultRagConfig.wrapper,
            ...(config?.rag_config?.wrapper || {}),
            ...normalizedRag.wrapper,
            cache_ttl: normalizedRag.wrapper.cache_ttl_seconds,
        },
        platform: {
            ...defaultRagConfig.platform,
            ...(config?.rag_config?.platform || {}),
            ...normalizedRag.platform,
        },
        audit: {
            ...defaultRagConfig.audit,
            ...(config?.rag_config?.audit || {}),
            ...normalizedRag.audit,
        },
    };

    const currentSnapshot = useMemo(() => JSON.stringify({
        name,
        botType,
        hasStoredApiKey,
        apiKeyDraft: apiKeyChanged ? apiKey : '',
        promptId,
        modelName,
        vectorStoreId,
        promptVersion,
        config,
        toolsJsonText,
        selectedOrgIds: [...selectedOrgIds].sort(),
    }), [
        name,
        botType,
        hasStoredApiKey,
        apiKeyChanged,
        apiKey,
        promptId,
        modelName,
        vectorStoreId,
        promptVersion,
        config,
        toolsJsonText,
        selectedOrgIds,
    ]);
    const hasUnsavedChanges = !isSaving && currentSnapshot !== initialSnapshotRef.current;
    useUnsavedChangesWarning(
        hasUnsavedChanges,
        lang === 'es'
            ? 'Tienes cambios sin guardar en este bot. Si sales ahora, los perderás. ¿Deseas continuar?'
            : 'You have unsaved changes in this bot. If you leave now, they will be lost. Continue?'
    );

    return (
        <div className={cn("space-y-6 pb-20 animate-in fade-in duration-700")}>
            <BotEditorHeader
                botId={bot.id}
                botType={botType}
                name={name}
                lang={lang}
                viewMode={viewMode}
                hasUnsavedChanges={hasUnsavedChanges}
                isSaving={isSaving}
                saveLabel={labels.save_assets}
                syncingLabel={labels.sync}
                onToggleViewMode={() => setViewMode(viewMode === 'STANDARD' ? 'PROFESSIONAL' : 'STANDARD')}
                onSave={handleSave}
            />

            {viewMode === 'STANDARD' ? (
                <div className="grid gap-7 lg:grid-cols-3">
                    <div className="space-y-6 lg:col-span-1">
                        <Card className="admin-editor-card group transition-all">
                            <CardHeader className="admin-editor-card-header bg-gradient-to-r from-slate-50 via-slate-50/90 to-white">
                                <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                                    <Key className="h-5 w-5 text-primary" /> {labels.basic_info}
                                </CardTitle>
                                <CardDescription className="admin-editor-note text-[10px] font-bold uppercase tracking-[0.18em]">{labels.basic_desc}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-5 pt-7">
                                <div className="space-y-2">
                                    <Label className="admin-editor-label flex items-center">
                                        {labels.name} <HelpTrigger field="name" />
                                    </Label>
                                    <Input
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className={getInputClassName(isNameValid, 'h-12 rounded-xl border-slate-200 bg-white text-slate-900 font-bold shadow-sm')}
                                    />
                                    {!isNameValid && <p className="text-[10px] text-red-500 font-medium">{validationMessages[lang].name}</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label className="admin-editor-label flex items-center">
                                        {labels.strategy} <HelpTrigger field="bot_type" />
                                    </Label>
                                    <select
                                        className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 shadow-sm outline-none transition-all focus:ring-2 focus:ring-primary/15 h-12"
                                        value={botType}
                                        onChange={e => setBotType(e.target.value)}
                                    >
                                        <option value="SIMULATOR">{lang === 'es' ? 'Simulador (Roleplay)' : 'Simulator (Roleplay)'}</option>
                                        <option value="EXAMINER">{lang === 'es' ? 'Examinador (Q&A / Examen)' : 'Examiner (Q&A / Exam)'}</option>
                                        <option value="DETECTOR">{lang === 'es' ? 'Detector (Análisis)' : 'Detector (Analysis)'}</option>
                                        <option value="GENERIC">{lang === 'es' ? 'Asistente genérico' : 'Generic Assistant'}</option>
                                    </select>
                                </div>
                                <div className="space-y-3">
                                    <Label className="admin-editor-label flex items-center">
                                        {labels.api_key} <HelpTrigger field="api_key" />
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
                                                : labels.api_placeholder}
                                            className={getInputClassName(isApiKeyValid, 'h-12 rounded-xl border-slate-200 bg-white pr-20 font-mono text-slate-900 shadow-sm')}
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
                                        <ShieldCheck className={`absolute right-3 top-3.5 h-5 w-5 ${isApiKeyValid ? 'text-slate-300' : 'text-red-400'}`} />
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
                                    {!isApiKeyValid && <p className="text-[10px] text-red-500 font-medium">{validationMessages[lang].apiKey}</p>}
                                </div>
                                <Label className="admin-editor-label flex items-center">
                                    {lang === 'es' ? 'Logo del Bot' : 'Bot Logo'} <HelpTrigger field="name" />
                                </Label>

                                <div className="flex items-start gap-4">
                                    <div className="shrink-0">
                                        {(bot.logo || stringValue(config.logo_url)) ? (
                                            <div className="relative group">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src={bot.logo || stringValue(config.logo_url)}
                                                    alt="Bot Logo"
                                                    className="h-20 w-20 rounded-xl border border-slate-200 bg-white p-1.5 object-contain shadow-sm"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon"
                                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                    onClick={async () => {
                                                        if (confirm(lang === 'es' ? '¿Eliminar logo?' : 'Delete logo?')) {
                                                            try {
                                                                if (bot.logo) {
                                                                    const deleteLogoResult = await import('@/app/actions/bots').then((m) => m.deleteBotLogo(bot.id));
                                                                    if (!deleteLogoResult.success) {
                                                                        toast.error(deleteLogoResult.error);
                                                                        return;
                                                                    }
                                                                    router.refresh();
                                                                }
                                                                if (config.logo_url) {
                                                                    updateConfigField('logo_url', '');
                                                                }
                                                                toast.success(lang === 'es' ? 'Logo eliminado' : 'Logo deleted');
                                                            } catch (e) {
                                                                toast.error(getErrorMessage(e));
                                                            }
                                                        }
                                                    }}
                                                >
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                                                <ImagePlus className="h-8 w-8" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 flex-1">
                                        <Input
                                            type="file"
                                            accept="image/png, image/jpeg, image/webp"
                                            className="h-10 rounded-xl border-slate-200 bg-white text-xs text-slate-600 shadow-sm file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/20"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;

                                                if (file.size > 1000000) {
                                                    toast.error(lang === 'es' ? 'El archivo es muy grande (Máx 1MB)' : 'File too large (Max 1MB)');
                                                    e.target.value = '';
                                                    return;
                                                }

                                                const formData = new FormData();
                                                formData.set('logo', file);

                                                try {
                                                    toast.loading(lang === 'es' ? 'Subiendo logo...' : 'Uploading logo...', { id: 'upload-logo' });
                                                    const uploadLogoResult = await import('@/app/actions/bots').then((m) => m.uploadBotLogo(bot.id, formData));
                                                    if (!uploadLogoResult.success) {
                                                        toast.error(uploadLogoResult.error, { id: 'upload-logo' });
                                                        return;
                                                    }
                                                    router.refresh();
                                                    toast.success(lang === 'es' ? 'Logo actualizado' : 'Logo updated', { id: 'upload-logo' });
                                                } catch (err) {
                                                    toast.error(getErrorMessage(err), { id: 'upload-logo' });
                                                }
                                                e.target.value = '';
                                            }}
                                        />
                                        <p className="text-[10px] text-slate-400">
                                            {lang === 'es'
                                                ? 'PNG, JPG, WEBP. Máximo 1MB. Se utilizará este logo en el chat.'
                                                : 'PNG, JPG, WEBP. Max 1MB. This logo will be used in the chat.'}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Label className="admin-editor-label">
                                                Legacy URL
                                            </Label>
                                            <Input
                                                value={stringValue(config.logo_url)}
                                                onChange={e => updateConfigField('logo_url', e.target.value)}
                                                placeholder="https://..."
                                                className="h-8 rounded-lg border-slate-200 bg-white text-[10px] shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3 border-t border-slate-100 pt-2">
                                    <Label className="admin-editor-label">
                                        {lang === 'es' ? 'Capacidades del Chat' : 'Chat Capabilities'}
                                    </Label>
                                    <div className="admin-editor-subpanel space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-700">
                                                    {lang === 'es' ? 'Entrada de voz (STT)' : 'Voice input (STT)'}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    {lang === 'es' ? 'Permite dictar mensajes con micrófono.' : 'Allows dictating messages with microphone.'}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={chatFeatures.allow_voice_input}
                                                onCheckedChange={(checked) => updateChatFeature('allow_voice_input', checked)}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-700">
                                                    {lang === 'es' ? 'Respuesta por voz (TTS)' : 'Voice output (TTS)'}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    {lang === 'es' ? 'Lee en voz alta las respuestas del bot.' : 'Reads assistant responses aloud.'}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={chatFeatures.allow_voice_output}
                                                onCheckedChange={(checked) => updateChatFeature('allow_voice_output', checked)}
                                            />
                                        </div>
                                        {chatFeatures.allow_voice_output && (
                                            <div className="rounded-2xl border border-slate-200 bg-white p-3 space-y-3 shadow-sm">
                                                <div className="flex items-start gap-2 bg-slate-50 p-2 rounded-md border border-slate-100">
                                                    <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-slate-500 leading-tight">
                                                        {lang === 'es'
                                                            ? 'La voz y velocidad se configuran globalmente. Activa "Usar Arquetipo" para que el estilo de voz se adapte al personaje.'
                                                            : 'Voice and speed are configured globally. Enable "Use Archetype" to adapt voice style to the character.'}
                                                    </p>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                                                        {lang === 'es' ? 'Usar Arquetipo' : 'Use Archetype'}
                                                    </Label>
                                                    <Switch
                                                        checked={chatFeatures.tts_settings.use_archetype}
                                                        onCheckedChange={(checked) => updateTtsSetting('use_archetype', checked)}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[11px] font-bold text-slate-700">
                                                    {lang === 'es' ? 'Subida de imágenes' : 'Image upload'}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    {lang === 'es' ? 'Permite adjuntar imágenes (galería o cámara). Por defecto está desactivado.' : 'Allows attaching images (gallery or camera). Disabled by default.'}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={chatFeatures.allow_image_upload}
                                                disabled={botType === 'REALTIME'}
                                                onCheckedChange={(checked) => updateChatFeature('allow_image_upload', checked)}
                                            />
                                        </div>
                                        {botType === 'REALTIME' && (
                                            <p className="text-[10px] text-slate-400">
                                                {lang === 'es'
                                                    ? 'En estrategia Realtime la carga de imágenes se desactiva automáticamente para mantener modo solo voz.'
                                                    : 'In Realtime strategy image upload is automatically disabled to keep voice-only mode.'}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="admin-editor-card transition-all">
                            <CardHeader className="admin-editor-card-header bg-gradient-to-r from-slate-50 via-slate-50/90 to-white">
                                <CardTitle className="flex items-center gap-2 text-base font-black text-slate-900">
                                    <Database className="h-5 w-5 text-primary" /> {labels.rag_prompts}
                                </CardTitle>
                                <CardDescription className="admin-editor-note text-[10px] font-bold uppercase tracking-[0.18em]">
                                    {lang === 'es'
                                        ? 'Modo simple para operar RAG sin tocar JSON.'
                                        : 'Simple mode to operate RAG without JSON.'}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-7">
                                <div className="space-y-2">
                                    <Label className="admin-editor-label flex items-center">
                                        {labels.m_prompt} <HelpTrigger field="openai_prompt_id" />
                                    </Label>
                                    <Input
                                        value={promptId}
                                        onChange={e => setPromptId(e.target.value)}
                                        placeholder="pmpt_xxxxx"
                                        className={getInputClassName(isPromptIdValid, 'h-11 rounded-xl border-slate-200 bg-white font-mono text-xs text-slate-700 shadow-sm')}
                                    />
                                    {!isPromptIdValid && <p className="text-[10px] text-red-500 font-medium">{validationMessages[lang].promptId}</p>}
                                    <p className="text-[10px] text-slate-400">
                                        {lang === 'es'
                                            ? 'Si escribes pmpt_* usa Responses API con prompt gestionado.'
                                            : 'If you set pmpt_* it uses Responses API with managed prompt.'}
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label className="admin-editor-label flex items-center">
                                        {labels.m_model}
                                        <HelpTrigger field="llm_model" />
                                    </Label>
                                    <Input
                                        value={modelName}
                                        onChange={e => setModelName(e.target.value)}
                                        placeholder="gpt-4o"
                                        className={getInputClassName(isModelValid, 'h-11 rounded-xl border-slate-200 bg-white font-mono text-xs text-slate-700 shadow-sm')}
                                    />
                                    {!isModelValid && <p className="text-[10px] text-red-500 font-medium">{validationMessages[lang].model}</p>}
                                    <p className="text-[10px] text-slate-400">
                                        {lang === 'es'
                                            ? 'Modelo para Chat Completions y fallback de Responses. Si está vacío, usa gpt-4o.'
                                            : 'Model used for Chat Completions and Responses fallback. If empty, defaults to gpt-4o.'}
                                    </p>
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="w-full h-8 text-xs text-slate-600"
                                    onClick={() => setModelAdvancedOpen((v) => !v)}
                                >
                                    {modelAdvancedOpen
                                        ? (lang === 'es' ? 'Ocultar modo avanzado' : 'Hide advanced mode')
                                        : (lang === 'es' ? 'Mostrar modo avanzado' : 'Show advanced mode')}
                                </Button>

                                {modelAdvancedOpen && (
                                    <div className="admin-editor-subpanel space-y-4">
                                        <div className="space-y-2">
                                            <Label className="admin-editor-label flex items-center">
                                                {lang === 'es' ? 'Versión del Prompt' : 'Prompt Version'} <HelpTrigger field="prompt_version" />
                                            </Label>
                                            <Input
                                                value={promptVersion}
                                                onChange={e => setPromptVersion(e.target.value)}
                                                placeholder="1"
                                                className="h-9 rounded-xl border-slate-200 bg-white font-mono text-xs text-slate-700 shadow-sm"
                                            />
                                            <p className="text-[10px] text-slate-400">
                                                {lang === 'es'
                                                    ? 'Esta versión aplica solo al Prompt ID gestionado (pmpt_*).'
                                                    : 'This version applies only to managed Prompt ID (pmpt_*).'}
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="admin-editor-label">
                                                    {lang === 'es' ? 'Text format' : 'Text format'}
                                                </Label>
                                                <select
                                                    value={modelControls.text_format}
                                                    onChange={(e) => updateModelControl('text_format', e.target.value as ModelTextFormat)}
                                                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm"
                                                >
                                                    <option value="text">text</option>
                                                    <option value="json_object">json_object</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="admin-editor-label">
                                                    {lang === 'es' ? 'Verbosity' : 'Verbosity'}
                                                </Label>
                                                <select
                                                    value={modelControls.verbosity}
                                                    onChange={(e) => updateModelControl('verbosity', e.target.value as ModelVerbosity)}
                                                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm"
                                                >
                                                    <option value="low">low</option>
                                                    <option value="medium">medium</option>
                                                    <option value="high">high</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="admin-editor-label">
                                                    {lang === 'es' ? 'Reasoning effort' : 'Reasoning effort'}
                                                </Label>
                                                <select
                                                    value={modelControls.reasoning_effort}
                                                    onChange={(e) => updateModelControl('reasoning_effort', e.target.value as ModelReasoningEffort)}
                                                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm"
                                                >
                                                    <option value="none">none</option>
                                                    <option value="minimal">minimal</option>
                                                    <option value="low">low</option>
                                                    <option value="medium">medium</option>
                                                    <option value="high">high</option>
                                                    <option value="xhigh">xhigh</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="admin-editor-label">
                                                    {lang === 'es' ? 'Summary' : 'Summary'}
                                                </Label>
                                                <select
                                                    value={modelControls.summary}
                                                    onChange={(e) => updateModelControl('summary', e.target.value as ModelSummary)}
                                                    className="w-full h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs shadow-sm"
                                                >
                                                    <option value="auto">auto</option>
                                                    <option value="concise">concise</option>
                                                    <option value="detailed">detailed</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                                            <div>
                                                <p className="admin-editor-label normal-case tracking-[0.16em]">
                                                    {lang === 'es' ? 'Store logs' : 'Store logs'}
                                                </p>
                                                <p className="text-[10px] text-slate-400">
                                                    {lang === 'es' ? 'Guardado en OpenAI para trazabilidad de respuestas.' : 'Store OpenAI response logs for traceability.'}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={modelControls.store_logs}
                                                onCheckedChange={(checked) => updateModelControl('store_logs', checked)}
                                            />
                                        </div>

                                        <p className="text-[10px] text-slate-400">
                                            {lang === 'es'
                                                ? 'Reasoning effort no aplica a modelos no razonadores (ej. familia 4o). En esos casos se ignora automáticamente.'
                                                : 'Reasoning effort does not apply to non-reasoning models (e.g., 4o family). It is ignored automatically.'}
                                        </p>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-100 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <Label className="admin-editor-label flex items-center gap-1">
                                                {lang === 'es' ? 'Modo RAG' : 'RAG Mode'}
                                                <HelpTooltip
                                                    title={lang === 'es' ? 'Modo RAG' : 'RAG mode'}
                                                    content={lang === 'es'
                                                        ? 'Nunca: no busca evidencia. Siempre: busca en cada turno. Por paso: lo decide cada step del flujo. Solo evaluación: pensado para validaciones.'
                                                        : 'Never: no retrieval. Always: retrieve each turn. By step: controlled by each flow step. Evaluation only: tuned for validation.'}
                                                />
                                            </Label>
                                            <select
                                                value={ragConfig.mode}
                                                onChange={(e) => updateRagConfig({
                                                    mode: e.target.value,
                                                    enabled: e.target.value !== 'never',
                                                })}
                                                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm"
                                            >
                                                <option value="never">{lang === 'es' ? 'Nunca' : 'Never'}</option>
                                                <option value="always">{lang === 'es' ? 'Siempre' : 'Always'}</option>
                                                <option value="by_step">{lang === 'es' ? 'Por paso' : 'By step'}</option>
                                                <option value="evaluation_only">{lang === 'es' ? 'Solo evaluación' : 'Evaluation only'}</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="admin-editor-label flex items-center gap-1">
                                                {lang === 'es' ? 'Motor' : 'Engine'}
                                                <HelpTooltip
                                                    title={lang === 'es' ? 'Motor RAG' : 'RAG engine'}
                                                    content={lang === 'es'
                                                        ? 'Wrapper te da más control (estrategia/fallback/auditoría). Platform usa file_search nativo de OpenAI.'
                                                        : 'Wrapper gives more control (strategy/fallback/audit). Platform uses native OpenAI file_search.'}
                                                />
                                            </Label>
                                            <select
                                                value={ragConfig.owner}
                                                onChange={(e) => updateRagConfig({ owner: e.target.value, rag_owner: e.target.value })}
                                                className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm"
                                            >
                                                <option value="wrapper">{lang === 'es' ? 'Wrapper (controlado)' : 'Wrapper (controlled)'}</option>
                                                <option value="platform">{lang === 'es' ? 'Platform (OpenAI)' : 'Platform (OpenAI)'}</option>
                                            </select>
                                            <p className="text-[10px] text-slate-400">
                                                {ragConfig.owner === 'wrapper'
                                                    ? (lang === 'es' ? 'Recomendado para equipos que quieren trazabilidad fina.' : 'Recommended when teams need fine-grained traceability.')
                                                    : (lang === 'es' ? 'Más simple de operar, con menos parámetros propios.' : 'Simpler to operate, with fewer custom knobs.')}
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
                                                <div key={index} className="flex items-center gap-2">
                                                    <Input
                                                        value={id}
                                                        onChange={(e) => {
                                                            const next = [...(ragConfig.vector_store_ids || [])];
                                                            next[index] = e.target.value;
                                                            updateRagConfig({ vector_store_ids: next });
                                                            if (index === 0) setVectorStoreId(e.target.value);
                                                        }}
                                                        placeholder="vs_abc123"
                                                        className={getInputClassName(validators.vectorStoreId(id), 'h-9 rounded-xl border-slate-200 bg-white font-mono text-xs text-slate-700 shadow-sm')}
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
                                                            if (index === 0) setVectorStoreId(next[0] || '');
                                                        }}
                                                    >
                                                        ×
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="admin-editor-subpanel flex items-center justify-between">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                {lang === 'es' ? 'Evidencia requerida' : 'Evidence required'}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {lang === 'es'
                                                    ? 'Sin evidencia válida responde en modo seguro.'
                                                    : 'Without valid evidence, it falls back to safe reply.'}
                                            </p>
                                        </div>
                                        <Switch
                                            checked={ragConfig.strict_mode}
                                            onCheckedChange={(checked) => updateRagConfig({ strict_mode: checked })}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => updateRagConfig({ mode: 'never', enabled: false, strict_mode: false })}
                                        >
                                            {lang === 'es' ? 'Preset: Sin RAG' : 'Preset: No RAG'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => updateRagConfig({
                                                mode: 'always',
                                                enabled: true,
                                                strict_mode: false,
                                                wrapper: { ...ragConfig.wrapper, top_k: 6, fallback: 'rewrite_retry' },
                                            })}
                                        >
                                            {lang === 'es' ? 'Preset: RAG automático' : 'Preset: RAG Auto'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => updateRagConfig({
                                                mode: 'always',
                                                enabled: true,
                                                strict_mode: true,
                                                wrapper: { ...ragConfig.wrapper, top_k: 8, fallback: 'none' },
                                            })}
                                        >
                                            {lang === 'es' ? 'Preset: Estricto' : 'Preset: Strict'}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="h-8 text-xs"
                                            onClick={() => updateRagConfig({
                                                mode: 'evaluation_only',
                                                enabled: true,
                                                strict_mode: true,
                                                wrapper: { ...ragConfig.wrapper, top_k: 8, fallback: 'rewrite_retry' },
                                            })}
                                        >
                                            {lang === 'es' ? 'Preset: Examinador' : 'Preset: Examiner'}
                                        </Button>
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
                                        <div className="admin-editor-subpanel space-y-3">
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
                                                            <p className="text-[10px] text-slate-400">
                                                                {ragConfig.wrapper.strategy === 'metadata_first'
                                                                    ? (lang === 'es' ? 'Útil cuando el etiquetado documental está bien cuidado.' : 'Best when document tagging is clean and reliable.')
                                                                    : ragConfig.wrapper.strategy === 'similarity'
                                                                        ? (lang === 'es' ? 'Útil para preguntas abiertas donde importa el significado.' : 'Best for open questions where semantic meaning matters.')
                                                                        : (lang === 'es' ? 'Combina metadatos y similitud para equilibrio general.' : 'Combines metadata and similarity for balanced behavior.')}
                                                            </p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] text-slate-500 font-bold">{lang === 'es' ? 'Fallback' : 'Fallback'}</Label>
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
                                                            <p className="text-[10px] text-slate-400">
                                                                {ragConfig.wrapper.fallback === 'rewrite_retry'
                                                                    ? (lang === 'es' ? 'Generalmente el mejor equilibrio para producción.' : 'Usually the best production default.')
                                                                    : ragConfig.wrapper.fallback === 'safe_reply'
                                                                        ? (lang === 'es' ? 'Recomendado en dominios sensibles o regulados.' : 'Recommended in sensitive or regulated domains.')
                                                                        : ragConfig.wrapper.fallback === 'secondary_store'
                                                                            ? (lang === 'es' ? 'Útil si separas knowledge bases por dominio.' : 'Useful if you split knowledge bases by domain.')
                                                                            : (lang === 'es' ? 'No aplica rescate si falla la primera búsqueda.' : 'No rescue action after first failed retrieval.')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-3">
                                                        <div className="space-y-1">
                                                            <Label className="text-[10px] text-slate-500 font-bold">Top-K</Label>
                                                            <Input
                                                                type="number"
                                                                value={ragConfig.wrapper.top_k}
                                                                onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, top_k: Number(e.target.value || 4) } })}
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
                                                                onChange={(e) => updateRagConfig({ wrapper: { ...ragConfig.wrapper, max_evidence_tokens: Number(e.target.value || 1200) } })}
                                                                className="h-9 bg-white border-slate-200 text-xs"
                                                            />
                                                        </div>
                                                    </div>
                                                    <p className="text-[10px] text-slate-400">
                                                        {lang === 'es'
                                                            ? 'Top-K alto aumenta cobertura pero puede meter ruido. Umbral alto mejora precisión. TTL alto reduce costo/latencia. Bajar máx. tokens evidencia reduce costo por turno.'
                                                            : 'Higher Top-K increases coverage but may add noise. Higher threshold improves precision. Higher TTL lowers cost/latency. Lower max evidence tokens reduces per-turn cost.'}
                                                    </p>
                                                </>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] text-slate-500 font-bold">max_num_results</Label>
                                                        <Input
                                                            type="number"
                                                            value={ragConfig.platform.max_num_results}
                                                            onChange={(e) => updateRagConfig({ platform: { ...ragConfig.platform, max_num_results: Number(e.target.value || 6) } })}
                                                            className="h-9 bg-white border-slate-200 text-xs"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] text-slate-500 font-bold">force_tool</Label>
                                                        <div className="h-9 rounded border border-slate-200 bg-white px-3 flex items-center">
                                                            <Switch
                                                                checked={Boolean(ragConfig.platform.force_tool)}
                                                                onCheckedChange={(checked) => updateRagConfig({ platform: { ...ragConfig.platform, force_tool: checked } })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-3 gap-2">
                                                <label className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(ragConfig.audit.store_queries)}
                                                        onChange={(e) => updateRagConfig({ audit: { ...ragConfig.audit, store_queries: e.target.checked } })}
                                                    />
                                                    store_queries
                                                </label>
                                                <label className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(ragConfig.audit.store_results)}
                                                        onChange={(e) => updateRagConfig({ audit: { ...ragConfig.audit, store_results: e.target.checked } })}
                                                    />
                                                    store_results
                                                </label>
                                                <label className="text-[10px] text-slate-500 flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(ragConfig.audit.store_scores)}
                                                        onChange={(e) => updateRagConfig({ audit: { ...ragConfig.audit, store_scores: e.target.checked } })}
                                                    />
                                                    store_scores
                                                </label>
                                            </div>
                                            <p className="text-[10px] text-slate-400">
                                                {lang === 'es'
                                                    ? 'Auditoría: activa trazabilidad para revisar qué se buscó, qué se encontró y cómo puntuó.'
                                                    : 'Audit: enables traceability for what was queried, retrieved, and scored.'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div >

                    < div className="lg:col-span-2 space-y-6" >
                        <Card className="admin-editor-card h-full flex flex-col transition-all">
                            <CardHeader className="admin-editor-card-header flex flex-row items-center justify-between bg-gradient-to-r from-slate-50 via-slate-50/90 to-white py-6 px-8">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
                                        <Terminal className="h-5 w-5 text-primary" /> {labels.instr} <HelpTrigger field="instructions_prefix" />
                                    </CardTitle>
                                    <CardDescription className="admin-editor-note">{labels.instr_desc}</CardDescription>
                                </div>
                            </CardHeader>
                            <CardContent className="p-0 flex-1 flex flex-col">
                                <textarea
                                    className="flex-1 min-h-[340px] w-full resize-none bg-white px-8 py-8 font-mono text-sm leading-relaxed text-slate-800 outline-none selection:bg-primary/10"
                                    value={config.instructions_prefix || ''}
                                    onChange={e => updateConfigField('instructions_prefix', e.target.value)}
                                    placeholder={lang === 'es'
                                        ? 'Definí objetivos, tono, límites, reglas y formato de respuesta del bot.'
                                        : 'Define goals, tone, limits, rules, and response format for the bot.'}
                                />
                            </CardContent>
                        </Card>
                    </div >

                    < div className="lg:col-span-3" >
                        <StrategyFields
                            botType={botType}
                            config={config}
                            onChange={setConfig}
                            lang={lang}
                        />
                    </div >

                    {
                        (botType === 'SIMULATOR' || botType === 'DETECTOR' || botType === 'EXAMINER' || botType === 'ORCHESTRATOR') && (
                            <div className="lg:col-span-3">
                                <Card className="admin-editor-card transition-all">
                                    <CardHeader className="admin-editor-card-header bg-gradient-to-r from-slate-50 via-slate-50/90 to-white py-6 px-10">
                                        <div className="flex justify-between items-center">
                                            <div>
                                                <CardTitle className="text-slate-900 font-black text-lg flex items-center gap-2">
                                                    <FileSignature className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Evaluación Automática' : 'Automated Evaluation'}
                                                </CardTitle>
                                                <CardDescription className="admin-editor-note text-[10px] uppercase font-bold tracking-[0.18em]">
                                                    {lang === 'es' ? 'Asigna un bot de evaluación de conversación a esta sesión' : 'Assign a conversation-evaluator bot to this session'}
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-10 space-y-6">
                                        <div className="space-y-4">
                                            <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] flex items-center">
                                                {lang === 'es' ? 'Examinador Responsable' : 'Responsible Examiner'}
                                            </Label>
                                            <div className="relative">
                                                <select
                                                    className="w-full bg-slate-50 border border-slate-200 h-12 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 text-sm text-slate-900 font-bold appearance-none transition-all pl-10"
                                                    value={config.evaluator_bot_id || ''}
                                                    onChange={e => updateConfigField('evaluator_bot_id', e.target.value)}
                                                >
                                                    <option value="">{lang === 'es' ? 'Sin evaluación (Solo Chat)' : 'No evaluation (Chat Only)'}</option>
                                                    {availableEvaluators?.map((ev) => (
                                                        <option key={ev.id} value={ev.id}>{ev.name} {ev.id === bot.id ? '(Este bot)' : ''}</option>
                                                    ))}
                                                </select>
                                                <FileSignature className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" />
                                            </div>
                                            {config.evaluator_bot_id && (
                                                <div className="flex items-center gap-2 mt-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                                                    <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                                                        <Check className="h-3 w-3" />
                                                    </div>
                                                    <Link href={`/admin/evaluators/${config.evaluator_bot_id}`} target="_blank" className="text-xs font-bold text-primary hover:underline">
                                                        {lang === 'es' ? 'Configurar criterios de evaluación' : 'Configure evaluation criteria'}
                                                    </Link>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )
                    }

                    <div className="lg:col-span-3">
                        <BotEditorToolsCard
                            lang={lang}
                            open={toolsSectionOpen}
                            value={toolsJsonText}
                            error={toolsJsonError}
                            helpTrigger={<HelpTrigger field="tools" />}
                            onToggle={() => setToolsSectionOpen((prev) => !prev)}
                            onChange={(value) => {
                                setToolsJsonText(value);
                                if (toolsJsonError) setToolsJsonError(null);
                            }}
                            onBlur={() => {
                                const parsedTools = parseToolsJsonForConfig(toolsJsonText);
                                if (parsedTools.error) {
                                    setToolsJsonError(getToolsErrorText(parsedTools.error));
                                    return;
                                }
                                setToolsJsonError(null);
                                setConfig((prev) => ({ ...prev, tools: parsedTools.tools }));
                                setToolsJsonText(formatToolsForEditor(parsedTools.tools));
                            }}
                        />
                        <div className="mt-6">
                            <BotEditorOrganizationsCard
                                botId={bot.id}
                                lang={lang}
                                open={openOrg}
                                selectedOrgIds={selectedOrgIds}
                                availableOrganizations={availableOrganizations.map((org) => ({
                                    id: org.id,
                                    name: org.name,
                                }))}
                                onOpenChange={setOpenOrg}
                                onToggleOrg={handleToggleOrg}
                            />
                        </div>
                        <div className="mt-6">
                            <VersionManager botId={bot.id} />
                        </div>
                    </div>
                </div >
            ) : (
                <div className="grid grid-cols-1 gap-6 pb-10">
                    <Card className="bg-[#0f172a] border-slate-700 overflow-hidden rounded-3xl shadow-2xl">
                        <CardHeader className="bg-slate-800 border-b border-slate-700 py-6 px-10 flex flex-row items-center justify-between">
                            <div className="flex items-center gap-5">
                                <div className="p-3 rounded-xl bg-slate-700 shadow-xl">
                                    <Terminal className="h-6 w-6 text-white" />
                                </div>
                                <div>
                                    <CardTitle className="text-white text-xl font-black tracking-tighter uppercase">
                                        {lang === 'es' ? 'Configuración avanzada' : 'Advanced Configuration'} <span className="text-primary font-mono ml-3 text-[10px] bg-primary/10 px-2 py-1 rounded border border-primary/30 tracking-widest">v4.0</span>
                                    </CardTitle>
                                    <CardDescription className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-1">
                                        {lang === 'es' ? 'Manifiesto de orquestación empresarial' : 'Enterprise Orchestration Manifest'}
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0 flex h-[740px]">
                            <div className="flex-1 flex flex-col border-r border-slate-700 bg-slate-900/50">
                                <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-10">
                                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Code className="h-3 w-3" /> bot_manifest.json
                                    </span>
                                    <span className="text-[9px] font-mono text-primary">ADMIN_WRITE_ACCESS</span>
                                </div>
                                {proJsonError && (
                                    <div className="px-10 py-2 bg-primary/10 border-b border-primary/30 text-primary text-xs">
                                        ⚠️ {proJsonError}
                                    </div>
                                )}
                                <textarea
                                    className="flex-1 w-full bg-transparent p-10 font-mono text-sm text-slate-200 outline-none selection:bg-primary/40 leading-relaxed overflow-y-auto custom-scroll resize-none"
                                    spellCheck={false}
                                    value={proJsonText}
                                    onChange={e => handleProJsonChange(e.target.value)}
                                />
                            </div>
                            <div className="w-80 bg-slate-800 p-10 space-y-10 hidden xl:block overflow-y-auto border-l border-slate-700">
                                <div className="space-y-4">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-3">
                                        {lang === 'es' ? 'Disparadores activos' : 'Active Triggers'}
                                    </h3>
                                    <div className="space-y-3">
                                        {Object.keys(config.bypass_logic || {}).length > 0 ? Object.keys(config.bypass_logic || {}).map((trigger, i) => (
                                            <div key={i} className="p-4 bg-slate-900/50 rounded-xl border border-slate-700 transition-all">
                                                <span className="text-[8px] text-primary font-black block mb-2 uppercase tracking-tighter">REGEXP ENGINE</span>
                                                <code className="text-xs text-white break-all font-mono">{trigger}</code>
                                            </div>
                                        )) : <p className="text-[10px] text-slate-500 italic">{lang === 'es' ? 'No se detectaron disparadores.' : 'No triggers detected.'}</p>}
                                    </div>
                                </div>
                                <div className="space-y-5 pt-4">
                                    <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-700 pb-3">
                                        {lang === 'es' ? 'Diagnóstico' : 'Diagnostics'}
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                {lang === 'es' ? 'API aplicada:' : 'Enforced API:'}
                                            </span>
                                            <span className={`text-[10px] font-black font-mono ${(hasStoredApiKey || Boolean(apiKey.trim())) ? 'text-primary' : 'text-red-400'}`}>
                                                {(hasStoredApiKey || Boolean(apiKey.trim())) ? (lang === 'es' ? 'LISTA' : 'READY') : (lang === 'es' ? 'FALTANTE' : 'MISSING')}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                {lang === 'es' ? 'Estado RAG:' : 'RAG STATUS:'}
                                            </span>
                                            <span className={`text-[10px] font-black font-mono ${vectorStoreId ? 'text-primary' : 'text-slate-600'}`}>
                                                {vectorStoreId ? (lang === 'es' ? 'ACTIVO' : 'ACTIVE') : (lang === 'es' ? 'INACTIVO' : 'IDLE')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )
            }
        </div >
    );
}
