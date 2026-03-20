'use client'; // Standardizing admin dashboard view

import { getBots, createBot, deleteBot } from '@/app/actions/bots';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash, Settings, Bot as BotIcon, Search } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/components/providers/i18n-context';
import { HelpTooltip } from '@/components/admin/help-tooltip';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter, useSearchParams } from 'next/navigation';

type AdminBotListItem = Awaited<ReturnType<typeof getBots>>['bots'][number];

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

    // URL State
    const page = parsePageParam(searchParams.get('page'));
    const search = searchParams.get('search') || '';

    // Local Data State
    const [bots, setBots] = useState<AdminBotListItem[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState(search);

    // Debounce search update
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchTerm !== search) {
                const params = new URLSearchParams(searchParams);
                if (searchTerm) params.set('search', searchTerm);
                else params.delete('search');
                params.set('page', '1'); // Reset to page 1 on search
                router.push(`?${params.toString()}`);
            }
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm, search, router, searchParams]);

    // Fetch Data
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

            // Refresh logic
            const data = await getBots({ page, search, excludeType: 'EVALUATOR' });
            setBots(data.bots);
            setTotalPages(data.totalPages);

            toast.success(lang === 'es' ? 'Bot creado' : 'Bot created');

            // Redirect to the new bot editor
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

            // Refresh logic
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

    const helpContent = {
        es: {
            bots: "Directorio de asistentes. Cada bot es una entidad independiente con sus propias llaves y lógica.",
            create: "Despliega un nuevo director de IA. Recuerda configurar su API Key individual.",
            preview: "Prueba el bot en un entorno controlado antes de publicarlo."
        },
        en: {
            bots: "Assistant directory. Each bot is an independent entity with its own keys and logic.",
            create: "Deploy a new AI director. Remember to set its individual API Key.",
            preview: "Test the bot in a controlled environment before publishing."
        }
    }[lang];

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3">
                        {t.bot_list_title} <HelpTooltip title="Bots" content={helpContent.bots} />
                    </h1>
                    <p className="text-slate-500 mt-2 font-bold uppercase tracking-widest text-[10px]">{t.bot_list_desc}</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Search Input */}
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={lang === 'es' ? "Buscar bot..." : "Search bot..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 bg-white"
                        />
                    </div>

                    <Button onClick={handleCreate} size="lg" className="bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 px-8 rounded-xl h-10 font-black text-sm group">
                        <Plus className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform" /> {t.create_new}
                    </Button>
                    <HelpTooltip title="Creation" content={helpContent.create} />
                </div>
            </div>

            {/* Content Area */}
            <div className="">
                {isLoading ? (
                    <div className="p-20 text-center text-slate-400 font-bold animate-pulse uppercase tracking-widest text-xs">
                        {t.loading}
                    </div>
                ) : (
                    <>
                        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                            {bots.map((bot) => (
                                <Card key={bot.id} className="bg-white shadow-sm border-slate-200 hover:border-primary/40 transition-all group overflow-hidden rounded-[2rem]">
                                    <CardHeader className="bg-slate-50 border-b border-slate-100 pb-5">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-xl font-black text-slate-900 group-hover:text-primary transition-colors flex items-center gap-2">
                                                    <BotIcon className="h-5 w-5 text-primary" /> {bot.name}
                                                </CardTitle>
                                                <CardDescription className="font-mono text-[9px] text-slate-400 uppercase mt-1 tracking-widest">
                                                    {bot.bot_type || (lang === 'es' ? 'Asistente general' : 'General Assistant')}
                                                </CardDescription>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setDeleteId(bot.id)}
                                                className="h-9 w-9 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-8">
                                        <div className="grid grid-cols-2 gap-4">
                                            <Link href={`/admin/bots/${bot.id}`} prefetch={false} className="w-full">
                                                <Button variant="outline" className="w-full h-12 bg-white border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs text-slate-600">
                                                    <Settings className="mr-2 h-4 w-4 text-primary" /> {t.config}
                                                </Button>
                                            </Link>
                                            <div className="flex items-center gap-3">
                                                <Link href={`/chat/${bot.id}?new=true`} prefetch={false} className="flex-1">
                                                    <Button variant="outline" className="w-full h-12 bg-white border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs text-slate-600">
                                                        <BotIcon className="mr-2 h-4 w-4 text-primary" /> {lang === 'es' ? 'Chat' : 'Chat'}
                                                    </Button>
                                                </Link>
                                                <HelpTooltip title={lang === 'es' ? 'Chat' : 'Chat'} content={helpContent.preview} />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {bots.length === 0 && (
                            <div className="col-span-full border-2 border-dashed border-slate-200 rounded-[3rem] p-24 text-center bg-slate-50/50 flex flex-col items-center">
                                <div className="p-6 rounded-3xl bg-slate-100 mb-6">
                                    <Plus className="h-10 w-10 text-slate-300" />
                                </div>
                                <p className="text-slate-400 text-xl font-black tracking-tight">{lang === 'es' ? 'No se encontraron bots.' : 'No bots found.'}</p>
                            </div>
                        )}

                        {/* Pagination Footer */}
                        {!isLoading && totalPages > 1 && (
                            <div className="py-6 mt-8 border-t border-slate-100 bg-slate-50/50 rounded-xl">
                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                onClick={() => handlePageChange(page - 1)}
                                                className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                            />
                                        </PaginationItem>

                                        <span className="text-xs font-bold text-slate-500 px-4">
                                            {page} / {totalPages}
                                        </span>

                                        <PaginationItem>
                                            <PaginationNext
                                                onClick={() => handlePageChange(page + 1)}
                                                className={page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}
                    </>
                )}
            </div>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{lang === 'es' ? '¿Estás seguro?' : 'Are you sure?'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {lang === 'es'
                                ? 'Esta acción no se puede deshacer. Esto eliminará permanentemente el bot y todos sus datos asociados.'
                                : 'This action cannot be undone. This will permanently delete the bot and all associated data.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{lang === 'es' ? 'Cancelar' : 'Cancel'}</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
                            {lang === 'es' ? 'Eliminar' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function AdminPageFallback() {
    const { lang } = useLanguage();
    return (
        <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
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
