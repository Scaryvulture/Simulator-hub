'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/providers/i18n-context';
import { getConversationDetail } from '@/app/actions/conversations';
import { runEvaluation } from '@/app/actions/evaluation';
import { logout } from '@/app/actions/auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Calendar, DollarSign, FileSignature, RefreshCcw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, usePathname } from 'next/navigation';
import { EvaluationReport } from '@/components/admin/evaluation-report';
import Image from 'next/image';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { isEvaluationResult, type ViewerEvaluationResult } from '@/lib/evaluation-result';
import { getConversationUserDisplay } from '@/lib/conversation-user-display';

type ConversationDetail = NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;

type RagTopResult = {
    file_id?: string;
    filename?: string;
    score?: number;
    excerpt?: string;
};

type RagTrace = {
    timestamp?: string;
    rag_owner?: string;
    rag_mode?: string;
    purpose?: string;
    evidence_count?: number;
    query?: string;
    strategy?: string;
    top_k?: number;
    fallback_applied?: string;
    latency_ms?: number;
    top_results?: RagTopResult[];
};

type TriggerTrace = {
    timestamp?: string;
    step_id?: string;
    trigger_index?: number;
    trigger_type?: string;
    layer?: string;
    matched?: boolean;
    candidate?: string;
    score?: number;
    distance?: number;
    max_distance?: number;
    guardrails_applied?: string[];
    model_used?: boolean;
    model_confidence?: number;
    reason?: string;
};

type EvaluationResult = ViewerEvaluationResult;

type ChatCostByModelEntry = {
    model: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    messages: number;
};

type VoiceAuditEvent = {
    channel?: string;
    model?: string;
    estimated_tokens?: number;
    cost_usd?: number;
};

type VoiceCostByModelEntry = {
    model: string;
    estimated_tokens: number;
    cost_usd: number;
    events: number;
};

type EvaluationCostEntry = {
    model: string;
    provider: 'responses' | 'chat_completions_fallback' | string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    runs: number;
};

type SessionCostAuditRow = {
    scope: 'CHAT' | 'TTS' | 'EVALUATION';
    model: string;
    provider: string | null;
    tokens_in: number;
    tokens_out: number;
    estimated_tokens: number;
    messages: number;
    events: number;
    cost_usd: number;
    updated_at: string | null;
};

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function toNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function parseChatCostByModel(value: unknown): ChatCostByModelEntry[] {
    const source = toObject(value);
    if (!source) return [];

    const rows: ChatCostByModelEntry[] = [];
    for (const [model, payload] of Object.entries(source)) {
        const entry = toObject(payload);
        if (!entry) continue;
        rows.push({
            model: model.trim() || 'unknown',
            tokens_in: toNumber(entry.tokens_in),
            tokens_out: toNumber(entry.tokens_out),
            cost_usd: toNumber(entry.cost_usd),
            messages: toNumber(entry.messages),
        });
    }

    return rows.filter((row) => row.tokens_in > 0 || row.tokens_out > 0 || row.cost_usd > 0 || row.messages > 0);
}

function parseVoiceCostByModel(voiceEvents: unknown, fallbackVoiceTotals: ConversationDetail['voice_stats']): VoiceCostByModelEntry[] {
    const rowsByModel = new Map<string, VoiceCostByModelEntry>();
    const rawEvents = Array.isArray(voiceEvents) ? voiceEvents : [];

    for (const eventValue of rawEvents) {
        const event = toObject(eventValue) as VoiceAuditEvent | null;
        if (!event) continue;
        const channel = typeof event.channel === 'string' ? event.channel : '';
        if (!channel.includes('tts')) continue;
        const model = (event.model || '').trim() || 'unknown';
        const current = rowsByModel.get(model) || { model, estimated_tokens: 0, cost_usd: 0, events: 0 };
        current.estimated_tokens += toNumber(event.estimated_tokens);
        current.cost_usd += toNumber(event.cost_usd);
        current.events += 1;
        rowsByModel.set(model, current);
    }

    const rows = Array.from(rowsByModel.values()).map((row) => ({
        ...row,
        cost_usd: Number(row.cost_usd.toFixed(6)),
    }));

    if (rows.length === 0 && fallbackVoiceTotals && fallbackVoiceTotals.total_cost_usd > 0) {
        rows.push({
            model: 'voice-mixed',
            estimated_tokens: fallbackVoiceTotals.total_estimated_tokens || 0,
            cost_usd: Number(fallbackVoiceTotals.total_cost_usd.toFixed(6)),
            events: fallbackVoiceTotals.events || 0,
        });
    }

    return rows;
}

