'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    cancelQaRun,
    createQaCase,
    createQaSuite,
    createQaTemplateSuite150,
    deleteQaCase,
    deleteQaSuite,
    getQaLabDashboard,
    getQaLabEvalsConfig,
    getQaRunDetail,
    getQaSuiteDetail,
    processQaRun,
    processQaRunToCompletion,
    startQaRun,
    updateQaCase,
    updateQaLabEvalsConfig,
    updateQaSuite,
} from '@/app/actions/qa-lab';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Activity, AlertTriangle, Copy, Download, ExternalLink, Eye, EyeOff, FlaskConical, Play, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import type { QaCaseCategory, QaJudgeMode, QaSeverity } from '@prisma/client';
import { useLanguage } from '@/components/providers/i18n-context';

type DashboardState = Awaited<ReturnType<typeof getQaLabDashboard>>;
type SuiteDetail = Awaited<ReturnType<typeof getQaSuiteDetail>>;
type RunDetail = Awaited<ReturnType<typeof getQaRunDetail>>;
type QaSummary = {
    pass_rate?: number;
    processed_cases?: number;
    total_cases?: number;
    pass_count?: number;
    fail_count?: number;
    security_findings?: number;
    total_cost_usd?: number;
    gate_reasons?: string[];
} & Record<string, unknown>;

type QaEvalSync = {
    status?: string;
    eval_id?: string;
    eval_run_id?: string;
    report_url?: string;
    synced_at?: string;
    updated_at?: string;
    error?: string;
} & Record<string, unknown>;

type QaEvalDetails = {
    deterministic_evaluation_scope?: string;
    failed_deterministic_checks?: unknown;
    last_failed_deterministic_checks?: unknown;
} & Record<string, unknown>;

type QaLabEvalsSettings = {
    enabled: boolean;
    autoCreate: boolean;
    namePrefix: string;
    evalId: string;
    apiKey: string;
    hasApiKey: boolean;
    apiKeyMasked: string;
};

type CaseEditorState = {
    name: string;
    description: string;
    category: QaCaseCategory;
    severity: QaSeverity;
    enabled: boolean;
    repeatCount: number;
    maxRetries: number;
    judgeMode: QaJudgeMode;
    judgePrompt: string;
    inputMessagesText: string;
    expectedRulesText: string;
};

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function prettyStatus(status: string) {
    return status.replace(/_/g, ' ');
}

