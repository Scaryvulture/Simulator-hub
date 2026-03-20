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
import { ThemeToggle } from '@/components/providers/theme-toggle';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { isEvaluationResult, type ViewerEvaluationResult } from '@/lib/evaluation-result';
import { getConversationUserDisplay } from '@/lib/conversation-user-display';

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
        return <div className="text-slate-400 font-bold animate-pulse uppercase tracking-widest text-xs p-20">{t.loading}</div>;
    }

    if (!session) {
        return <div className="text-slate-400 font-bold p-20">{t.conv_empty}</div>;
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <Link href={backHref}>
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
                            <Download className={cn('mr-2 h-3.5 w-3.5', isDownloadingPdf && 'animate-pulse')} />
                            {lang === 'es' ? 'Descargar PDF' : 'Download PDF'}
                        </Button>
                    )}

                    {showStandaloneActions && (
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

            <div className="space-y-6">
                {evaluationResult && (
                    <EvaluationReport
                        result={evaluationResult}
                        showDebugLog={canViewEvaluationDebugLog}
                        sessionId={session.id}
                    />
                )}

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8 overflow-y-auto max-h-[72vh]">
                    <div className="max-w-3xl mx-auto space-y-6">
                        <div className="flex items-center justify-center mb-8">
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 px-4 py-1">
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
                </div>
            </div>
        </div>
    );
}