function parseEvaluationAudit(value: unknown): EvaluationCostEntry | null {
    const source = toObject(value);
    if (!source) return null;

    const model = typeof source.model === 'string' ? source.model.trim() : '';
    const provider = source.provider === 'chat_completions_fallback' ? 'chat_completions_fallback' : 'responses';

    if (!model) return null;

    return {
        model,
        provider,
        tokens_in: toNumber(source.tokens_in),
        tokens_out: toNumber(source.tokens_out),
        cost_usd: toNumber(source.cost_usd),
        runs: 1,
    };
}

function parseSessionCostAudits(value: unknown): SessionCostAuditRow[] {
    if (!Array.isArray(value)) return [];
    const rows: SessionCostAuditRow[] = [];

    for (const item of value) {
        const source = toObject(item);
        if (!source) continue;
        const scope = source.scope;
        if (scope !== 'CHAT' && scope !== 'TTS' && scope !== 'EVALUATION') continue;
        const model = typeof source.model === 'string' ? source.model.trim() : '';
        if (!model) continue;

        rows.push({
            scope,
            model,
            provider: typeof source.provider === 'string' ? source.provider : null,
            tokens_in: toNumber(source.tokens_in),
            tokens_out: toNumber(source.tokens_out),
            estimated_tokens: toNumber(source.estimated_tokens),
            messages: toNumber(source.messages),
            events: toNumber(source.events),
            cost_usd: toNumber(source.cost_usd),
            updated_at: typeof source.updated_at === 'string' ? source.updated_at : null,
        });
    }

    return rows;
}