function statusClass(status: string) {
    if (status === 'PASS' || status === 'COMPLETED' || status === 'PASSED') {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (status === 'FAIL' || status === 'FAILED' || status === 'ERROR' || status === 'CANCELLED') {
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (status === 'RUNNING' || status === 'PENDING') {
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
}

function safeSummary(summary: unknown): QaSummary {
    if (summary && typeof summary === 'object' && !Array.isArray(summary)) {
        return summary as QaSummary;
    }
    return {};
}

function safeEvalSync(evalSync: unknown): QaEvalSync | null {
    if (evalSync && typeof evalSync === 'object' && !Array.isArray(evalSync)) {
        return evalSync as QaEvalSync;
    }
    return null;
}

function safeEvalDetails(evalDetails: unknown): QaEvalDetails | null {
    if (evalDetails && typeof evalDetails === 'object' && !Array.isArray(evalDetails)) {
        return evalDetails as QaEvalDetails;
    }
    return null;
}

function extractFailedDeterministicChecks(evalDetails: unknown): string[] {
    const details = safeEvalDetails(evalDetails);
    if (!details) return [];

    const fromCurrent = Array.isArray(details.failed_deterministic_checks)
        ? details.failed_deterministic_checks
        : [];
    const fromLegacy = Array.isArray(details.last_failed_deterministic_checks)
        ? details.last_failed_deterministic_checks
        : [];

    const merged = [...fromCurrent, ...fromLegacy];
    if (merged.length === 0) return [];

    return merged
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 10);
}

export function QaLabPanel() {
    const { lang } = useLanguage();
    const t = useCallback((es: string, en: string) => (lang === 'es' ? es : en), [lang]);
    const [queryDefaults, setQueryDefaults] = useState({
        suiteId: '',
        botId: '',
        runId: '',
    });
    const [dashboard, setDashboard] = useState<DashboardState | null>(null);
    const [suiteDetail, setSuiteDetail] = useState<SuiteDetail | null>(null);
    const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
    const [selectedSuiteId, setSelectedSuiteId] = useState<string>('');
    const [selectedBotId, setSelectedBotId] = useState<string>('');
    const [selectedRunId, setSelectedRunId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isProcessingRun, setIsProcessingRun] = useState(false);
    const [activeCaseId, setActiveCaseId] = useState<string>('');
    const [pendingCaseScrollId, setPendingCaseScrollId] = useState<string | null>(null);
    const casesTableRef = useRef<HTMLDivElement | null>(null);
    const [caseEditor, setCaseEditor] = useState<CaseEditorState>({
        name: '',
        description: '',
        category: 'FUNCTIONAL',
        severity: 'MEDIUM',
        enabled: true,
        repeatCount: 1,
        maxRetries: 2,
        judgeMode: 'DETERMINISTIC',
        judgePrompt: '',
        inputMessagesText: '',
        expectedRulesText: JSON.stringify({
            required_substrings: [],
            forbidden_substrings: [],
            max_latency_ms: 12_000,
            max_response_chars: 6_000,
            security_checks: {
                detect_prompt_leak: true,
                detect_secret_leak: true,
                blocklist_patterns: [],
            },
        }, null, 2),
    });
    const [suiteEditor, setSuiteEditor] = useState({
        name: '',
        description: '',
        botTypeScope: '',
        min_pass_rate: '0.9',
        max_critical_failures: '0',
        max_security_findings: '0',
        max_avg_latency_ms: '9000',
        max_total_cost_usd: '5',
        batch_size: '20',
        concurrency: '4',
        max_retries_per_case: '2',
        deterministic_use_last_assistant_only: true,
        llm_judge_enabled: true,
        llm_judge_model: 'gpt-4o-mini',
        llm_judge_temperature: '0',
        budget_usd: '5',
        stop_on_budget_exceeded: true,
    });
    const [evalsSettings, setEvalsSettings] = useState<QaLabEvalsSettings>({
        enabled: false,
        autoCreate: true,
        namePrefix: 'QA Lab',
        evalId: '',
        apiKey: '',
        hasApiKey: false,
        apiKeyMasked: '',
    });
    const [showEvalsApiKey, setShowEvalsApiKey] = useState(false);
    const [revealedEvalsApiKey, setRevealedEvalsApiKey] = useState(false);
    const [evalsApiKeyDirty, setEvalsApiKeyDirty] = useState(false);
    const [templateCaseCount, setTemplateCaseCount] = useState(10);

    const selectedSuite = useMemo(
        () => dashboard?.suites.find((item) => item.id === selectedSuiteId) || null,
        [dashboard?.suites, selectedSuiteId],
    );

    const selectedRun = useMemo(
        () => dashboard?.runs.find((item) => item.id === selectedRunId) || null,
        [dashboard?.runs, selectedRunId],
    );

    const activeCase = useMemo(
        () => suiteDetail?.cases.find((item) => item.id === activeCaseId) || null,
        [suiteDetail?.cases, activeCaseId],
    );

    const refreshDashboard = useCallback(async () => {
        setLoadError(null);
        const [data, evalsConfig] = await Promise.all([
            getQaLabDashboard(),
            getQaLabEvalsConfig(),
        ]);
        setDashboard(data);
        setEvalsSettings({
            enabled: Boolean(evalsConfig.enabled),
            autoCreate: Boolean(evalsConfig.auto_create),
            namePrefix: evalsConfig.name_prefix || 'QA Lab',
            evalId: evalsConfig.eval_id || '',
            apiKey: '',
            hasApiKey: Boolean(evalsConfig.has_api_key),
            apiKeyMasked: evalsConfig.api_key_masked || '',
        });
        setShowEvalsApiKey(false);
        setRevealedEvalsApiKey(false);
        setEvalsApiKeyDirty(false);
        const suiteFromQuery = queryDefaults.suiteId;
        const botFromQuery = queryDefaults.botId;
        const runFromQuery = queryDefaults.runId;

        if (data.suites.length > 0) {
            setSelectedSuiteId((current) => {
                if (current) return current;
                const preferred = suiteFromQuery && data.suites.some((suite) => suite.id === suiteFromQuery)
                    ? suiteFromQuery
                    : data.suites[0].id;
                return preferred;
            });
        }
        if (data.bots.length > 0) {
            setSelectedBotId((current) => {
                if (current) return current;
                const preferred = botFromQuery && data.bots.some((bot) => bot.id === botFromQuery)
                    ? botFromQuery
                    : data.bots[0].id;
                return preferred;
            });
        }
        if (data.runs.length > 0) {
            setSelectedRunId((current) => {
                if (current) return current;
                const preferred = runFromQuery && data.runs.some((run) => run.id === runFromQuery)
                    ? runFromQuery
                    : data.runs[0].id;
                return preferred;
            });
        }
    }, [queryDefaults.suiteId, queryDefaults.botId, queryDefaults.runId]);

    const refreshSuiteDetail = useCallback(async (suiteId: string) => {
        const detail = await getQaSuiteDetail(suiteId);
        setSuiteDetail(detail);
        if (!detail) return;
        const gate = detail.gate_config;
        const run = detail.run_config;
        setSuiteEditor({
            name: detail.name || '',
            description: detail.description || '',
            botTypeScope: detail.bot_type_scope || '',
            min_pass_rate: String(gate.min_pass_rate ?? 0.9),
            max_critical_failures: String(gate.max_critical_failures ?? 0),
            max_security_findings: String(gate.max_security_findings ?? 0),
            max_avg_latency_ms: String(gate.max_avg_latency_ms ?? 9000),
            max_total_cost_usd: String(gate.max_total_cost_usd ?? 5),
            batch_size: String(run.batch_size ?? 20),
            concurrency: String(run.concurrency ?? 4),
            max_retries_per_case: String(run.max_retries_per_case ?? 2),
            deterministic_use_last_assistant_only: Boolean(run.deterministic_use_last_assistant_only ?? true),
            llm_judge_enabled: Boolean(run.llm_judge_enabled ?? true),
            llm_judge_model: String(run.llm_judge_model ?? 'gpt-4o-mini'),
            llm_judge_temperature: String(run.llm_judge_temperature ?? 0),
            budget_usd: String(run.budget_usd ?? 5),
            stop_on_budget_exceeded: Boolean(run.stop_on_budget_exceeded ?? true),
        });

        if (!activeCaseId && detail.cases.length > 0) {
            setActiveCaseId(detail.cases[0].id);
        }
    }, [activeCaseId]);

    async function refreshRunDetail(runId: string) {
        const detail = await getQaRunDetail(runId);
        setRunDetail(detail);
    }

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        setQueryDefaults({
            suiteId: params.get('suiteId') || '',
            botId: params.get('botId') || '',
            runId: params.get('runId') || '',
        });
    }, []);

    useEffect(() => {
        let mounted = true;
        setIsLoading(true);
        refreshDashboard()
            .catch((error: unknown) => {
                const message = getErrorMessage(error) || t('No se pudo cargar el panel de QA Lab', 'Failed to load QA Lab dashboard');
                setLoadError(message);
                toast.error(message);
            })
            .finally(() => {
                if (mounted) setIsLoading(false);
            });
        return () => { mounted = false; };
    }, [refreshDashboard, t]);

    async function retryDashboardLoad() {
        try {
            setIsLoading(true);
            setLoadError(null);
            await refreshDashboard();
        } catch (error: unknown) {
            const message = getErrorMessage(error) || t('No se pudo cargar el panel de QA Lab', 'Failed to load QA Lab dashboard');
            setLoadError(message);
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (!selectedSuiteId) return;
        refreshSuiteDetail(selectedSuiteId).catch((error: unknown) => {
            toast.error(getErrorMessage(error) || t('No se pudo cargar la suite', 'Failed to load suite'));
        });
    }, [selectedSuiteId, refreshSuiteDetail, t]);

    useEffect(() => {
        if (!selectedRunId) return;
        refreshRunDetail(selectedRunId).catch((error: unknown) => {
            toast.error(getErrorMessage(error) || t('No se pudo cargar la corrida', 'Failed to load run'));
        });
    }, [selectedRunId, t]);

    useEffect(() => {
        if (!activeCase) return;
        setCaseEditor({
            name: activeCase.name || '',
            description: activeCase.description || '',
            category: activeCase.category || 'FUNCTIONAL',
            severity: activeCase.severity || 'MEDIUM',
            enabled: Boolean(activeCase.enabled),
            repeatCount: activeCase.repeat_count || 1,
            maxRetries: activeCase.max_retries || 2,
            judgeMode: activeCase.judge_mode || 'DETERMINISTIC',
            judgePrompt: activeCase.judge_prompt || '',
            inputMessagesText: Array.isArray(activeCase.input_messages)
                ? activeCase.input_messages.join('\n')
                : '',
            expectedRulesText: JSON.stringify(activeCase.expected_rules || {}, null, 2),
        });
    }, [activeCaseId, activeCase]);

    useEffect(() => {
        if (!pendingCaseScrollId) return;
        const row = casesTableRef.current?.querySelector(
            `[data-qa-case-id="${pendingCaseScrollId}"]`
        ) as HTMLElement | null;
        if (!row) return;
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setPendingCaseScrollId(null);
    }, [suiteDetail?.cases, pendingCaseScrollId]);

    async function handleCreateTemplateSuite() {
        try {
            const requestedCount = Math.max(1, Math.min(templateCaseCount || 150, 1000));
            const suite = await createQaTemplateSuite150({ caseCount: requestedCount });
            toast.success(
                t(
                    `Suite plantilla de ${requestedCount} casos creada.`,
                    `Template suite with ${requestedCount} cases created.`,
                ),
            );
            await refreshDashboard();
            setSelectedSuiteId(suite.id);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo crear la suite plantilla', 'Failed to create template suite'));
        }
    }

    async function handleCreateSuite() {
        try {
            const suite = await createQaSuite({});
            toast.success(t('Suite vacía creada.', 'Empty suite created.'));
            await refreshDashboard();
            setSelectedSuiteId(suite.id);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo crear la suite', 'Failed to create suite'));
        }
    }

    async function handleSaveSuite() {
        if (!selectedSuiteId) return;
        try {
            await updateQaSuite({
                suiteId: selectedSuiteId,
                name: suiteEditor.name,
                description: suiteEditor.description,
                botTypeScope: suiteEditor.botTypeScope || null,
                gateConfig: {
                    min_pass_rate: Number(suiteEditor.min_pass_rate),
                    max_critical_failures: Number(suiteEditor.max_critical_failures),
                    max_security_findings: Number(suiteEditor.max_security_findings),
                    max_avg_latency_ms: Number(suiteEditor.max_avg_latency_ms),
                    max_total_cost_usd: Number(suiteEditor.max_total_cost_usd),
                },
                runConfig: {
                    batch_size: Number(suiteEditor.batch_size),
                    concurrency: Number(suiteEditor.concurrency),
                    max_retries_per_case: Number(suiteEditor.max_retries_per_case),
                    deterministic_use_last_assistant_only: suiteEditor.deterministic_use_last_assistant_only,
                    llm_judge_enabled: suiteEditor.llm_judge_enabled,
                    llm_judge_model: suiteEditor.llm_judge_model,
                    llm_judge_temperature: Number(suiteEditor.llm_judge_temperature),
                    budget_usd: Number(suiteEditor.budget_usd),
                    stop_on_budget_exceeded: suiteEditor.stop_on_budget_exceeded,
                },
            });
            toast.success(t('Configuración de suite guardada.', 'Suite settings saved.'));
            await refreshDashboard();
            await refreshSuiteDetail(selectedSuiteId);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo guardar la suite', 'Failed to save suite'));
        }
    }

    async function handleDeleteSuite() {
        if (!selectedSuiteId) return;
        if (!confirm(t('¿Eliminar esta suite y todas sus corridas/resultados?', 'Delete this suite and all related runs/results?'))) return;
        try {
            await deleteQaSuite(selectedSuiteId);
            toast.success(t('Suite eliminada.', 'Suite deleted.'));
            setSelectedSuiteId('');
            setSuiteDetail(null);
            setActiveCaseId('');
            await refreshDashboard();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo eliminar la suite', 'Failed to delete suite'));
        }
    }

    async function handleCreateCase() {
        if (!selectedSuiteId) return;
        try {
            const created = await createQaCase({
                suiteId: selectedSuiteId,
                name: `Case ${new Date().toLocaleTimeString()}`,
            });
            toast.success(t('Caso creado.', 'Case created.'));
            await refreshSuiteDetail(selectedSuiteId);
            setActiveCaseId(created.id);
            setPendingCaseScrollId(created.id);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo crear el caso', 'Failed to create case'));
        }
    }

    async function handleSaveCase() {
        if (!activeCaseId) return;
        try {
            let expectedRulesParsed: Record<string, unknown>;
            try {
                const parsed = JSON.parse(caseEditor.expectedRulesText);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                    toast.error(t('El JSON de reglas debe ser un objeto válido.', 'Expected rules JSON must be a valid object.'));
                    return;
                }
                expectedRulesParsed = parsed as Record<string, unknown>;
            } catch {
                toast.error(t('JSON inválido en reglas esperadas. Corrígelo antes de guardar.', 'Invalid expected rules JSON. Fix it before saving.'));
                return;
            }

            await updateQaCase({
                caseId: activeCaseId,
                name: caseEditor.name,
                description: caseEditor.description,
                category: caseEditor.category,
                severity: caseEditor.severity,
                enabled: caseEditor.enabled,
                repeatCount: Number(caseEditor.repeatCount),
                maxRetries: Number(caseEditor.maxRetries),
                judgeMode: caseEditor.judgeMode,
                judgePrompt: caseEditor.judgePrompt || null,
                inputMessages: caseEditor.inputMessagesText
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                expectedRules: expectedRulesParsed,
            });
            toast.success(t('Caso guardado.', 'Case saved.'));
            if (selectedSuiteId) await refreshSuiteDetail(selectedSuiteId);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo guardar el caso', 'Failed to save case'));
        }
    }

    async function handleDeleteCase() {
        if (!activeCaseId) return;
        if (!confirm(t('¿Eliminar este caso de prueba?', 'Delete this test case?'))) return;
        try {
            await deleteQaCase(activeCaseId);
            toast.success(t('Caso eliminado.', 'Case deleted.'));
            if (selectedSuiteId) {
                await refreshSuiteDetail(selectedSuiteId);
                setActiveCaseId('');
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo eliminar el caso', 'Failed to delete case'));
        }
    }

    async function handleToggleEvalsApiKeyVisibility() {
        if (!showEvalsApiKey && evalsSettings.hasApiKey && !revealedEvalsApiKey) {
            try {
                const response = await fetch('/api/admin/qa-lab/api-key', {
                    method: 'GET',
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-store' },
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(typeof payload?.error === 'string'
                        ? payload.error
                        : t('No se pudo revelar la API key de QA Lab.', 'Failed to reveal QA Lab API key.'));
                }
                const key = typeof payload?.api_key === 'string' ? payload.api_key : '';
                setEvalsSettings((prev) => ({
                    ...prev,
                    apiKey: key || '',
                }));
                setRevealedEvalsApiKey(true);
                setEvalsApiKeyDirty(false);
            } catch (error: unknown) {
                toast.error(getErrorMessage(error) || t('No se pudo revelar la API key de QA Lab.', 'Failed to reveal QA Lab API key.'));
                return;
            }
        }

        setShowEvalsApiKey((prev) => !prev);
    }

    async function handleCopyEvalsApiKey() {
        try {
            let key = evalsSettings.apiKey;
            if (!key && evalsSettings.hasApiKey) {
                const response = await fetch('/api/admin/qa-lab/api-key', {
                    method: 'GET',
                    cache: 'no-store',
                    headers: { 'Cache-Control': 'no-store' },
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(typeof payload?.error === 'string'
                        ? payload.error
                        : t('No se pudo copiar la API key de QA Lab.', 'Failed to copy QA Lab API key.'));
                }
                key = typeof payload?.api_key === 'string' ? payload.api_key : '';
                if (key) {
                    setEvalsSettings((prev) => ({ ...prev, apiKey: key }));
                    setShowEvalsApiKey(true);
                    setRevealedEvalsApiKey(true);
                    setEvalsApiKeyDirty(false);
                }
            }

            if (!key) {
                throw new Error(t('No hay API key para copiar.', 'No API key to copy.'));
            }

            await navigator.clipboard.writeText(key);
            toast.success(t('API key copiada.', 'API key copied.'));
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo copiar la API key de QA Lab.', 'Failed to copy QA Lab API key.'));
        }
    }

    async function handleSaveEvalsSettings() {
        try {
            const normalizedKey = evalsSettings.apiKey.trim();
            const apiKeyAction: 'keep' | 'set' | 'clear' = evalsApiKeyDirty
                ? (normalizedKey ? 'set' : 'clear')
                : 'keep';

            const updated = await updateQaLabEvalsConfig({
                enabled: evalsSettings.enabled,
                autoCreate: evalsSettings.autoCreate,
                namePrefix: evalsSettings.namePrefix,
                evalId: evalsSettings.evalId,
                apiKey: normalizedKey,
                apiKeyAction,
            });

            setEvalsSettings({
                enabled: Boolean(updated.enabled),
                autoCreate: Boolean(updated.auto_create),
                namePrefix: updated.name_prefix || 'QA Lab',
                evalId: updated.eval_id || '',
                apiKey: '',
                hasApiKey: Boolean(updated.has_api_key),
                apiKeyMasked: updated.api_key_masked || '',
            });
            setShowEvalsApiKey(false);
            setRevealedEvalsApiKey(false);
            setEvalsApiKeyDirty(false);
            toast.success(t('Configuración de OpenAI para QA guardada.', 'QA OpenAI settings saved.'));
            await refreshDashboard();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo guardar configuración de OpenAI QA.', 'Failed to save QA OpenAI settings.'));
        }
    }

    async function handleClearEvalsApiKey() {
        if (!confirm(t('¿Quitar la API key de QA Lab? El juez LLM y Evals dejarán de usarla.', 'Clear QA Lab API key? LLM judge and Evals will stop using it.'))) {
            return;
        }

        try {
            const updated = await updateQaLabEvalsConfig({
                enabled: evalsSettings.enabled,
                autoCreate: evalsSettings.autoCreate,
                namePrefix: evalsSettings.namePrefix,
                evalId: evalsSettings.evalId,
                apiKey: '',
                apiKeyAction: 'clear',
            });

            setEvalsSettings({
                enabled: Boolean(updated.enabled),
                autoCreate: Boolean(updated.auto_create),
                namePrefix: updated.name_prefix || 'QA Lab',
                evalId: updated.eval_id || '',
                apiKey: '',
                hasApiKey: Boolean(updated.has_api_key),
                apiKeyMasked: updated.api_key_masked || '',
            });
            setShowEvalsApiKey(false);
            setRevealedEvalsApiKey(false);
            setEvalsApiKeyDirty(false);
            toast.success(t('API key de OpenAI QA eliminada.', 'QA OpenAI API key cleared.'));
            await refreshDashboard();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo quitar la API key de QA Lab.', 'Failed to clear QA Lab API key.'));
        }
    }

    async function handleStartRun() {
        if (!selectedSuiteId || !selectedBotId) {
            toast.error(t('Selecciona una suite y un bot.', 'Select suite and bot.'));
            return;
        }

        const suiteCaseCount = selectedSuite?._count?.cases || 0;
        if (suiteCaseCount > 20) {
            const confirmed = confirm(
                t(
                    `Esta suite tiene ${suiteCaseCount} casos. ¿Estás seguro de iniciar la corrida?`,
                    `This suite has ${suiteCaseCount} cases. Are you sure you want to start the run?`
                )
            );
            if (!confirmed) return;
        }

        try {
            const run = await startQaRun({
                suiteId: selectedSuiteId,
                botId: selectedBotId,
            });
            toast.success(t('Corrida creada. Iniciando procesamiento por lotes.', 'Run created. Starting batch processing.'));
            await refreshDashboard();
            setSelectedRunId(run.runId);
            await handleAutoProcess(run.runId);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo iniciar la corrida', 'Failed to start run'));
        }
    }

    async function handleProcessOneBatch(runId: string) {
        try {
            const response = await processQaRun({ runId });
            await refreshDashboard();
            await refreshRunDetail(runId);
            toast.success(t(`Procesados ${response.processedNow} casos. Restantes: ${response.remaining}`, `Processed ${response.processedNow} cases. Remaining: ${response.remaining}`));
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo procesar el lote de corrida', 'Failed to process run batch'));
        }
    }

    async function handleAutoProcess(runId?: string) {
        const targetRunId = runId || selectedRunId;
        if (!targetRunId) return;
        if (isProcessingRun) return;

        try {
            setIsProcessingRun(true);
            const response = await processQaRunToCompletion({ runId: targetRunId, maxBatches: 600 });
            await refreshDashboard();
            await refreshRunDetail(targetRunId);
            if (response.exhausted_max_batches) {
                toast.error(
                    t(
                        'Auto-proceso detenido por límite de lotes. Puedes reintentar para continuar.',
                        'Auto processing stopped by batch limit. You can run it again to continue.',
                    ),
                );
            } else {
                toast.success(t('Procesamiento automático finalizado.', 'Automatic batch processing finished.'));
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('Falló el procesamiento automático', 'Auto processing failed'));
        } finally {
            setIsProcessingRun(false);
        }
    }

    async function handleCancelRun() {
        if (!selectedRunId) return;
        if (!confirm(t('¿Cancelar esta corrida? Las pruebas pendientes quedarán como omitidas.', 'Cancel this run? Pending tests will be marked skipped.'))) return;
        try {
            await cancelQaRun(selectedRunId);
            toast.success(t('Corrida cancelada.', 'Run cancelled.'));
            await refreshDashboard();
            await refreshRunDetail(selectedRunId);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error) || t('No se pudo cancelar la corrida', 'Failed to cancel run'));
        }
    }

    function exportRun(format: 'csv' | 'json') {
        if (!selectedRunId) return;
        window.open(`/api/admin/qa-runs/${selectedRunId}/export?format=${format}`, '_blank');
    }

    async function copyToClipboard(text: string, successMessage: string) {
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                toast.success(successMessage);
                return;
            }
            throw new Error('Clipboard API unavailable');
        } catch {
            toast.error(t('No se pudo copiar al portapapeles.', 'Could not copy to clipboard.'));
        }
    }

    if (isLoading) {
        return (
            <div className="p-20 text-center text-sm font-semibold text-slate-500">
                {t('Cargando QA Lab...', 'Loading QA Lab...')}
            </div>
        );
    }

    if (!dashboard) {
        return (
            <div className="space-y-6">
                <AdminPageHeader
                    variant="directory"
                    eyebrow={t('Administracion', 'Administration')}
                    title="QA Lab"
                    description={t(
                        'Suites, casos y corridas para validacion automatizada.',
                        'Suites, cases and runs for automated validation.',
                    )}
                />
                <Alert className="border-rose-200 bg-rose-50 text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">
                        {loadError || t('No se pudo cargar QA Lab. Revisa permisos de admin, conexion DB y configuracion.', 'Could not load QA Lab. Check admin permissions, DB connection, and configuration.')}
                    </span>
                </Alert>
                <Button variant="outline" className="h-11 rounded-2xl border-slate-200 px-4 font-semibold" onClick={retryDashboardLoad}>
                    <RefreshCcw className="mr-2 h-4 w-4" /> {t('Reintentar', 'Retry')}
                </Button>
            </div>
        );
    }

    const selectedRunSummary = safeSummary(selectedRun?.summary);
    const runSummary = safeSummary(runDetail?.summary);
    const activeRunDetail = (runDetail && selectedRun && runDetail.id === selectedRun.id) ? runDetail : null;
    const activeRunEvalSync = safeEvalSync(activeRunDetail?.eval_sync);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <AdminPageHeader
                variant="directory"
                eyebrow={t('Administracion', 'Administration')}
                title="QA Lab"
                description={t(
                    'Suites, casos y corridas para validacion automatizada y seguimiento de calidad.',
                    'Suites, cases and runs for automated validation and quality tracking.',
                )}
            />

            <div className="flex flex-col gap-6 lg:flex-row">
                <AdminPanel
                    variant="section"
                    className="lg:w-80"
                    title={(
                        <span className="inline-flex items-center gap-2">
                            <FlaskConical className="h-4 w-4 text-primary" />
                            QA Lab
                        </span>
                    )}
                    description={t(
                        'Crea suites, prepara casos y lanza corridas sobre el bot seleccionado.',
                        'Create suites, prepare cases and launch runs against the selected bot.',
                    )}
                    contentClassName="space-y-3"
                >
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">
                                {t('Cantidad de casos plantilla', 'Template case count')}
                            </label>
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={1000}
                                        value={templateCaseCount}
                                        onChange={(e) => setTemplateCaseCount(Math.max(1, Math.min(parseInt(e.target.value || '10', 10) || 10, 1000)))}
                                        className="h-11 rounded-2xl border-slate-200 bg-white"
                                    />
                                    <Button className="h-11 flex-1 rounded-2xl px-4 font-semibold" onClick={handleCreateTemplateSuite}>
                                        {t('Crear plantilla', 'Create template')}
                                    </Button>
                                </div>
                                {templateCaseCount > 50 && (
                                    <p className="text-xs font-medium text-amber-700">
                                        {t('Muchos casos pueden generar alto consumo.', 'Many cases may generate high usage.')}
                                    </p>
                                )}
                            </div>
                        </div>
                        <Button className="h-11 w-full rounded-2xl border-slate-200 px-4 font-semibold" variant="outline" onClick={handleCreateSuite}>
                            {t('Crear suite vacía', 'Create empty suite')}
                        </Button>
                        <div className="max-h-64 overflow-auto space-y-2 pt-2">
                            {dashboard.suites.map((suite) => (
                                <button
                                    key={suite.id}
                                    onClick={() => setSelectedSuiteId(suite.id)}
                                    className={`w-full rounded-2xl border p-3 text-left transition ${selectedSuiteId === suite.id ? 'border-primary/30 bg-primary/5' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                                >
                                    <div className="text-sm font-bold text-slate-900">{suite.name}</div>
                                    <div className="text-[11px] text-slate-500">
                                        {suite._count.cases} {t('casos', 'cases')} • {suite._count.runs} {t('corridas', 'runs')}
                                    </div>
                                </button>
                            ))}
                        </div>
                </AdminPanel>

                <div className="flex-1 space-y-6">
                    <AdminPanel
                        variant="section"
                        title={(
                            <span className="inline-flex items-center gap-2">
                                <Play className="h-4 w-4 text-primary" />
                                {t('Control de corrida', 'Run control')}
                            </span>
                        )}
                        description={t('Selecciona bot y suite para ejecutar QA automatico por lotes.', 'Select bot and suite to run automated QA in batches.')}
                        contentClassName="grid grid-cols-1 items-end gap-3 lg:grid-cols-4"
                    >
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">Bot</label>
                                <select
                                    value={selectedBotId}
                                    onChange={(e) => setSelectedBotId(e.target.value)}
                                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                                >
                                    <option value="">{t('Seleccionar bot', 'Select bot')}</option>
                                    {dashboard.bots.map((bot) => (
                                        <option key={bot.id} value={bot.id}>
                                            {bot.name} ({bot.bot_type})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">{t('Suite', 'Suite')}</label>
                                <select
                                    value={selectedSuiteId}
                                    onChange={(e) => setSelectedSuiteId(e.target.value)}
                                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm"
                                >
                                    <option value="">{t('Seleccionar suite', 'Select suite')}</option>
                                    {dashboard.suites.map((suite) => (
                                        <option key={suite.id} value={suite.id}>{suite.name}</option>
                                    ))}
                                </select>
                            </div>
                            <Button onClick={handleStartRun} className="h-11 rounded-2xl px-4 font-semibold">
                                <Play className="mr-2 h-4 w-4" /> {t('Iniciar corrida', 'Start run')}
                            </Button>
                            <Button variant="outline" className="h-11 rounded-2xl border-slate-200 px-4 font-semibold" onClick={() => refreshDashboard()}>
                                <RefreshCcw className="mr-2 h-4 w-4" /> {t('Actualizar', 'Refresh')}
                            </Button>
                    </AdminPanel>

                    <AdminPanel
                        variant="section"
                        title={(
                            <span className="inline-flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                                {t('OpenAI QA', 'OpenAI QA')}
                            </span>
                        )}
                        description={t(
                            'Clave OpenAI compartida para juez LLM y sincronizacion con Evals.',
                            'Shared OpenAI key for the LLM judge and Evals sync.',
                        )}
                        contentClassName="space-y-4"
                    >
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={evalsSettings.enabled}
                                        onChange={(e) => setEvalsSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
                                    />
                                    {t('Sincronizar corridas con OpenAI Evals', 'Sync runs to OpenAI Evals')}
                                </label>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">{t('Prefijo Evals', 'Evals Name Prefix')}</label>
                                    <Input
                                        value={evalsSettings.namePrefix}
                                        onChange={(e) => setEvalsSettings((prev) => ({ ...prev, namePrefix: e.target.value }))}
                                        placeholder="QA Lab"
                                        className="h-11 rounded-2xl border-slate-200 bg-white"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase">{t('Eval ID (opcional)', 'Eval ID (optional)')}</label>
                                    <Input
                                        value={evalsSettings.evalId}
                                        onChange={(e) => setEvalsSettings((prev) => ({ ...prev, evalId: e.target.value }))}
                                        placeholder="eval_..."
                                        className="h-11 rounded-2xl border-slate-200 bg-white"
                                    />
                                </div>
                            </div>

                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={evalsSettings.autoCreate}
                                    onChange={(e) => setEvalsSettings((prev) => ({ ...prev, autoCreate: e.target.checked }))}
                                />
                                {t('Auto-crear Eval si no existe', 'Auto-create Eval when missing')}
                            </label>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase">{t('OpenAI API Key (Juez + Evals)', 'OpenAI API Key (Judge + Evals)')}</label>
                                <div className="flex gap-2">
                                    <Input
                                        type={showEvalsApiKey ? 'text' : 'password'}
                                        value={evalsSettings.apiKey}
                                        onChange={(e) => {
                                            setEvalsSettings((prev) => ({ ...prev, apiKey: e.target.value }));
                                            setEvalsApiKeyDirty(true);
                                        }}
                                        placeholder={evalsSettings.hasApiKey ? t('Guardada (oculta)', 'Saved (hidden)') : 'sk-...'}
                                        className="h-11 rounded-2xl border-slate-200 bg-white font-mono text-sm"
                                    />
                                    <Button type="button" variant="outline" className="h-11 rounded-2xl border-slate-200 px-3" onClick={handleToggleEvalsApiKeyVisibility}>
                                        {showEvalsApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 rounded-2xl border-slate-200 px-3"
                                        onClick={handleCopyEvalsApiKey}
                                        disabled={!evalsSettings.hasApiKey}
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                                {evalsSettings.hasApiKey && !evalsSettings.apiKey && (
                                    <div className="text-[11px] text-slate-500">
                                        {t('API key actual:', 'Current API key:')} {evalsSettings.apiKeyMasked}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button className="h-11 rounded-2xl px-4 font-semibold" onClick={handleSaveEvalsSettings}>{t('Guardar OpenAI QA', 'Save OpenAI QA')}</Button>
                                <Button variant="outline" className="h-11 rounded-2xl border-slate-200 px-4 font-semibold" onClick={handleClearEvalsApiKey}>
                                    {t('Quitar API key', 'Clear API key')}
                                </Button>
                            </div>
                    </AdminPanel>

                    {selectedSuite && (
                        <AdminPanel
                            variant="section"
                            title={(
                                <span className="inline-flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    {t('Configuracion de suite', 'Suite settings')}
                                </span>
                            )}
                            description={t(`Umbrales y comportamiento de corrida para ${selectedSuite.name}.`, `Thresholds and run behavior for ${selectedSuite.name}.`)}
                            contentClassName="space-y-4"
                        >
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">{t('Nombre', 'Name')}</label>
                                        <Input
                                            value={suiteEditor.name}
                                            onChange={(e) => setSuiteEditor((prev) => ({ ...prev, name: e.target.value }))}
                                            className="h-11 rounded-2xl border-slate-200 bg-white"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">{t('Alcance por tipo de bot', 'Bot Type Scope')}</label>
                                        <Input
                                            value={suiteEditor.botTypeScope}
                                            onChange={(e) => setSuiteEditor((prev) => ({ ...prev, botTypeScope: e.target.value }))}
                                            placeholder={t('SIMULATOR / EXAMINER / etc (opcional)', 'SIMULATOR / EXAMINER / etc (optional)')}
                                            className="h-11 rounded-2xl border-slate-200 bg-white"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase">{t('Descripción', 'Description')}</label>
                                        <Input
                                            value={suiteEditor.description}
                                            onChange={(e) => setSuiteEditor((prev) => ({ ...prev, description: e.target.value }))}
                                            className="h-11 rounded-2xl border-slate-200 bg-white"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Pass rate mínimo', 'Min pass rate')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.min_pass_rate} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, min_pass_rate: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Máx. fallos críticos', 'Max critical fails')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.max_critical_failures} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, max_critical_failures: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Máx. hallazgos de seguridad', 'Max security findings')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.max_security_findings} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, max_security_findings: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Máx. latencia promedio (ms)', 'Max avg latency ms')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.max_avg_latency_ms} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, max_avg_latency_ms: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Máx. costo USD', 'Max cost USD')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.max_total_cost_usd} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, max_total_cost_usd: e.target.value }))} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Tamaño de lote', 'Batch size')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.batch_size} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, batch_size: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Concurrencia', 'Concurrency')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.concurrency} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, concurrency: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Reintentos', 'Retries')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.max_retries_per_case} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, max_retries_per_case: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Modelo juez', 'Judge model')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.llm_judge_model} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, llm_judge_model: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Temperatura juez', 'Judge temp')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.llm_judge_temperature} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, llm_judge_temperature: e.target.value }))} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-bold text-slate-500">{t('Presupuesto USD', 'Budget USD')}</label>
                                        <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={suiteEditor.budget_usd} onChange={(e) => setSuiteEditor((prev) => ({ ...prev, budget_usd: e.target.value }))} />
                                    </div>
                                </div>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={suiteEditor.deterministic_use_last_assistant_only}
                                        onChange={(e) => setSuiteEditor((prev) => ({ ...prev, deterministic_use_last_assistant_only: e.target.checked }))}
                                    />
                                    {t(
                                        'Evaluar determinístico solo sobre el último mensaje del bot',
                                        'Run deterministic checks only on the bot last message',
                                    )}
                                </label>
                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={suiteEditor.llm_judge_enabled}
                                        onChange={(e) => setSuiteEditor((prev) => ({ ...prev, llm_judge_enabled: e.target.checked }))}
                                    />
                                    {t('Habilitar juez LLM para esta suite', 'Enable LLM Judge for this suite')}
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    <Button className="h-11 rounded-2xl px-4 font-semibold" onClick={handleSaveSuite}>{t('Guardar suite', 'Save suite')}</Button>
                                    <Button variant="outline" className="h-11 rounded-2xl border-slate-200 px-4 font-semibold" onClick={handleDeleteSuite}>
                                        <Trash2 className="mr-2 h-4 w-4" /> {t('Eliminar suite', 'Delete suite')}
                                    </Button>
                                </div>
                        </AdminPanel>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <AdminPanel
                    variant="section"
                    title={t('Casos', 'Cases')}
                    description={t('Definiciones de prueba para la suite seleccionada.', 'Test definitions for the selected suite.')}
                    contentClassName="space-y-4"
                >
                        <div ref={casesTableRef} className="max-h-80 overflow-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-2 py-2 text-left">{t('Nombre', 'Name')}</th>
                                        <th className="px-2 py-2 text-left">{t('Categoría', 'Category')}</th>
                                        <th className="px-2 py-2 text-left">{t('Severidad', 'Severity')}</th>
                                        <th className="px-2 py-2 text-left">{t('Modo', 'Mode')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(suiteDetail?.cases || []).map((qaCase) => (
                                        <tr
                                            key={qaCase.id}
                                            data-qa-case-id={qaCase.id}
                                            onClick={() => setActiveCaseId(qaCase.id)}
                                            className={`border-b border-slate-100 cursor-pointer ${activeCaseId === qaCase.id ? 'bg-primary/5' : 'hover:bg-slate-50'}`}
                                        >
                                            <td className="px-2 py-2">{qaCase.name}</td>
                                            <td className="px-2 py-2">{qaCase.category}</td>
                                            <td className="px-2 py-2">{qaCase.severity}</td>
                                            <td className="px-2 py-2">{qaCase.judge_mode}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" className="rounded-xl px-3 font-semibold" onClick={handleCreateCase}>{t('Agregar caso', 'Add case')}</Button>
                            <Button size="sm" variant="outline" className="rounded-xl border-slate-200 px-3 font-semibold" onClick={() => selectedSuiteId && refreshSuiteDetail(selectedSuiteId)}>{t('Recargar', 'Reload')}</Button>
                        </div>
                        {activeCase && (
                            <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50/50 p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <Input className="h-11 rounded-2xl border-slate-200 bg-white" placeholder={t('Nombre del caso', 'Case name')} value={caseEditor.name} onChange={(e) => setCaseEditor((prev) => ({ ...prev, name: e.target.value }))} />
                                    <Input className="h-11 rounded-2xl border-slate-200 bg-white" placeholder={t('Descripción', 'Description')} value={caseEditor.description} onChange={(e) => setCaseEditor((prev) => ({ ...prev, description: e.target.value }))} />
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                    <select value={caseEditor.category} onChange={(e) => setCaseEditor((prev) => ({ ...prev, category: e.target.value as QaCaseCategory }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs">
                                        <option value="FUNCTIONAL">FUNCTIONAL</option>
                                        <option value="EDGE">EDGE</option>
                                        <option value="SECURITY">SECURITY</option>
                                        <option value="REGRESSION">REGRESSION</option>
                                    </select>
                                    <select value={caseEditor.severity} onChange={(e) => setCaseEditor((prev) => ({ ...prev, severity: e.target.value as QaSeverity }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs">
                                        <option value="LOW">LOW</option>
                                        <option value="MEDIUM">MEDIUM</option>
                                        <option value="HIGH">HIGH</option>
                                        <option value="CRITICAL">CRITICAL</option>
                                    </select>
                                    <select value={caseEditor.judgeMode} onChange={(e) => setCaseEditor((prev) => ({ ...prev, judgeMode: e.target.value as QaJudgeMode }))} className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-xs">
                                        <option value="DETERMINISTIC">DETERMINISTIC</option>
                                        <option value="LLM">LLM</option>
                                    </select>
                                    <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={String(caseEditor.repeatCount)} onChange={(e) => setCaseEditor((prev) => ({ ...prev, repeatCount: Number(e.target.value) || 1 }))} placeholder={t('cantidad de repeticiones', 'repeat count')} />
                                    <Input className="h-11 rounded-2xl border-slate-200 bg-white" value={String(caseEditor.maxRetries)} onChange={(e) => setCaseEditor((prev) => ({ ...prev, maxRetries: Number(e.target.value) || 0 }))} placeholder={t('reintentos máximos', 'max retries')} />
                                </div>
                                <Textarea
                                    className="rounded-2xl border-slate-200 bg-white px-4 py-3"
                                    value={caseEditor.judgePrompt}
                                    onChange={(e) => setCaseEditor((prev) => ({ ...prev, judgePrompt: e.target.value }))}
                                    placeholder={t('Rúbrica semántica (opcional)', 'Semantic rubric (optional)')}
                                    rows={3}
                                />
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">{t('Mensajes de entrada (uno por línea)', 'Input messages (one per line)')}</label>
                                    <Textarea
                                        className="rounded-2xl border-slate-200 bg-white px-4 py-3"
                                        value={caseEditor.inputMessagesText}
                                        onChange={(e) => setCaseEditor((prev) => ({ ...prev, inputMessagesText: e.target.value }))}
                                        rows={4}
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-bold text-slate-500">{t('Reglas esperadas (JSON)', 'Expected rules (JSON)')}</label>
                                    <Textarea
                                        value={caseEditor.expectedRulesText}
                                        onChange={(e) => setCaseEditor((prev) => ({ ...prev, expectedRulesText: e.target.value }))}
                                        rows={8}
                                        className="rounded-2xl border-slate-200 bg-white px-4 py-3 font-mono text-xs"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" className="rounded-xl px-3 font-semibold" onClick={handleSaveCase}>{t('Guardar caso', 'Save case')}</Button>
                                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 px-3 font-semibold" onClick={handleDeleteCase}>{t('Eliminar caso', 'Delete case')}</Button>
                                </div>
                            </div>
                        )}
                </AdminPanel>

                <AdminPanel
                    variant="section"
                    title={(
                        <span className="inline-flex items-center gap-2">
                            <Activity className="h-4 w-4 text-primary" />
                            {t('Corridas', 'Runs')}
                        </span>
                    )}
                    description={t('Historial, gate de calidad, procesamiento y exportacion.', 'History, quality gate, processing and export.')}
                    contentClassName="space-y-4"
                >
                        <div className="max-h-80 overflow-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-2 py-2 text-left">{t('Run', 'Run')}</th>
                                        <th className="px-2 py-2 text-left">{t('Estado', 'Status')}</th>
                                        <th className="px-2 py-2 text-left">Gate</th>
                                        <th className="px-2 py-2 text-left">{t('Pass Rate', 'Pass Rate')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {dashboard.runs.map((run) => {
                                        const summary = safeSummary(run.summary);
                                        const passRate = Number(summary.pass_rate || 0);
                                        return (
                                            <tr
                                                key={run.id}
                                                className={`border-b border-slate-100 cursor-pointer ${selectedRunId === run.id ? 'bg-primary/5' : 'hover:bg-slate-50'}`}
                                                onClick={() => setSelectedRunId(run.id)}
                                            >
                                                <td className="px-2 py-2">
                                                    <div className="font-mono">{run.id.slice(0, 8)}</div>
                                                    <div className="text-[10px] text-slate-500">{run.bot.name}</div>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <Badge variant="outline" className={statusClass(run.status)}>{prettyStatus(run.status)}</Badge>
                                                </td>
                                                <td className="px-2 py-2">
                                                    <Badge variant="outline" className={statusClass(run.gate_status)}>{prettyStatus(run.gate_status)}</Badge>
                                                </td>
                                                <td className="px-2 py-2">{(passRate * 100).toFixed(1)}%</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {selectedRun && (
                            <div className="space-y-3 rounded-[22px] border border-slate-200 bg-slate-50/50 p-4">
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 px-3 font-semibold" onClick={() => handleProcessOneBatch(selectedRun.id)}>
                                        {t('Procesar un lote', 'Process one batch')}
                                    </Button>
                                    <Button size="sm" className="rounded-xl px-3 font-semibold" onClick={() => handleAutoProcess(selectedRun.id)} disabled={isProcessingRun}>
                                        {isProcessingRun ? t('Procesando...', 'Processing...') : t('Auto procesar', 'Auto process')}
                                    </Button>
                                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 px-3 font-semibold" onClick={handleCancelRun}>
                                        {t('Cancelar corrida', 'Cancel run')}
                                    </Button>
                                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 px-3 font-semibold" onClick={() => exportRun('csv')}>
                                        <Download className="mr-2 h-3 w-3" /> CSV
                                    </Button>
                                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 px-3 font-semibold" onClick={() => exportRun('json')}>
                                        <Download className="mr-2 h-3 w-3" /> JSON
                                    </Button>
                                </div>
                                {activeRunEvalSync?.status === 'synced' && (
                                    <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className="bg-white border-emerald-300 text-emerald-700">
                                                OpenAI Evals
                                            </Badge>
                                            <span className="font-semibold">{t('Sincronizado', 'Synced')}</span>
                                            {typeof activeRunEvalSync.eval_run_id === 'string' && activeRunEvalSync.eval_run_id.trim() && (
                                                <span className="font-mono text-[11px] bg-white border border-emerald-200 rounded px-2 py-1">
                                                    {activeRunEvalSync.eval_run_id}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {typeof activeRunEvalSync.eval_run_id === 'string' && activeRunEvalSync.eval_run_id.trim() && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[11px]"
                                                    onClick={() => copyToClipboard(
                                                        activeRunEvalSync.eval_run_id as string,
                                                        t('Eval Run ID copiado.', 'Eval Run ID copied.'),
                                                    )}
                                                >
                                                    <Copy className="mr-1 h-3 w-3" /> {t('Copiar ID', 'Copy ID')}
                                                </Button>
                                            )}
                                            {typeof activeRunEvalSync.report_url === 'string' && activeRunEvalSync.report_url.trim() && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-7 text-[11px]"
                                                    onClick={() => window.open(activeRunEvalSync.report_url as string, '_blank')}
                                                >
                                                    <ExternalLink className="mr-1 h-3 w-3" /> {t('Abrir reporte', 'Open report')}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {activeRunEvalSync?.status === 'error' && (
                                    <Alert className="border-amber-200 bg-amber-50 text-amber-800">
                                        <AlertTriangle className="h-4 w-4" />
                                        <span className="text-xs">
                                            {t('Error al sincronizar con OpenAI Evals:', 'OpenAI Evals sync error:')}{' '}
                                            {typeof activeRunEvalSync.error === 'string' ? activeRunEvalSync.error : t('sin detalle', 'no details')}
                                        </span>
                                    </Alert>
                                )}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                    <div className="rounded bg-slate-50 border border-slate-200 p-2">
                                        <div className="text-slate-500">{t('Procesados', 'Processed')}</div>
                                        <div className="font-bold">{selectedRunSummary.processed_cases || 0}/{selectedRunSummary.total_cases || 0}</div>
                                    </div>
                                    <div className="rounded bg-slate-50 border border-slate-200 p-2">
                                        <div className="text-slate-500">{t('Pass / Fail', 'Pass / Fail')}</div>
                                        <div className="font-bold">{selectedRunSummary.pass_count || 0}/{selectedRunSummary.fail_count || 0}</div>
                                    </div>
                                    <div className="rounded bg-slate-50 border border-slate-200 p-2">
                                        <div className="text-slate-500">{t('Hallazgos de seguridad', 'Security Findings')}</div>
                                        <div className="font-bold">{selectedRunSummary.security_findings || 0}</div>
                                    </div>
                                    <div className="rounded bg-slate-50 border border-slate-200 p-2">
                                        <div className="text-slate-500">{t('Costo total', 'Total Cost')}</div>
                                        <div className="font-bold">${Number(selectedRunSummary.total_cost_usd || 0).toFixed(4)}</div>
                                    </div>
                                </div>
                                {selectedRun.gate_status === 'FAILED' && (
                                    <Alert className="border-rose-200 bg-rose-50 text-rose-700">
                                        <AlertTriangle className="h-4 w-4" />
                                        <span className="text-xs">{t('El gate de calidad falló. Revisá resumen y casos fallidos antes de desplegar.', 'Quality gate failed. Check the run summary and failed cases before deploy.')}</span>
                                    </Alert>
                                )}
                            </div>
                        )}
                </AdminPanel>
            </div>

            {runDetail && (
                <AdminPanel
                    variant="section"
                    title={t('Detalle de corrida', 'Run detail')}
                    description={t('Casos fallidos o con error mas relevantes para revisar rapido.', 'Most relevant failed or error cases for a quick review.')}
                    contentClassName="space-y-4"
                >
                        <div className="text-xs text-slate-500">
                            {t('Run', 'Run')} {runDetail.id} • {runDetail.bot.name} • Gate {runDetail.gate_status}
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {(runDetail.results || [])
                                .filter((result) => result.status === 'FAIL' || result.status === 'ERROR')
                                .slice(0, 12)
                                .map((result) => {
                                    const evalDetails = safeEvalDetails(result.eval_details);
                                    const failedChecks = extractFailedDeterministicChecks(result.eval_details);
                                    const deterministicScope = evalDetails?.deterministic_evaluation_scope === 'last_assistant_message'
                                        ? t('último mensaje', 'last message')
                                        : (evalDetails?.deterministic_evaluation_scope === 'all_assistant_messages'
                                            ? t('conversación completa', 'full assistant conversation')
                                            : null);

                                    return (
                                        <div key={result.id} className="rounded border border-slate-200 p-3 bg-slate-50">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="text-sm font-bold text-slate-900">{result.case.name}</div>
                                                <Badge variant="outline" className={statusClass(result.status)}>{result.status}</Badge>
                                            </div>
                                            <div className="text-xs text-slate-500 mt-1">
                                                {result.case.category} • {result.case.severity} • score {Number(result.score || 0).toFixed(2)}
                                            </div>
                                            {result.error_message && (
                                                <div className="text-xs text-rose-700 mt-2">{result.error_message}</div>
                                            )}
                                            {Array.isArray(result.security_findings) && result.security_findings.length > 0 && (
                                                <div className="text-xs text-amber-700 mt-2">
                                                    {result.security_findings.length} {t('hallazgo(s) de seguridad', 'security finding(s)')}
                                                </div>
                                            )}
                                            {failedChecks.length > 0 && (
                                                <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800 space-y-1">
                                                    <div className="font-semibold">
                                                        {t('Checks determinísticos fallidos', 'Failed deterministic checks')}
                                                        {deterministicScope ? ` (${deterministicScope})` : ''}
                                                    </div>
                                                    {failedChecks.map((item, idx) => (
                                                        <div key={`${result.id}-failed-check-${idx}`}>• {item}</div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="text-xs text-slate-700 mt-2 line-clamp-4">{result.response_excerpt || t('(Sin extracto)', '(No excerpt)')}</div>
                                        </div>
                                    );
                                })}
                        </div>
                        {runSummary.gate_reasons && Array.isArray(runSummary.gate_reasons) && runSummary.gate_reasons.length > 0 && (
                            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                                <div className="font-bold">{t('Motivos del gate:', 'Gate reasons:')}</div>
                                {(runSummary.gate_reasons as string[]).map((reason, idx) => (
                                    <div key={`${reason}-${idx}`}>- {reason}</div>
                                ))}
                            </div>
                        )}
                </AdminPanel>
            )}
        </div>
    );
}
