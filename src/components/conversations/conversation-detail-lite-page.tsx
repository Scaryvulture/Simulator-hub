'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Calendar, FileSignature, RefreshCcw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { getConversationDetail } from '@/app/actions/conversations';
import { runEvaluation } from '@/app/actions/evaluation';
import { logout } from '@/app/actions/auth';
import { useLanguage } from '@/components/providers/i18n-context';
import { EvaluationReport } from '@/components/admin/evaluation-report';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { isEvaluationResult, type ViewerEvaluationResult } from '@/lib/evaluation-result';
import { getConversationUserDisplay } from '@/lib/conversation-user-display';
import { WorkspacePageHeader } from '@/components/workspace/workspace-page-header';
import { WorkspacePanel } from '@/components/workspace/workspace-panel';

type ConversationDetail = NonNullable<Awaited<ReturnType<typeof getConversationDetail>>>;
type EvaluationResult = ViewerEvaluationResult;

interface Props {
    sessionId: string;
    backHref: string;
    showStandaloneActions: boolean;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function formatDateTime(value: string | null, lang: 'es' | 'en'): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatDate(value: string | null, lang: 'es' | 'en'): string {
    if (!value) return '-';
    return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(value));
}

export default function ConversationDetailLitePage({ sessionId, backHref, showStandaloneActions }: Props) {
    const { t, lang } = useLanguage();
    const [session, setSession] = useState<ConversationDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEvaluating, setIsEvaluating] = useState(false);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [evaluationResult, setEvaluationResult] = useState<EvaluationResult | null>(null);

    useEffect(() => {
        let mounted = true;

        const loadConversation = async () => {
            setIsLoading(true);
            try {
                const detail = await getConversationDetail(sessionId);
                if (!mounted) return;
                setSession(detail);

                const metadata = detail?.metadata && typeof detail.metadata === 'object' && !Array.isArray(detail.metadata)
                    ? detail.metadata as Record<string, unknown>
                    : {};
                const rawEvaluation = metadata.evaluation;
                setEvaluationResult(isEvaluationResult(rawEvaluation) ? rawEvaluation : null);
            } catch (error: unknown) {
                if (!mounted) return;
                toast.error(getErrorMessage(error));
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        loadConversation();
        return () => {
            mounted = false;
        };
    }, [sessionId]);

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
                const metadata = refreshed.metadata && typeof refreshed.metadata === 'object' && !Array.isArray(refreshed.metadata)
                    ? refreshed.metadata as Record<string, unknown>
                    : {};
                const refreshedEvaluation = metadata.evaluation;
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

    const isAdminViewer = session.viewer_role === 'ADMIN';
    const canEvaluate = session.ended && (isAdminViewer || !evaluationResult);
    const canViewEvaluationDebugLog = session.viewer_role === 'ADMIN';
    const userDisplay = getConversationUserDisplay(
        {
            appUsername: session.app_username,
            totaraUserId: session.totara_user_id,
        },
        session.viewer_role,
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
                    ? 'Resumen de la práctica y transcript de mensajes sin exponer paneles técnicos de administración.'
                    : 'Practice summary and transcript without exposing technical admin panels.'}
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
                            {formatDate(session.created_at, lang)}
                        </span>
                    </>
                )}
                actions={(
                    <>
                        <Link href={backHref}>
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
                                <Download className={cn('mr-2 h-3.5 w-3.5', isDownloadingPdf && 'animate-pulse')} />
                                {lang === 'es' ? 'Descargar PDF' : 'Download PDF'}
                            </Button>
                        )}
                        {showStandaloneActions ? (
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

            <div className="space-y-6">
                {evaluationResult && (
                    <EvaluationReport
                        result={evaluationResult}
                        showDebugLog={canViewEvaluationDebugLog}
                        sessionId={session.id}
                    />
                )}

                <WorkspacePanel
                    variant="transcript"
                    title={lang === 'es' ? 'Transcript' : 'Transcript'}
                    description={lang === 'es'
                        ? 'Secuencia completa de mensajes de la sesión.'
                        : 'Full message sequence for this session.'}
                    className="overflow-hidden"
                    bodyClassName="max-h-[72vh] overflow-y-auto p-6 md:p-8"
                >
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div className="flex items-center justify-center mb-8">
                            <Badge variant="outline" className="workspace-chip workspace-chip-primary px-4 py-1">
                                <Calendar className="w-3 h-3 mr-2" />
                                {t.conv_started_on} {formatDate(session.created_at, lang)}
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
                                        'flex w-full',
                                        msg.role === 'user' || msg.role === 'system' ? 'justify-end' : 'justify-start'
                                    )}
                                >
                                    {msg.role === 'system' ? (
                                        <div className="w-full flex justify-center my-3">
                                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs px-3 py-2 rounded-lg font-mono max-w-lg text-center">
                                                {lang === 'es' ? 'SISTEMA' : 'SYSTEM'}: {msg.content}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className={cn('flex max-w-[90%] gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                                            <div className={cn(
                                                'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-1 shadow-sm',
                                                msg.role === 'user' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-slate-100 text-slate-400 border border-slate-200'
                                            )}>
                                                {msg.role === 'user'
                                                    ? <User className="w-4 h-4" />
                                                    : <Image src="/icons/assistant.svg" alt="Assistant" width={16} height={16} className="h-4 w-4 object-contain" />}
                                            </div>
                                            <div
                                                className={cn(
                                                    'rounded-2xl px-5 py-3 text-sm shadow-sm',
                                                    msg.role === 'user'
                                                        ? 'bg-primary text-white rounded-tr-none'
                                                        : 'bg-slate-50 text-slate-800 rounded-tl-none border border-slate-200'
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
                                                <p className="text-[10px] opacity-60 mt-2 text-right">
                                                    {formatDateTime(msg.created_at, lang)}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </WorkspacePanel>
            </div>
        </div>
    );
}
