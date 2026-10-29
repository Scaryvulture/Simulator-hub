'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLanguage } from '@/components/providers/i18n-context';
import { getConversations } from '@/app/actions/conversations';
import { logout } from '@/app/actions/auth';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User, ArrowRight, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { getConversationUserDisplay } from '@/lib/conversation-user-display';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePathname } from 'next/navigation';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { WorkspacePageHeader } from '@/components/workspace/workspace-page-header';
import { WorkspacePanel } from '@/components/workspace/workspace-panel';

type ConversationsData = Awaited<ReturnType<typeof getConversations>>;
type ConversationSession = ConversationsData['sessions'][number];
type ConversationBotOption = ConversationsData['bots'][number];

type EvaluationSnapshot = {
    percentage: number;
    score: number;
    max_score: number;
};

function parseEvaluationSnapshot(value: unknown): EvaluationSnapshot | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const source = value as Record<string, unknown>;
    if (typeof source.percentage !== 'number' || typeof source.score !== 'number' || typeof source.max_score !== 'number') {
        return null;
    }
    return {
        percentage: source.percentage,
        score: source.score,
        max_score: source.max_score,
    };
}

export default function ConversationsPage() {
    const { t, lang } = useLanguage();
    const pathname = usePathname();
    const [sessions, setSessions] = useState<ConversationSession[]>([]);
    const [bots, setBots] = useState<ConversationBotOption[]>([]);
    const [viewerRole, setViewerRole] = useState<'ADMIN' | 'ORG_ADMIN' | 'USER'>('ADMIN');
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [exportDialogOpen, setExportDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [botId, setBotId] = useState('all');

    const filtersRef = useRef({
        from: '',
        to: '',
        userSearch: '',
        botId: 'all',
    });
    const conversationsBasePath = pathname.startsWith('/conversations') ? '/conversations' : '/admin/conversations';
    const isStandaloneConversations = pathname.startsWith('/conversations');
    const isUserViewer = viewerRole === 'USER';

    const fetchData = useCallback(async (p: number = 1) => {
        setIsLoading(true);
        const currentFilters = filtersRef.current;
        try {
            const data = await getConversations({
                page: p,
                from: currentFilters.from || undefined,
                to: currentFilters.to || undefined,
                user: currentFilters.userSearch || undefined,
                botId: currentFilters.botId !== 'all' ? currentFilters.botId : undefined,
            });
            setSessions(data.sessions);
            setBots(data.bots);
            if (data.viewer_role === 'ADMIN' || data.viewer_role === 'ORG_ADMIN' || data.viewer_role === 'USER') {
                setViewerRole(data.viewer_role);
            }
            setTotalPages(data.totalPages);
            setTotalCount(data.totalCount);
            setPage(data.page);
        } catch (e: unknown) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(1); }, [fetchData]);

    const handleFilter = (e: React.FormEvent) => {
        e.preventDefault();
        filtersRef.current = { from, to, userSearch, botId };
        fetchData(1);
    };

    const handleExport = async () => {
        try {
            setIsExporting(true);
            const activeFilters = filtersRef.current;

            const hasFilter =
                !!activeFilters.from ||
                !!activeFilters.to ||
                !!activeFilters.userSearch ||
                (activeFilters.botId !== 'all' && !!activeFilters.botId);

            if (!hasFilter) {
                toast.error(lang === 'es'
                    ? 'Debes aplicar al menos un filtro (Fecha, Usuario o Bot) para exportar.'
                    : 'You must apply at least one filter (Date, User or Bot) to export.');
                setIsExporting(false);
                setExportDialogOpen(false);
                return;
            }

            const params = new URLSearchParams();
            if (activeFilters.from) params.set('from', activeFilters.from);
            if (activeFilters.to) params.set('to', activeFilters.to);
            if (activeFilters.userSearch) params.set('user', activeFilters.userSearch);
            if (activeFilters.botId !== 'all') params.set('botId', activeFilters.botId);

            const response = await fetch(`/api/admin/conversations/export?${params.toString()}`, {
                method: 'GET',
                credentials: 'include',
            });

            if (!response.ok) {
                const fallbackError = lang === 'es' ? 'Falló la exportación.' : 'Export failed.';
                const payload = await response.json().catch(() => ({ error: fallbackError }));
                throw new Error(payload.error || fallbackError);
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="([^"]+)"/i);
            const fileName = match?.[1] || `practices-export-${Date.now()}.xlsx`;

            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = objectUrl;
            anchor.download = fileName;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);

            toast.success(lang === 'es' ? 'Exportación completada' : 'Export completed');
        } catch (error: unknown) {
            const fallbackMessage = lang === 'es' ? 'Falló la exportación.' : 'Export failed.';
            const rawMessage = error instanceof Error ? error.message : fallbackMessage;
            const message = rawMessage === 'Export failed.' ? fallbackMessage : rawMessage;
            toast.error(message);
        } finally {
            setIsExporting(false);
            setExportDialogOpen(false);
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        }).format(new Date(dateStr));
    };

    const formatTime = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Intl.DateTimeFormat(lang === 'es' ? 'es-AR' : 'en-US', {
            hour: '2-digit', minute: '2-digit', hour12: false
        }).format(new Date(dateStr));
    };

    if (isLoading && sessions.length === 0) {
        return <div className="workspace-empty-state animate-pulse">{t.loading}</div>;
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            <WorkspacePageHeader
                variant="operations"
                eyebrow={isUserViewer
                    ? (lang === 'es' ? 'Historial' : 'History')
                    : (lang === 'es' ? 'Seguimiento de sesiones' : 'Session tracking')}
                title={t.conv_title}
                description={t.conv_desc}
                meta={(
                    <>
                        <span className="workspace-chip workspace-chip-muted">
                            {totalCount} {t.conv_messages.toLowerCase()}
                        </span>
                        <span className={`workspace-chip ${viewerRole === 'USER' ? 'workspace-chip-muted' : 'workspace-chip-primary'}`}>
                            {viewerRole}
                        </span>
                    </>
                )}
                actions={(
                    <>
                        {!isUserViewer && (
                            <Button
                                variant="outline"
                                className="h-11 rounded-2xl border-slate-200 bg-white px-4 font-semibold"
                                onClick={() => setExportDialogOpen(true)}
                                disabled={isExporting || isLoading}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                {lang === 'es' ? 'Exportar XLSX' : 'Export XLSX'}
                            </Button>
                        )}
                        {isStandaloneConversations ? (
                            <>
                                <Link href="/">
                                    <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-4 font-semibold">
                                        {lang === 'es' ? 'Volver al selector' : 'Back to simulators'}
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

            <WorkspacePanel
                variant="operations"
                title={lang === 'es' ? 'Filtros' : 'Filters'}
                description={lang === 'es'
                    ? 'Fecha, bot y usuario para acotar el seguimiento.'
                    : 'Date, bot, and user filters for review.'}
            >
                <form onSubmit={handleFilter} className={`grid grid-cols-1 ${isUserViewer ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4`}>
                    <div className="space-y-2">
                        <label className="workspace-eyebrow">{t.conv_filter_date}</label>
                        <div className="flex gap-2">
                            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border-slate-200" />
                            <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="border-slate-200" />
                        </div>
                    </div>
                    {!isUserViewer && (
                        <div className="space-y-2">
                            <label className="workspace-eyebrow">{t.conv_filter_user}</label>
                            <div className="relative">
                                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    value={userSearch}
                                    onChange={e => setUserSearch(e.target.value)}
                                    placeholder={viewerRole === 'ADMIN'
                                        ? (lang === 'es' ? 'Usuario app o Totara User ID...' : 'App username or Totara User ID...')
                                        : (lang === 'es' ? 'Totara User ID...' : 'Totara User ID...')}
                                    className="pl-9 border-slate-200"
                                />
                            </div>
                        </div>
                    )}
                    <div className="space-y-2">
                        <label className="workspace-eyebrow">{t.conv_filter_bot}</label>
                        <select
                            value={botId}
                            onChange={e => setBotId(e.target.value)}
                            className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="all">{t.conv_filter_all}</option>
                            {bots.map((b) => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <Button type="submit" className="h-10 w-full rounded-2xl font-semibold" disabled={isLoading}>
                            <Search className="mr-2 h-4 w-4" /> {t.conv_filter_btn}
                        </Button>
                    </div>
                </form>
            </WorkspacePanel>

            <WorkspacePanel
                variant="detail"
                title={lang === 'es' ? 'Sesiones' : 'Sessions'}
                description={lang === 'es'
                    ? 'Listado operativo con acceso directo al detalle.'
                    : 'Operational list with direct access to detail.'}
                bodyClassName="p-0"
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                            <tr>
                                <th className="px-6 py-4 font-bold tracking-widest">{t.conv_col_date}</th>
                                <th className="px-6 py-4 font-bold tracking-widest">{t.conv_col_user}</th>
                                <th className="px-6 py-4 font-bold tracking-widest">{t.conv_col_bot}</th>
                                <th className="px-6 py-4 font-bold tracking-widest text-center">{lang === 'es' ? 'Puntaje' : 'Score'}</th>
                                <th className="px-6 py-4 font-bold tracking-widest text-right">{t.conv_col_action}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sessions.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        {t.conv_empty}
                                    </td>
                                </tr>
                            ) : (
                                sessions.map((session) => {
                                    const metadata = session.metadata && typeof session.metadata === 'object' && !Array.isArray(session.metadata)
                                        ? session.metadata as Record<string, unknown>
                                        : {};
                                    const evalData = parseEvaluationSnapshot(metadata.evaluation);
                                    const userDisplay = getConversationUserDisplay(
                                        {
                                            appUsername: session.app_username,
                                            totaraUserId: session.totara_user_id,
                                        },
                                        viewerRole,
                                        {
                                            anonymous: t.conv_anonymous,
                                            notAvailable: 'n/a',
                                            totaraUserIdLabel: lang === 'es' ? 'Totara User ID' : 'Totara User ID',
                                        }
                                    );
                                    return (
                                        <tr key={session.id} className="group transition-colors hover:bg-slate-50/80">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-slate-900">
                                                        {formatDate(session.created_at)}
                                                    </span>
                                                    <span className="text-xs text-slate-400">
                                                        {formatTime(session.created_at)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs">
                                                        <User className="w-3 h-3" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="block truncate max-w-[170px] text-slate-700" title={userDisplay.title}>
                                                            {userDisplay.primary}
                                                        </span>
                                                        {userDisplay.secondary && (
                                                            <span className="block truncate max-w-[170px] text-[11px] text-slate-400" title={userDisplay.secondary}>
                                                                {userDisplay.secondary}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline" className="rounded-full border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-100">
                                                    {session.bot?.name || (lang === 'es' ? 'Desconocido' : 'Unknown')}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {evalData ? (
                                                    <div className="flex flex-col items-center">
                                                        <Badge variant="outline" className={cn(
                                                            "rounded-full px-3 py-1 font-mono font-bold",
                                                            evalData.percentage >= 70
                                                                ? "bg-green-50 text-green-700 border-green-200"
                                                                : "bg-amber-50 text-amber-700 border-amber-200"
                                                        )}>
                                                            {evalData.percentage}%
                                                        </Badge>
                                                        <span className="text-[10px] text-slate-400 mt-1 font-bold">
                                                            {evalData.score}/{evalData.max_score}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-300 italic">{lang === 'es' ? 'Sin evaluar' : 'Not evaluated'}</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Link href={`${conversationsBasePath}/${session.id}`}>
                                                    <Button size="sm" variant="outline" className="rounded-xl border-slate-200 bg-white font-semibold hover:bg-slate-50">
                                                        {t.conv_view} <ArrowRight className="ml-2 h-3 w-3" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
                        <div className="text-sm text-slate-500">
                            {t.conv_page} {page} {t.conv_of} {totalPages}
                        </div>
                        <div className="flex gap-2">
                            {page > 1 && (
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => fetchData(page - 1)}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                            )}
                            {page < totalPages && (
                                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => fetchData(page + 1)}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </WorkspacePanel>

            {!isUserViewer && (
                <AlertDialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {lang === 'es' ? 'Confirmar exportación' : 'Confirm export'}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {lang === 'es'
                                    ? 'Se exportarán en XLSX las prácticas visibles según los filtros aplicados.'
                                    : 'An XLSX file will be exported with practices visible under the currently applied filters.'}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>
                                {lang === 'es' ? 'Cancelar' : 'Cancel'}
                            </AlertDialogCancel>
                            <AlertDialogAction onClick={handleExport} disabled={isExporting}>
                                {isExporting
                                    ? (lang === 'es' ? 'Exportando...' : 'Exporting...')
                                    : (lang === 'es' ? 'Sí, exportar' : 'Yes, export')}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}
        </div>
    );
}
