import { Plus, Search } from 'lucide-react';
import { createBot, deleteBot } from '@/app/actions/bots';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/auth-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { EvaluatorDirectoryCard } from '@/components/admin/evaluator-directory-card';

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
            subtitle: 'Criterios, rúbricas y configuración de evaluación automática.',
            create: 'Nuevo evaluador',
            search: 'Buscar evaluadores...',
            empty: 'No se encontraron evaluadores',
            emptySubtitle: 'Creá uno para empezar a configurar evaluaciones.',
            newName: 'Nuevo Evaluador',
            results: 'Resultados',
            page: 'Página',
            of: 'de',
        }
        : {
            title: 'Evaluators',
            subtitle: 'Criteria, rubrics and automated evaluation configuration.',
            create: 'New evaluator',
            search: 'Search evaluators...',
            empty: 'No evaluators found',
            emptySubtitle: 'Create one to start configuring evaluations.',
            newName: 'New Evaluator',
            results: 'Results',
            page: 'Page',
            of: 'of',
        };

    const page = parsePageParam(params.page);
    const search = params.search || '';
    const pageSize = 9;
    const where = {
        bot_type: 'EVALUATOR',
        deleted_at: null,
        name: { contains: search },
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
        const createResult = await createBot(copy.newName);
        if (!createResult.success) {
            throw new Error(createResult.error);
        }

        const bot = createResult.data;
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
                        top_k: 8,
                        fallback_strategy: 'none',
                        cache_ttl_seconds: 120,
                        max_evidence_tokens: 1400,
                        history_limit: 10,
                    },
                },
            },
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
        <div className="space-y-6">
            <AdminPageHeader
                variant="directory"
                eyebrow={lang === 'es' ? 'Administración' : 'Administration'}
                title={copy.title}
                description={copy.subtitle}
                actions={(
                    <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[420px]">
                        <form method="GET" className="relative w-full">
                            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                            <Input
                                name="search"
                                defaultValue={search}
                                placeholder={copy.search}
                                className="h-11 rounded-2xl border-slate-200 bg-white pl-10 shadow-sm"
                            />
                        </form>
                        <div className="flex justify-end">
                            <form action={handleCreate}>
                                <Button className="h-11 rounded-2xl px-5 text-sm font-bold shadow-sm">
                                    <Plus className="mr-2 h-4 w-4" />
                                    {copy.create}
                                </Button>
                            </form>
                        </div>
                    </div>
                )}
            />

            <AdminPanel
                variant="directory"
                title={copy.results}
                description={`${evaluators.length} ${lang === 'es' ? 'evaluadores en esta página.' : 'evaluators on this page.'}`}
                contentClassName="space-y-5"
            >
                {evaluators.length === 0 ? (
                    <div className="admin-directory-empty-state">
                        <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                            <Search className="h-9 w-9 text-slate-400" />
                        </div>
                        <h3 className="text-xl font-black tracking-tight text-slate-900">{copy.empty}</h3>
                        <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">{copy.emptySubtitle}</p>
                    </div>
                ) : (
                    <>
                        <div className="admin-directory-grid">
                            {evaluators.map((bot) => (
                                <EvaluatorDirectoryCard
                                    key={bot.id}
                                    id={bot.id}
                                    name={bot.name}
                                    booleanCount={getCriteriaCount(bot.config, 'boolean')}
                                    qualitativeCount={getCriteriaCount(bot.config, 'qualitative')}
                                    lang={lang}
                                    onDelete={handleDelete}
                                />
                            ))}
                        </div>

                        {totalPages > 1 ? (
                            <div className="rounded-[22px] border border-slate-200 bg-slate-50/72 px-4 py-4">
                                <Pagination>
                                    <PaginationContent>
                                        {page > 1 ? (
                                            <PaginationItem>
                                                <PaginationPrevious href={`/admin/evaluators?page=${page - 1}&search=${search}`} />
                                            </PaginationItem>
                                        ) : null}
                                        <PaginationItem>
                                            <PaginationLink isActive>
                                                {copy.page} {page} {copy.of} {totalPages}
                                            </PaginationLink>
                                        </PaginationItem>
                                        {page < totalPages ? (
                                            <>
                                                <PaginationItem>
                                                    <PaginationEllipsis />
                                                </PaginationItem>
                                                <PaginationItem>
                                                    <PaginationNext href={`/admin/evaluators?page=${page + 1}&search=${search}`} />
                                                </PaginationItem>
                                            </>
                                        ) : null}
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        ) : null}
                    </>
                )}
            </AdminPanel>
        </div>
    );
}
