'use client';

import { getBots, createBot, deleteBot } from '@/app/actions/bots';
import { useLanguage } from '@/components/providers/i18n-context';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminPanel } from '@/components/admin/admin-panel';
import { BotDirectoryCard } from '@/components/admin/bot-directory-card';
import { BotDirectoryDeleteDialog } from '@/components/admin/bot-directory-delete-dialog';
import { BotDirectoryEmptyState } from '@/components/admin/bot-directory-empty-state';
import { BotDirectoryHeader } from '@/components/admin/bot-directory-header';
import { AdminDirectoryPagination } from '@/components/admin/admin-directory-pagination';
import type { AdminBotListItem } from '@/components/admin/bot-directory-types';

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function parsePageParam(value: string | null): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
}

function AdminBotList() {
    const { t, lang } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();

    const page = parsePageParam(searchParams.get('page'));
    const search = searchParams.get('search') || '';

    const [bots, setBots] = useState<AdminBotListItem[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState(search);

    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm !== search) {
                const params = new URLSearchParams(searchParams);
                if (searchTerm) params.set('search', searchTerm);
                else params.delete('search');
                params.set('page', '1');
                router.push(`?${params.toString()}`);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, search, router, searchParams]);

    useEffect(() => {
        const fetchBots = async () => {
            setIsLoading(true);
            try {
                const data = await getBots({ page, search, excludeType: 'EVALUATOR' });
                setBots(data.bots);
                setTotalPages(data.totalPages);
            } catch (e: unknown) {
                toast.error(getErrorMessage(e));
            } finally {
                setIsLoading(false);
            }
        };
        fetchBots();
    }, [page, search]);


    const handleCreate = async () => {
        try {
            const createResult = await createBot(lang === 'es' ? 'Nuevo Bot' : 'New Bot');
            if (!createResult.success) {
                toast.error(createResult.error);
                return;
            }

            const data = await getBots({ page, search, excludeType: 'EVALUATOR' });
            setBots(data.bots);
            setTotalPages(data.totalPages);

            toast.success(lang === 'es' ? 'Bot creado' : 'Bot created');
            router.push(`/admin/bots/${createResult.data.id}`);
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            const deleteResult = await deleteBot(deleteId);
            if (!deleteResult.success) {
                toast.error(deleteResult.error);
                return;
            }

            const data = await getBots({ page, search, excludeType: 'EVALUATOR' });
            setBots(data.bots);
            setTotalPages(data.totalPages);

            toast.success(lang === 'es' ? 'Bot eliminado' : 'Bot deleted');
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setDeleteId(null);
        }
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages) return;
        const params = new URLSearchParams(searchParams);
        params.set('page', newPage.toString());
        router.push(`?${params.toString()}`);
    };

    return (
        <div className="space-y-6">
            <BotDirectoryHeader
                lang={lang}
                title={t.bot_list_title}
                description={lang === 'es' ? 'Accesos directos a edición, publicación y prueba.' : 'Direct access to edit, publish and test.'}
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
                onCreate={handleCreate}
                disabled={isLoading}
            />

            <AdminPanel
                variant="directory"
                title={(
                    <span className="inline-flex items-center gap-3">
                        <span>{lang === 'es' ? 'Resultados' : 'Results'}</span>
                        {!isLoading ? (
                            <span className="admin-editor-chip">
                                {bots.length}
                            </span>
                        ) : null}
                    </span>
                )}
                description={!isLoading
                    ? (lang === 'es'
                        ? `${bots.length} bots en esta página.`
                        : `${bots.length} bots on this page.`)
                    : undefined}
                contentClassName="space-y-5"
            >
                {isLoading ? (
                    <div className="rounded-[2rem] border border-dashed border-slate-300 bg-slate-50/70 p-20 text-center">
                        <p className="text-sm font-semibold text-slate-500">
                            {lang === 'es' ? 'Cargando bots' : 'Loading bots'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="admin-directory-grid">
                            {bots.map((bot) => (
                                <BotDirectoryCard
                                    key={bot.id}
                                    bot={bot}
                                    lang={lang}
                                    onDelete={setDeleteId}
                                />
                            ))}
                        </div>

                        {bots.length === 0 && (
                            <BotDirectoryEmptyState lang={lang} />
                        )}

                        <AdminDirectoryPagination
                            page={page}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />
                    </>
                )}
            </AdminPanel>

            <BotDirectoryDeleteDialog
                open={Boolean(deleteId)}
                lang={lang}
                onConfirm={confirmDelete}
                onOpenChange={(open) => {
                    if (!open) setDeleteId(null);
                }}
            />
        </div>
    );
}

function AdminPageFallback() {
    const { lang } = useLanguage();
    return (
        <div className="p-20 text-center text-sm font-semibold text-slate-500">
            {lang === 'es' ? 'Cargando...' : 'Loading...'}
        </div>
    );
}

export default function AdminPage() {
    return (
        <Suspense fallback={<AdminPageFallback />}>
            <AdminBotList />
        </Suspense>
    );
}