export default function ConversationDetailPage() {
    const { t, lang } = useLanguage();
    const params = useParams();
    const pathname = usePathname();
    const sessionId = params.sessionId as string;
    const [session, setSession] = useState<ConversationDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const data = await getConversationDetail(sessionId);
                setSession(data);
                const rawEval = data?.metadata && typeof data.metadata === 'object' && !Array.isArray(data.metadata)
                    ? (data.metadata as Record<string, unknown>).evaluation
                    : null;
                setEvaluationResult(isEvaluationResult(rawEval) ? rawEval : null);
            } catch (e: unknown) {
                console.error(getErrorMessage(e));
            } finally {
                setIsLoading(false);
            }
        };
        fetchDetail();
    }, [sessionId]);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
            month: 'long', day: 'numeric', year: 'numeric'
        }).format(new Date(dateStr));
    };

    const formatDateTime = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(new Date(dateStr));
    };

    const handleEvaluateConversation = async () => {
        if (!session) return;
        setIsEvaluating(true);
        try {
            const hadEvaluation = Boolean(evaluationResult);
            const result = await runEvaluation(session.id);
            if (!result.success) {
                toast.error(result.error);
                return;
            }
            const refreshed = await getConversationDetail(session.id);
            if (refreshed) {
                setSession(refreshed);
                const refreshedMetadata = refreshed.metadata && typeof refreshed.metadata === 'object' && !Array.isArray(refreshed.metadata)
                    ? refreshed.metadata as Record<string, unknown>
                    : {};
                const refreshedEvaluation = refreshedMetadata.evaluation;
                setEvaluationResult(isEvaluationResult(refreshedEvaluation) ? refreshedEvaluation : result.data.evaluation);
            } else {
                setEvaluationResult(result.data.evaluation);
            }
            if (result.data.reused) {
                toast.success(lang === 'es' ? 'La conversación ya estaba evaluada.' : 'This conversation had already been evaluated.');
            } else if (hadEvaluation && session.viewer_role === 'ADMIN') {
                toast.success(lang === 'es' ? 'Reevaluación completada.' : 'Re-evaluation completed.');
            } else {
                toast.success(lang === 'es' ? 'Evaluación completada.' : 'Evaluation completed.');
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setIsEvaluating(false);
        }
    };

    const handleDownloadEvaluationPdf = async () => {
        if (!sessionId || !evaluationResult) return;

        try {
            setIsDownloadingPdf(true);
            const response = await fetch(`/api/sessions/${sessionId}/evaluation-pdf?lang=${encodeURIComponent(lang)}`, {
                method: 'GET',
                credentials: 'include',
            });
            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                const fallbackError = lang === 'es' ? 'No se pudo generar el PDF.' : 'Failed to generate PDF.';
                throw new Error(typeof payload?.error === 'string' ? payload.error : fallbackError);
            }

            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition') || '';
            const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/i);
            const defaultFileName = `evaluation-${sessionId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}.pdf`;
            const fileName = fileNameMatch?.[1] || defaultFileName;

            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
            toast.success(lang === 'es' ? 'PDF descargado.' : 'PDF downloaded.');
        } catch (error: unknown) {
            console.error(error);
            toast.error(error instanceof Error ? error.message : (lang === 'es' ? 'No se pudo generar el PDF.' : 'Failed to generate PDF.'));
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    if (isLoading) {
        return <div className="text-slate-400 font-bold animate-pulse uppercase tracking-widest text-xs p-20">{t.loading}</div>;
    }

    if (!session) {
        return <div className="text-slate-400 font-bold p-20">{t.conv_empty}</div>;
    }

    const stats = session.stats;
    const metadata = session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
        ? session.metadata as Record<string, unknown>
        : {};
    const isAdminViewer = session.viewer_role === 'ADMIN';
    const dbCostRows = parseSessionCostAudits(session.cost_audits);
    const chatRowsFromDb: ChatCostByModelEntry[] = dbCostRows
        .filter((row) => row.scope === 'CHAT')
        .map((row) => ({
            model: row.model,
            tokens_in: row.tokens_in,
            tokens_out: row.tokens_out,
            cost_usd: row.cost_usd,
            messages: row.messages,
        }));
    const ttsRowsFromDb: VoiceCostByModelEntry[] = dbCostRows
        .filter((row) => row.scope === 'TTS')
        .map((row) => ({
            model: row.model,
            estimated_tokens: row.estimated_tokens,
            cost_usd: row.cost_usd,
            events: row.events,
        }));
    const evaluationRowsFromDb: EvaluationCostEntry[] = dbCostRows
        .filter((row) => row.scope === 'EVALUATION')
        .map((row) => ({
            model: row.model,
            provider: row.provider || 'responses',
            tokens_in: row.tokens_in,
            tokens_out: row.tokens_out,
            cost_usd: row.cost_usd,
            runs: row.events || 1,
        }));

    const chatCostByModelLegacy = parseChatCostByModel(metadata.chat_cost_by_model);
    const chatRows = chatRowsFromDb.length > 0
        ? chatRowsFromDb
        : chatCostByModelLegacy.length > 0
            ? chatCostByModelLegacy
            : [{
                model: 'unknown',
                tokens_in: stats.tokensIn,
                tokens_out: stats.tokensOut,
                cost_usd: stats.cost,
                messages: stats.count,
            } satisfies ChatCostByModelEntry];
    const ttsRows = ttsRowsFromDb.length > 0
        ? ttsRowsFromDb
        : parseVoiceCostByModel(metadata.voice_audit_events, session.voice_stats);
    const legacyEvaluationAudit = parseEvaluationAudit(metadata.evaluation_audit);
    const evaluationRows = evaluationRowsFromDb.length > 0
        ? evaluationRowsFromDb
        : legacyEvaluationAudit
            ? [legacyEvaluationAudit]
            : [];

    const chatTotalCost = chatRows.reduce((acc, row) => acc + row.cost_usd, 0);
    const ttsTotalCost = ttsRows.reduce((acc, row) => acc + row.cost_usd, 0);
    const evaluationCost = evaluationRows.reduce((acc, row) => acc + row.cost_usd, 0);
    const totalCost = chatTotalCost + ttsTotalCost + evaluationCost;
    const ragTraces = Array.isArray(metadata.rag_traces) ? metadata.rag_traces as RagTrace[] : [];
    const triggerTraces = Array.isArray(metadata.trigger_traces) ? metadata.trigger_traces as TriggerTrace[] : [];
    const conversationsBasePath = pathname.startsWith('/conversations') ? '/conversations' : '/admin/conversations';
    const canEvaluate = session.ended && (isAdminViewer || !evaluationResult);
    const isStandaloneConversations = pathname.startsWith('/conversations');
    const showAuditPanels = session.viewer_role === 'ADMIN';
    const userDisplay = getConversationUserDisplay(
        {
            appUsername: session.app_username,
            totaraUserId: session.totara_user_id,
        },
        'ADMIN',
        {
            anonymous: t.conv_anonymous,
            notAvailable: 'n/a',
            totaraUserIdLabel: lang === 'es' ? 'Totara User ID' : 'Totara User ID',
        }
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href={conversationsBasePath}>
                        <Button variant="ghost" size="sm" className="hover:bg-slate-100 group text-slate-600">
                            <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                            {t.conv_back}
                        </Button>
                    </Link>
                    <div className="w-px h-6 bg-slate-200" />
                    <div className="flex items-center gap-2">
                        <span className="font-black text-xl text-slate-900">{t.conv_session}</span>
                        <Badge variant="outline" className="font-mono text-[10px] text-slate-400">
                            {session.id.slice(0, 8)}
                        </Badge>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 md:gap-4 text-sm">
                    <span className="flex items-center gap-1.5 text-slate-500">
                        <User className="w-4 h-4" />
                        <span className="flex flex-col leading-tight">
                            <span>{userDisplay.primary}</span>
                            {userDisplay.secondary && (
                                <span className="text-[11px] text-slate-400">{userDisplay.secondary}</span>
                            )}
                        </span>
                    </span>
                    <span className="text-slate-300">|</span>
                    <span className="flex items-center gap-1.5 text-primary font-bold">
                        <Image src="/icons/assistant.svg" alt="Bot" width={16} height={16} className="h-4 w-4 object-contain" />
                        {session.bot?.name || (lang === 'es' ? 'Desconocido' : 'Unknown')}
                    </span>
                    <span className="text-slate-300">|</span>
                    {canEvaluate && (
                        <Button
                            size="sm"
                            variant={evaluationResult ? 'outline' : 'default'}
                            onClick={handleEvaluateConversation}
                            disabled={isEvaluating}
                            className="h-8 text-xs font-bold"
                        >
                            {isEvaluating
                                ? <RefreshCcw className="mr-2 h-3.5 w-3.5 animate-spin" />
                                : <FileSignature className="mr-2 h-3.5 w-3.5" />}
                            {isAdminViewer && evaluationResult
                                ? (lang === 'es' ? 'Reevaluar' : 'Re-evaluate')
                                : (lang === 'es' ? 'Evaluar' : 'Evaluate')}
                        </Button>
                    )}
                    {evaluationResult && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleDownloadEvaluationPdf}
                            disabled={isDownloadingPdf}
                            className="h-8 text-xs font-bold"
                        >
                            <Download className={cn("mr-2 h-3.5 w-3.5", isDownloadingPdf && "animate-pulse")} />
                            {lang === 'es' ? 'Descargar PDF' : 'Download PDF'}
                        </Button>
                    )}
                    {isStandaloneConversations && (
                        <>
                            <Link href="/">
                                <Button variant="outline" size="sm" className="h-8 text-xs font-bold glass border-white/10 hover:bg-primary/10">
                                    {lang === 'es' ? 'Selector' : 'Simulators'}
                                </Button>
                            </Link>
                            <form action={logout}>
                                <Button variant="ghost" size="sm" type="submit" className="h-8 text-xs font-bold text-slate-500 hover:text-red-600 hover:bg-red-50">
                                    {lang === 'es' ? 'Cerrar sesión' : 'Log out'}
                                </Button>
                            </form>
                            <LanguageSwitcher />
                            <ThemeToggle className="h-8 w-8 rounded-full shadow-sm" />
                        </>
                    )}
                </div>
            </div>

            <div className={cn("grid grid-cols-1 gap-6", showAuditPanels && "md:grid-cols-4")}>
                {/* Stats Sidebar */}
                {showAuditPanels && (
                    <div className="md:col-span-1 space-y-4">
                        <h3 className="font-black text-sm text-slate-700 flex items-center gap-2 uppercase tracking-widest">
                            <DollarSign className="w-4 h-4 text-green-500" />
                            {t.conv_usage}
                        </h3>

                        <Card className="bg-white shadow-sm border-slate-200 rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.conv_total_cost}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-black text-green-500">
                                    ${totalCost.toFixed(6)}
                                </div>
                                <p className="text-xs text-slate-400 mt-1">
                                    {lang === 'es'
                                        ? 'Chat + TTS + evaluación'
                                        : 'Chat + TTS + evaluation'}
                                </p>
                            </CardContent>
                        </Card>

                        <Card className="bg-white shadow-sm border-slate-200 rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                    {lang === 'es' ? 'Costo por modelo (Admin)' : 'Cost by model (Admin)'}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 text-xs">
                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        {lang === 'es' ? 'Conversación' : 'Conversation'}
                                    </p>
                                    {chatRows.map((row) => (
                                        <div key={`chat-${row.model}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-slate-700">{row.model}</span>
                                                <span className="font-mono text-slate-900">${row.cost_usd.toFixed(6)}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                {lang === 'es'
                                                    ? `in: ${row.tokens_in.toLocaleString()} · out: ${row.tokens_out.toLocaleString()}`
                                                    : `in: ${row.tokens_in.toLocaleString()} · out: ${row.tokens_out.toLocaleString()}`}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">TTS</p>
                                    {ttsRows.length > 0 ? ttsRows.map((row) => (
                                        <div key={`tts-${row.model}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-slate-700">{row.model}</span>
                                                <span className="font-mono text-slate-900">${row.cost_usd.toFixed(6)}</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                {lang === 'es'
                                                    ? `tokens est.: ${row.estimated_tokens.toLocaleString()} · eventos: ${row.events}`
                                                    : `est. tokens: ${row.estimated_tokens.toLocaleString()} · events: ${row.events}`}
                                            </p>
                                        </div>
                                    )) : (
                                        <p className="text-[11px] text-slate-400">{lang === 'es' ? 'Sin uso de TTS' : 'No TTS usage'}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                        {lang === 'es' ? 'Evaluación' : 'Evaluation'}
                                    </p>
                                    {evaluationRows.length > 0 ? (
                                        evaluationRows.map((row) => (
                                            <div key={`eval-${row.model}-${row.provider}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-mono text-slate-700">{row.model}</span>
                                                    <span className="font-mono text-slate-900">${row.cost_usd.toFixed(6)}</span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 mt-0.5">
                                                    {lang === 'es'
                                                        ? `in: ${row.tokens_in.toLocaleString()} · out: ${row.tokens_out.toLocaleString()} · corridas: ${row.runs}`
                                                        : `in: ${row.tokens_in.toLocaleString()} · out: ${row.tokens_out.toLocaleString()} · runs: ${row.runs}`}
                                                </p>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-[11px] text-slate-400">{lang === 'es' ? 'Sin auditoría de evaluación' : 'No evaluation audit yet'}</p>
                                    )}
                                </div>

                                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                                    <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                                        {lang === 'es' ? 'Total interacción' : 'Interaction total'}
                                    </span>
                                    <span className="font-mono font-black text-green-600">${totalCost.toFixed(6)}</span>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="grid grid-cols-2 gap-3">
                            <Card className="bg-white shadow-sm border-slate-200 rounded-xl">
                                <CardHeader className="pb-1 px-3 pt-3">
                                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.conv_tokens_in}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3">
                                    <div className="text-lg font-mono font-black text-slate-900">
                                        {stats.tokensIn.toLocaleString()}
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="bg-white shadow-sm border-slate-200 rounded-xl">
                                <CardHeader className="pb-1 px-3 pt-3">
                                    <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t.conv_tokens_out}</CardTitle>
                                </CardHeader>
                                <CardContent className="px-3 pb-3">
                                    <div className="text-lg font-mono font-black text-slate-900">
                                        {stats.tokensOut.toLocaleString()}
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        <Card className="bg-white shadow-sm border-slate-200 rounded-2xl">
                            <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t.conv_session_info}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">{t.conv_messages}</span>
                                    <span className="font-mono font-bold text-slate-900">{stats.count}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">{t.conv_started}</span>
                                    <span className="font-mono text-right text-slate-700 text-xs">
                                        {formatDateTime(session.created_at)}
                                    </span>
                                </div>
                                {isAdminViewer && session.voice_stats && (
                                    <div className="pt-3 border-t border-slate-100 space-y-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                            {lang === 'es' ? 'Auditoría Voz (Admin)' : 'Voice Audit (Admin)'}
                                        </p>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">{lang === 'es' ? 'Eventos' : 'Events'}</span>
                                            <span className="font-mono">{session.voice_stats.events}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">{lang === 'es' ? 'Chars' : 'Chars'}</span>
                                            <span className="font-mono">{session.voice_stats.total_chars.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">{lang === 'es' ? 'Tokens est.' : 'Est. Tokens'}</span>
                                            <span className="font-mono">{session.voice_stats.total_estimated_tokens.toLocaleString()}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-400">{lang === 'es' ? 'Costo voz' : 'Voice cost'}</span>
                                            <span className="font-mono">${session.voice_stats.total_cost_usd.toFixed(6)}</span>
                                        </div>
                                    </div>
                                )}
                                {isAdminViewer && session.metadata && (
                                    <div className="pt-3 border-t border-slate-100">
                                        <details className="text-xs text-slate-400">
                                            <summary className="cursor-pointer hover:text-slate-700">{t.conv_raw_meta}</summary>
                                            <pre className="mt-2 p-2 bg-slate-50 rounded overflow-x-auto text-slate-600">
                                                {JSON.stringify(session.metadata, null, 2)}
                                            </pre>
                                        </details>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {isAdminViewer && ragTraces.length > 0 && (
                            <Card className="bg-white shadow-sm border-slate-200 rounded-2xl">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                        {lang === 'es' ? 'Traza RAG (Admin)' : 'RAG Trace (Admin)'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 max-h-[360px] overflow-y-auto">
                                    {ragTraces.slice().reverse().map((trace, idx: number) => (
                                        <div key={`${trace.timestamp || 'ts'}-${idx}`} className="p-2 rounded-lg border border-slate-100 bg-slate-50">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                    {(trace.rag_owner || 'wrapper')} · {trace.rag_mode} · {trace.purpose}
                                                </span>
                                                <span className="text-[10px] font-mono text-slate-400">{trace.evidence_count || 0} ev</span>
                                            </div>
                                            <p className="text-[11px] text-slate-600 font-mono truncate" title={trace.query}>{trace.query}</p>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                strategy={trace.strategy} top_k={trace.top_k} fallback={trace.fallback_applied || 'none'} latency={trace.latency_ms || 0}ms
                                            </p>
                                            {Array.isArray(trace.top_results) && trace.top_results.length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {trace.top_results.slice(0, 2).map((r, i: number) => (
                                                        <div key={`${r.file_id}-${i}`} className="rounded border border-slate-200 bg-white p-1.5">
                                                            <p className="text-[10px] font-mono text-slate-600 truncate">
                                                                {r.filename || r.file_id} · {typeof r.score === 'number' ? r.score.toFixed(3) : '0.000'}
                                                            </p>
                                                            {r.excerpt && (
                                                                <p className="text-[10px] text-slate-500 line-clamp-2">{r.excerpt}</p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        {isAdminViewer && triggerTraces.length > 0 && (
                            <Card className="bg-white shadow-sm border-slate-200 rounded-2xl">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                        {lang === 'es' ? 'Traza Triggers (Admin)' : 'Trigger Trace (Admin)'}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 max-h-[360px] overflow-y-auto">
                                    {triggerTraces.slice().reverse().map((trace, idx: number) => (
                                        <div key={`${trace.timestamp || 'ts'}-${trace.step_id || 'step'}-${idx}`} className="p-2 rounded-lg border border-slate-100 bg-slate-50">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                    {trace.step_id || 'step'} · {trace.trigger_type || 'trigger'} · {trace.layer || 'none'}
                                                </span>
                                                <span className={cn(
                                                    "text-[10px] font-mono",
                                                    trace.matched ? "text-green-600" : "text-slate-400"
                                                )}>
                                                    {trace.matched ? 'match' : 'no-match'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-slate-500">
                                                {trace.reason || 'ok'}
                                            </p>
                                            {(typeof trace.score === 'number' || typeof trace.distance === 'number') && (
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    score={typeof trace.score === 'number' ? trace.score.toFixed(3) : '-'} · dist={typeof trace.distance === 'number' ? trace.distance : '-'} / {typeof trace.max_distance === 'number' ? trace.max_distance : '-'}
                                                </p>
                                            )}
                                            {Array.isArray(trace.guardrails_applied) && trace.guardrails_applied.length > 0 && (
                                                <p className="text-[10px] text-amber-600 mt-1">
                                                    guardrails: {trace.guardrails_applied.join(', ')}
                                                </p>
                                            )}
                                            {trace.model_used && (
                                                <p className="text-[10px] text-blue-600 mt-1">
                                                    model_fallback: confidence={typeof trace.model_confidence === 'number' ? trace.model_confidence.toFixed(2) : '0.00'}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        )}
                    </div>
                )}

                {/* Chat History */}
                <div className={cn("space-y-6", showAuditPanels && "md:col-span-3")}>
                    {/* Evaluation Report - NEW */}
                    {evaluationResult && (
                        <EvaluationReport result={evaluationResult} showDebugLog={isAdminViewer} sessionId={session.id} />
                    )}

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 overflow-y-auto max-h-[70vh]">
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="flex items-center justify-center mb-8">
                                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-4 py-1">
                                    <Calendar className="w-3 h-3 mr-2" />
                                    {t.conv_started_on} {formatDate(session.created_at)}
                                </Badge>
                            </div>

                            {session.messages.map((msg) => {
                                const messageImages = Array.isArray(msg.images) ? msg.images : [];
                                const renderableImages = messageImages.filter((img) => typeof img?.data_url === 'string' && img.data_url.startsWith('data:image/'));
                                const hiddenImageCount = Math.max(0, messageImages.length - renderableImages.length);

                                return (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex w-full",
                                            msg.role === 'user' || msg.role === 'system' ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        {msg.role === 'system' ? (
                                            <div className="w-full flex justify-center my-4">
                                                <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs px-3 py-2 rounded-lg font-mono max-w-lg text-center">
                                                    {lang === 'es' ? 'SISTEMA' : 'SYSTEM'}: {msg.content}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className={cn(
                                                "flex max-w-[85%] gap-3",
                                                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                                            )}>
                                                <div className={cn(
                                                    "w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm",
                                                    msg.role === 'user' ? "bg-primary/10 text-primary border border-primary/20" : "bg-slate-100 text-slate-400 border border-slate-200"
                                                )}>
                                                    {msg.role === 'user'
                                                        ? <User className="w-4 h-4" />
                                                        : <Image src="/icons/assistant.svg" alt="Assistant" width={16} height={16} className="h-4 w-4 object-contain" />}
                                                </div>
                                                <div
                                                    className={cn(
                                                        "rounded-2xl px-5 py-3 text-sm shadow-sm",
                                                        msg.role === 'user'
                                                            ? "bg-primary text-white rounded-tr-none"
                                                            : "bg-slate-50 text-slate-800 rounded-tl-none border border-slate-200"
                                                    )}
                                                >
                                                    {renderableImages.length > 0 && (
                                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                                            {renderableImages.map((img, idx) => (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img
                                                                    key={`${msg.id}-img-${idx}`}
                                                                    src={img.data_url}
                                                                    alt={lang === 'es' ? 'Adjunto de auditoría' : 'Audit attachment'}
                                                                    className="h-24 w-full object-cover rounded-lg border border-black/10"
                                                                    loading="lazy"
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                    {hiddenImageCount > 0 && (
                                                        <p className="text-[10px] opacity-75 mb-2">
                                                            {lang === 'es'
                                                                ? `${hiddenImageCount} adjunto(s) sin preview`
                                                                : `${hiddenImageCount} attachment(s) without preview`}
                                                        </p>
                                                    )}
                                                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
