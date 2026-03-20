import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, FileSignature, Trash, Settings } from 'lucide-react';
import Link from 'next/link';
import { createBot, deleteBot } from '@/app/actions/bots';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { Pagination } from '@/components/ui/pagination';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/auth-utils';
import {
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination"

function getCriteriaCount(config: unknown, key: 'boolean' | 'qualitative'): number {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return 0;
    const criteria = (config as { criteria?: unknown }).criteria;
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) return 0;
    const list = (criteria as Record<string, unknown>)[key];
    return Array.isArray(list) ? list.length : 0;
}

function parsePageParam(value: string | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
}

export default async function EvaluatorsPage({ searchParams }: { searchParams: Promise<{ page?: string; search?: string }> }) {
    await verifyAdmin();
    const params = await searchParams;
    const cookieStore = await cookies();
    const lang = cookieStore.get('app-lang')?.value === 'en' ? 'en' : 'es';
    const copy = lang === 'es'
        ? {
            title: 'Evaluadores',
            subtitle: 'Define criterios y rúbricas para evaluación automática.',
            create: 'Crear evaluador',
            search: 'Buscar evaluadores...',
            boolean: 'Booleanos',
            qualitative: 'Cualitativos',
            configure: 'Configurar',
            empty: 'No se encontraron evaluadores',
            empty_subtitle: 'Creá uno para comenzar a construir evaluaciones.',
            new_name: 'Nuevo Evaluador',
        }
        : {
            title: 'Evaluators',
            subtitle: 'Define criteria and rubrics for automated assessment.',
            create: 'Create Evaluator',
            search: 'Search evaluators...',
            boolean: 'Boolean',
            qualitative: 'Qualitative',
            configure: 'Configure',
            empty: 'No evaluators found',
            empty_subtitle: 'Create one to start building assessments.',
            new_name: 'New Evaluator',
        };
    const page = parsePageParam(params.page);
    const search = params.search || '';

    const pageSize = 9;
    const where = {
        bot_type: 'EVALUATOR',
        deleted_at: null,
        name: { contains: search }
    };

    const [evaluators, totalCount] = await Promise.all([
        prisma.bot.findMany({
            where,
            select: {
                id: true,
                name: true,
                config: true,
            },
            orderBy: { created_at: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.bot.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / pageSize);

    async function handleCreate() {
        'use server';
        const createResult = await createBot(copy.new_name);
        if (!createResult.success) {
            throw new Error(createResult.error);
        }
        const bot = createResult.data;
        // Update type to EVALUATOR immediately
        await prisma.bot.update({
            where: { id: bot.id },
            data: {
                bot_type: 'EVALUATOR',
                config: {
                    criteria: { boolean: [], qualitative: [] },
                    evaluation_instruction: '',
                    rag_config: {
                        enabled: false,
                        mode: 'evaluation_only',
                        owner: 'wrapper',
                        rag_owner: 'wrapper',
                        vector_store_ids: [],
                        strict_mode: true,
                        wrapper: {
                            strategy: 'hybrid',
                            fallback: 'none',
                            top_k: 8,
                            cache_ttl: 120,
                            max_evidence_tokens: 1400,
                            metadata_filters: {},
                        },
                        platform: {
                            max_num_results: 8,
                            force_tool: true,
                        },
                        audit: {
                            store_results: true,
                            store_queries: true,
                            store_scores: true,
                        },
                        // Legacy mirror fields
                        top_k: 8,
                        fallback_strategy: 'none',
                        cache_ttl_seconds: 120,
                        max_evidence_tokens: 1400,
                        history_limit: 10,
                    },
                }
            }
        });
        redirect(`/admin/evaluators/${bot.id}`);
    }

    async function handleDelete(id: string) {
        'use server';
        const deleteResult = await deleteBot(id);
        if (!deleteResult.success) {
            throw new Error(deleteResult.error);
        }
        revalidatePath('/admin/evaluators');
    }

    return (
        <div className="container mx-auto py-10 px-6 max-w-7xl space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter text-slate-900 group flex items-center gap-3">
                        <FileSignature className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" /> {copy.title}
                    </h2>
                    <p className="text-slate-500 font-medium mt-1 text-sm">{copy.subtitle}</p>
                </div>
                <div className="flex items-center gap-2">
                    <form action={handleCreate}>
                        <Button size="lg" className="rounded-xl font-black shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all bg-primary hover:bg-primary/90">
                            <Plus className="mr-2 h-5 w-5" /> {copy.create}
                        </Button>
                    </form>
                </div>
            </div>

            {/* Search */}
            <form className="relative max-w-md">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                    name="search"
                    placeholder={copy.search}
                    defaultValue={search}
                    className="pl-10 h-10 bg-white border-slate-200 rounded-xl"
                />
            </form>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {evaluators.map((bot) => (
                    <Card key={bot.id} className="group relative overflow-hidden border-slate-200 hover:border-primary/50 transition-all duration-300 hover:shadow-2xl hover:shadow-slate-200/50 bg-white rounded-3xl">
                        <div className="absolute inset-x-0 h-1 top-0 bg-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                        <CardHeader className="pb-3 pt-6 px-6">
                            <div className="flex justify-between items-start mb-2">
                                <div className="h-10 w-10 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 group-hover:scale-110 transition-transform duration-300">
                                    <FileSignature className="h-5 w-5 text-slate-400 group-hover:text-primary transition-colors" />
                                </div>
                                <form action={handleDelete.bind(null, bot.id)}>
                                    <button className="text-slate-300 hover:text-red-500 transition-colors p-2 hover:bg-red-50 rounded-full">
                                        <Trash className="h-4 w-4" />
                                    </button>
                                </form>
                            </div>
                            <CardTitle className="leading-tight text-lg text-slate-900 font-black tracking-tight group-hover:text-primary transition-colors">
                                {bot.name}
                            </CardTitle>
                            <CardDescription className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-1">
                                {getCriteriaCount(bot.config, 'boolean')} {copy.boolean} • {getCriteriaCount(bot.config, 'qualitative')} {copy.qualitative}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="px-6 pb-6 pt-2">
                            <Link href={`/admin/evaluators/${bot.id}`}>
                                <Button variant="outline" className="w-full h-10 rounded-xl font-bold border-slate-200 text-slate-600 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all">
                                    <Settings className="mr-2 h-4 w-4" /> {copy.configure}
                                </Button>
                            </Link>
                        </CardContent>
                    </Card>
                ))}

                {evaluators.length === 0 && (
                    <div className="col-span-full py-20 text-center text-slate-400 flex flex-col items-center">
                        <FileSignature className="h-16 w-16 mb-4 opacity-10" />
                        <h3 className="text-lg font-bold">{copy.empty}</h3>
                        <p className="text-sm">{copy.empty_subtitle}</p>
                    </div>
                )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-8 flex justify-center">
                    <Pagination>
                        <PaginationContent>
                            {page > 1 && (
                                <PaginationItem>
                                    <PaginationPrevious href={`/admin/evaluators?page=${page - 1}&search=${search}`} />
                                </PaginationItem>
                            )}
                            <PaginationItem>
                                <PaginationLink isActive>{page}</PaginationLink>
                            </PaginationItem>
                            {page < totalPages && (
                                <PaginationItem>
                                    <PaginationEllipsis />
                                </PaginationItem>
                            )}
                            {page < totalPages && (
                                <PaginationItem>
                                    <PaginationNext href={`/admin/evaluators?page=${page + 1}&search=${search}`} />
                                </PaginationItem>
                            )}
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
