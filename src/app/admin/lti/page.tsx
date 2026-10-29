import Link from 'next/link';
import { verifyAdmin } from '@/lib/auth-utils';
import {
    disableLtiActivityMapping,
    getLtiActivityMappings,
    getLtiEligibleBotOptions,
    getLtiReportingOrganizationOptions,
    saveLtiActivityMapping,
} from '@/app/actions/lti';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getServerLanguage } from '@/lib/server-language';
import { redirect } from 'next/navigation';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function normalizeSingleValue(value: string | string[] | undefined): string {
    if (Array.isArray(value)) return value[0] || '';
    return value || '';
}

function normalizePage(value: string | string[] | undefined): number {
    const normalized = normalizeSingleValue(value)
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed) || parsed < 1) return 1
    return Math.floor(parsed)
}

function toStatusLabel(status: 'PENDING' | 'ACTIVE' | 'DISABLED', lang: 'es' | 'en') {
    if (status === 'ACTIVE') return lang === 'es' ? 'Activo' : 'Active';
    if (status === 'DISABLED') return lang === 'es' ? 'Deshabilitado' : 'Disabled';
    return lang === 'es' ? 'Pendiente' : 'Pending';
}

function toStatusBadgeClasses(status: 'PENDING' | 'ACTIVE' | 'DISABLED') {
    if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'DISABLED') return 'bg-slate-100 text-slate-600 border-slate-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
}

function buildAdminLtiHref(params: {
    status?: string
    search?: string
    botSearch?: string
    orgSearch?: string
    page?: number
    notice?: string
    noticeType?: 'success' | 'error'
}) {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (params.search) searchParams.set('search', params.search)
    if (params.botSearch) searchParams.set('botSearch', params.botSearch)
    if (params.orgSearch) searchParams.set('orgSearch', params.orgSearch)
    if (params.page && params.page > 1) searchParams.set('page', String(params.page))
    if (params.notice) searchParams.set('notice', params.notice)
    if (params.noticeType) searchParams.set('noticeType', params.noticeType)
    const query = searchParams.toString()
    return query ? `/admin/lti?${query}` : '/admin/lti'
}

