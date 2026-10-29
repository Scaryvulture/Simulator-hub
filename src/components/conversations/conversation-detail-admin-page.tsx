'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/components/providers/i18n-context';
import { getConversationDetail } from '@/app/actions/conversations';
import { runEvaluation } from '@/app/actions/evaluation';
import { logout } from '@/app/actions/auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Calendar, FileSignature, RefreshCcw, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, usePathname } from 'next/navigation';
import { EvaluationReport } from '@/components/admin/evaluation-report';
import Image from 'next/image';
import { toast } from 'sonner';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { isEvaluationResult, type ViewerEvaluationResult } from '@/lib/evaluation-result';
import { getConversationUserDisplay } from '@/lib/conversation-user-display';
import { WorkspacePageHeader } from '@/components/workspace/workspace-page-header';
import { WorkspacePanel } from '@/components/workspace/workspace-panel';
import { ConversationAdminAuditPanels } from '@/components/conversations/conversation-admin-audit-panels';

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
        return <div className="workspace-empty-state animate-pulse">{t.loading}</div>;
    }

    if (!session) {
        return <div className="workspace-empty-state">{t.conv_empty}</div>;
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
            <WorkspacePageHeader
                variant="detail"
                eyebrow={lang === 'es' ? 'Detalle de sesión' : 'Session detail'}
                title={(
                    <div className="flex flex-wrap items-center gap-3">
                        <span>{t.conv_session}</span>
                        <Badge variant="outline" className="workspace-chip font-mono">
                            {session.id.slice(0, 8)}
                        </Badge>
                    </div>
                )}
                description={lang === 'es'
                    ? 'Transcript, evaluación y auditoría administrativa en una sola vista.'
                    : 'Transcript, evaluation, and admin audit in a single view.'}
                meta={(
                    <>
                        <span className="workspace-chip">
                            <User className="h-3.5 w-3.5" />
                            {userDisplay.primary}
                        </span>
                        {userDisplay.secondary ? (
                            <span className="workspace-chip workspace-chip-muted">
                                {userDisplay.secondary}
                            </span>
                        ) : null}
                        <span className="workspace-chip workspace-chip-primary">
                            <Image src="/icons/assistant.svg" alt="Bot" width={14} height={14} className="h-3.5 w-3.5 object-contain" />
                            {session.bot?.name || (lang === 'es' ? 'Desconocido' : 'Unknown')}
                        </span>
                        <span className="workspace-chip workspace-chip-muted">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(session.created_at)}
                        </span>
                    </>
                )}
                actions={(
                    <>
                        <Link href={conversationsBasePath}>
                            <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-4 font-semibold">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                {t.conv_back}
                            </Button>
                        </Link>
                        {canEvaluate && (
                            <Button
                                variant={evaluationResult ? 'outline' : 'default'}
                                onClick={handleEvaluateConversation}
                                disabled={isEvaluating}
                                className="h-11 rounded-2xl px-4 text-sm font-semibold"
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
                                variant="outline"
                                onClick={handleDownloadEvaluationPdf}
                                disabled={isDownloadingPdf}
                                className="h-11 rounded-2xl border-slate-200 bg-white px-4 text-sm font-semibold"
                            >
                                <Download className={cn("mr-2 h-3.5 w-3.5", isDownloadingPdf && "animate-pulse")} />
                                {lang === 'es' ? 'Descargar PDF' : 'Download PDF'}
                            </Button>
                        )}
                        {isStandaloneConversations ? (
                            <>
                                <Link href="/">
                                    <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-4 font-semibold">
                                        {lang === 'es' ? 'Selector' : 'Simulators'}
                                    </Button>
                                </Link>
                                <form action={logout}>
                                    <Button variant="ghost" type="submit" className="h-11 rounded-2xl px-4 font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600">
                                        {lang === 'es' ? 'Cerrar sesión' : 'Log out'}
                                    </Button>
                                </form>
                                <LanguageSwitcher />
                            </>
                        ) : null}
                    </>
                )}
            />

            <div className={cn("grid grid-cols-1 gap-6", showAuditPanels && "xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]")}>
                <div className="space-y-6">
                    {evaluationResult && (
                        <EvaluationReport result={evaluationResult} showDebugLog={isAdminViewer} sessionId={session.id} />
                    )}

                    <WorkspacePanel
                        variant="transcript"
                        title={lang === 'es' ? 'Transcript' : 'Transcript'}
                        description={lang === 'es'
                            ? 'Secuencia completa de la sesión con sus adjuntos.'
                            : 'Full session sequence with its attachments.'}
                        className="overflow-hidden"
                        bodyClassName="max-h-[70vh] overflow-y-auto p-6 md:p-8"
                    >
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="flex items-center justify-center mb-8">
                                <Badge variant="outline" className="workspace-chip workspace-chip-primary px-4 py-1">
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
                    </WorkspacePanel>
                </div>

                {showAuditPanels ? (
                    <ConversationAdminAuditPanels
                        lang={lang}
                        sessionId={session.id}
                        createdAt={session.created_at}
                        botName={session.bot?.name || (lang === 'es' ? 'Desconocido' : 'Unknown')}
                        userPrimary={userDisplay.primary}
                        userSecondary={userDisplay.secondary}
                        stats={{ count: stats.count }}
                        totalCost={totalCost}
                        chatRows={chatRows}
                        ttsRows={ttsRows}
                        evaluationRows={evaluationRows}
                        metadata={metadata}
                        ragTraces={ragTraces}
                        triggerTraces={triggerTraces}
                        voiceStats={session.voice_stats}
                        formatDateTime={formatDateTime}
                    />
                ) : null}
            </div>
        </div>
    );
}