export default async function AdminLtiPage({
    searchParams,
}: {
    searchParams: SearchParams
}) {
    await verifyAdmin();
    const lang = await getServerLanguage();
    const copy = lang === 'es'
        ? {
            title: 'Mapeos de Actividades LTI',
            subtitle: 'Relaciona cada actividad de la LMS con un bot y su alcance de reporting.',
            searchLabel: 'Búsqueda general',
            botSearchLabel: 'Bot elegible',
            orgSearchLabel: 'Organización de reporting',
            searchPlaceholder: 'Buscar por organización wrapper, organización de reporting, contexto, actividad o bot',
            botSearchPlaceholder: 'Buscar bot elegible...',
            orgSearchPlaceholder: 'Buscar organización de reporting...',
            filter: 'Filtrar',
            statusAll: 'Todos',
            statusPending: 'Pendientes',
            statusActive: 'Activos',
            statusDisabled: 'Deshabilitados',
            cardTitle: 'Actividades detectadas en la LMS',
            cardDescription: 'Actividades detectadas durante el launch y pendientes de mapeo o seguimiento.',
            empty: 'Todavía no se encontraron actividades LTI para este filtro.',
            colStatus: 'Estado',
            colWrapper: 'Última organización wrapper detectada',
            colContext: 'Contexto',
            colActivity: 'Actividad',
            colLaunchConfig: 'Configuración de launch',
            colLastSeen: 'Última detección',
            colActions: 'Acciones',
            untitledContext: 'Contexto sin título',
            untitledActivity: 'Actividad sin título',
            unassigned: 'Sin asignar',
            current: 'Actual',
            noBotAssigned: 'Sin bot asignado',
            baseWrapperOrganization: 'Organización wrapper/base',
            reporting: 'Reporting',
            saveMapping: 'Guardar mapeo',
            disable: 'Deshabilitar',
            emptyDeployment: '(vacío)',
            noOrg: 'n/d',
            autoAssignHint: 'Al guardar, el bot se asigna automaticamente a la organizacion efectiva si aun no lo estaba.',
            noticeSaved: 'Mapeo LTI guardado correctamente.',
            noticeDisabled: 'Mapeo LTI deshabilitado correctamente.',
            page: 'Página',
            of: 'de',
        }
        : {
            title: 'LTI Activity Mappings',
            subtitle: 'Link each LMS activity to a bot and its reporting scope.',
            searchLabel: 'General search',
            botSearchLabel: 'Eligible bot',
            orgSearchLabel: 'Reporting organization',
            searchPlaceholder: 'Search by wrapper organization, reporting organization, context, activity, or bot',
            botSearchPlaceholder: 'Search eligible bot...',
            orgSearchPlaceholder: 'Search reporting organization...',
            filter: 'Filter',
            statusAll: 'All',
            statusPending: 'Pending',
            statusActive: 'Active',
            statusDisabled: 'Disabled',
            cardTitle: 'Discovered LMS Activities',
            cardDescription: 'Activities captured during launch and pending mapping or follow-up.',
            empty: 'No LTI activities found for this filter yet.',
            colStatus: 'Status',
            colWrapper: 'Last Seen Wrapper Organization',
            colContext: 'Context',
            colActivity: 'Activity',
            colLaunchConfig: 'Launch Config',
            colLastSeen: 'Last Seen',
            colActions: 'Actions',
            untitledContext: 'Untitled context',
            untitledActivity: 'Untitled activity',
            unassigned: 'Unassigned',
            current: 'Current',
            noBotAssigned: 'No bot assigned',
            baseWrapperOrganization: 'Base wrapper organization',
            reporting: 'Reporting',
            saveMapping: 'Save Mapping',
            disable: 'Disable',
            emptyDeployment: '(empty)',
            noOrg: 'n/a',
            autoAssignHint: 'Saving also assigns the bot to the effective organization if needed.',
            noticeSaved: 'LTI mapping saved successfully.',
            noticeDisabled: 'LTI mapping disabled successfully.',
            page: 'Page',
            of: 'of',
        };

    const params = await searchParams;
    const status = normalizeSingleValue(params.status) || 'ALL';
    const search = normalizeSingleValue(params.search);
    const botSearch = normalizeSingleValue(params.botSearch);
    const orgSearch = normalizeSingleValue(params.orgSearch);
    const page = normalizePage(params.page);
    const notice = normalizeSingleValue(params.notice);
    const noticeType = normalizeSingleValue(params.noticeType) === 'success' ? 'success' : 'error';

    async function handleSaveMapping(formData: FormData) {
        'use server';
        const result = await saveLtiActivityMapping(formData);
        if (!result.success) {
            redirect(buildAdminLtiHref({
                status,
                search,
                botSearch,
                orgSearch,
                page,
                notice: result.error,
                noticeType: 'error',
            }));
        }
        redirect(buildAdminLtiHref({
            status,
            search,
            botSearch,
            orgSearch,
            page,
            notice: copy.noticeSaved,
            noticeType: 'success',
        }));
    }

    async function handleDisableMapping(formData: FormData) {
        'use server';
        const result = await disableLtiActivityMapping(formData);
        if (!result.success) {
            redirect(buildAdminLtiHref({
                status,
                search,
                botSearch,
                orgSearch,
                page,
                notice: result.error,
                noticeType: 'error',
            }));
        }
        redirect(buildAdminLtiHref({
            status,
            search,
            botSearch,
            orgSearch,
            page,
            notice: copy.noticeDisabled,
            noticeType: 'success',
        }));
    }

    const mappingsData = await getLtiActivityMappings({
        status: status as 'ALL' | 'PENDING' | 'ACTIVE' | 'DISABLED',
        search,
        page,
        skipAuthCheck: true,
    })
    const mappings = mappingsData.items
    const selectedBotIds = mappings
        .map((mapping) => mapping.bot_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    const selectedOrganizationIds = mappings
        .map((mapping) => mapping.reporting_organization_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0)

    const [bots, organizations] = await Promise.all([
        getLtiEligibleBotOptions({
            search: botSearch,
            includeIds: selectedBotIds,
            skipAuthCheck: true,
        }),
        getLtiReportingOrganizationOptions({
            search: orgSearch,
            includeIds: selectedOrganizationIds,
            skipAuthCheck: true,
        }),
    ])

    const statusLinks = [
        { value: 'ALL', label: copy.statusAll },
        { value: 'PENDING', label: copy.statusPending },
        { value: 'ACTIVE', label: copy.statusActive },
        { value: 'DISABLED', label: copy.statusDisabled },
    ];

    return (
        <div className="space-y-6">
            <AdminPageHeader
                variant="directory"
                eyebrow={lang === 'es' ? 'Administración' : 'Administration'}
                title={copy.title}
                description={copy.subtitle}
            />

            <AdminPanel
                variant="section"
                title={lang === 'es' ? 'Filtros' : 'Filters'}
                description={lang === 'es' ? 'Bot, organización y estado de cada actividad detectada.' : 'Bot, organization and status for each discovered activity.'}
            >
                <div className="space-y-4">
                    <form
                        className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(220px,1fr)_minmax(220px,1fr)_auto]"
                        method="GET"
                    >
                        <div className="space-y-2">
                            <label
                                htmlFor="lti-search"
                                className="text-xs font-bold uppercase tracking-widest text-slate-500"
                            >
                                {copy.searchLabel}
                            </label>
                            <Input
                                id="lti-search"
                                name="search"
                                defaultValue={search}
                                placeholder={copy.searchPlaceholder}
                                className="h-10 w-full bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="lti-bot-search"
                                className="text-xs font-bold uppercase tracking-widest text-slate-500"
                            >
                                {copy.botSearchLabel}
                            </label>
                            <Input
                                id="lti-bot-search"
                                name="botSearch"
                                defaultValue={botSearch}
                                placeholder={copy.botSearchPlaceholder}
                                className="h-10 w-full bg-white"
                            />
                        </div>
                        <div className="space-y-2">
                            <label
                                htmlFor="lti-org-search"
                                className="text-xs font-bold uppercase tracking-widest text-slate-500"
                            >
                                {copy.orgSearchLabel}
                            </label>
                            <Input
                                id="lti-org-search"
                                name="orgSearch"
                                defaultValue={orgSearch}
                                placeholder={copy.orgSearchPlaceholder}
                                className="h-10 w-full bg-white"
                            />
                        </div>
                        <div className="flex items-end">
                            <input type="hidden" name="status" value={status} />
                            <Button type="submit" className="h-11 w-full rounded-2xl px-5 font-semibold lg:w-auto">
                                {copy.filter}
                            </Button>
                        </div>
                    </form>
                    <div className="flex flex-wrap gap-2">
                        {statusLinks.map((item) => {
                            const href = buildAdminLtiHref({
                                status: item.value,
                                search,
                                botSearch,
                                orgSearch,
                            });
                            const active = item.value === status;
                            return (
                                <Link key={item.value} href={href} prefetch={false}>
                                    <span className={[
                                        'inline-flex h-10 items-center rounded-xl border px-3 text-sm font-semibold transition-colors',
                                        active
                                            ? 'border-primary/25 bg-primary/10 text-primary'
                                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                    ].join(' ')}>
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </AdminPanel>

            {notice ? (
                <div
                    className={[
                        'rounded-2xl border px-4 py-3 text-sm font-medium',
                        noticeType === 'success'
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : 'border-rose-200 bg-rose-50 text-rose-800',
                    ].join(' ')}
                >
                    {notice}
                </div>
            ) : null}

            <AdminPanel
                variant="section"
                title={copy.cardTitle}
                description={copy.cardDescription}
                contentClassName="space-y-4"
            >
                    {mappings.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-500">
                            {copy.empty}
                        </div>
                    ) : (
                        <div className="overflow-x-auto rounded-2xl border border-slate-200">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead>{copy.colStatus}</TableHead>
                                        <TableHead>{copy.colWrapper}</TableHead>
                                        <TableHead>{copy.colContext}</TableHead>
                                        <TableHead>{copy.colActivity}</TableHead>
                                        <TableHead>{copy.colLaunchConfig}</TableHead>
                                        <TableHead>{copy.colLastSeen}</TableHead>
                                        <TableHead className="text-right">{copy.colActions}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {mappings.map((mapping) => (
                                        <TableRow key={mapping.id} className="align-top">
                                            <TableCell>
                                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${toStatusBadgeClasses(mapping.status)}`}>
                                                    {toStatusLabel(mapping.status, lang)}
                                                </span>
                                            </TableCell>
                                            <TableCell className="min-w-48">
                                                <div className="font-semibold text-slate-800">
                                                    {mapping.org_name || `org:${mapping.org_sso_id || copy.noOrg}`}
                                                </div>
                                                <div className="text-xs text-slate-500">org:{mapping.org_sso_id || copy.noOrg}</div>
                                            </TableCell>
                                            <TableCell className="min-w-52 text-sm text-slate-600">
                                                <div className="font-semibold text-slate-800">{mapping.context_title || mapping.context_label || copy.untitledContext}</div>
                                                <div className="text-xs text-slate-500">context:{mapping.context_id || copy.noOrg}</div>
                                                <div className="mt-1 break-all text-[11px] text-slate-400">{mapping.issuer}</div>
                                            </TableCell>
                                            <TableCell className="min-w-52 text-sm text-slate-600">
                                                <div className="font-semibold text-slate-800">{mapping.resource_link_title || copy.untitledActivity}</div>
                                                <div className="text-xs text-slate-500">resource:{mapping.resource_link_id}</div>
                                                <div className="text-xs text-slate-400">
                                                    deployment:{mapping.deployment_id || copy.emptyDeployment}
                                                </div>
                                            </TableCell>
                                            <TableCell className="min-w-72">
                                                <form action={handleSaveMapping} className="space-y-2">
                                                    <input type="hidden" name="mappingId" value={mapping.id} />
                                                    <select
                                                        name="botId"
                                                        defaultValue={mapping.bot_id || ''}
                                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                                    >
                                                        <option value="">{copy.unassigned}</option>
                                                        {bots.map((bot) => (
                                                            <option key={bot.id} value={bot.id}>
                                                                {bot.name}{bot.published ? '' : lang === 'es' ? ' (no publicado)' : ' (unpublished)'}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="text-xs text-slate-500">
                                                        {copy.current}: {mapping.bot?.name || copy.noBotAssigned}
                                                    </div>
                                                    <select
                                                        name="reportingOrganizationId"
                                                        defaultValue={mapping.reporting_organization_id || ''}
                                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                                    >
                                                        <option value="">{copy.baseWrapperOrganization}</option>
                                                        {organizations.map((organization) => (
                                                            <option key={organization.id} value={organization.id}>
                                                                {organization.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <div className="text-xs text-slate-500">
                                                        {copy.reporting}: {mapping.reporting_organization?.name || copy.baseWrapperOrganization}
                                                    </div>
                                                    <div className="text-[11px] leading-relaxed text-slate-400">
                                                        {copy.autoAssignHint}
                                                    </div>
                                                    <Button type="submit" size="sm" className="w-full rounded-xl">
                                                        {copy.saveMapping}
                                                    </Button>
                                                </form>
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-sm text-slate-500">
                                                {mapping.last_seen_at.toLocaleString(lang === 'es' ? 'es-AR' : 'en-GB', {
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <form action={handleDisableMapping}>
                                                    <input type="hidden" name="mappingId" value={mapping.id} />
                                                    <Button type="submit" size="sm" variant="outline" className="rounded-xl border-slate-200">
                                                        {copy.disable}
                                                    </Button>
                                                </form>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}

                    {mappingsData.totalPages > 1 ? (
                        <div className="flex justify-center pt-2">
                            <Pagination>
                                <PaginationContent>
                                    {mappingsData.page > 1 ? (
                                        <PaginationItem>
                                            <PaginationPrevious
                                                href={buildAdminLtiHref({
                                                    status,
                                                    search,
                                                    botSearch,
                                                    orgSearch,
                                                    page: mappingsData.page - 1,
                                                })}
                                            />
                                        </PaginationItem>
                                    ) : null}
                                    <PaginationItem>
                                        <PaginationLink isActive>
                                            {copy.page} {mappingsData.page} {copy.of} {mappingsData.totalPages}
                                        </PaginationLink>
                                    </PaginationItem>
                                    {mappingsData.page < mappingsData.totalPages ? (
                                        <>
                                            <PaginationItem>
                                                <PaginationEllipsis />
                                            </PaginationItem>
                                            <PaginationItem>
                                                <PaginationNext
                                                    href={buildAdminLtiHref({
                                                        status,
                                                        search,
                                                        botSearch,
                                                        orgSearch,
                                                        page: mappingsData.page + 1,
                                                    })}
                                                />
                                            </PaginationItem>
                                        </>
                                    ) : null}
                                </PaginationContent>
                            </Pagination>
                        </div>
                    ) : null}
            </AdminPanel>
        </div>
    );
}
