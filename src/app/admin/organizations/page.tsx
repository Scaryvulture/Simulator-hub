'use client';

import { getOrganizations, createOrganization, deleteOrganization } from '@/app/actions/organizations';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash, Settings, Building, Search, Users, Bot as BotIcon } from 'lucide-react';
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
    PaginationPrevious,
    PaginationNext,
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useRouter, useSearchParams } from 'next/navigation';
import { OrganizationImportDialog } from '@/components/admin/organization-import-dialog';

type OrganizationListItem = Awaited<ReturnType<typeof getOrganizations>>['organizations'][number];

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function parsePageParam(value: string | null): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
}

function OrganizationsList() {
    const { t, lang } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();

    // URL State
    const page = parsePageParam(searchParams.get('page'));
    const search = searchParams.get('search') || '';

    // Local Data State
    const [orgs, setOrgs] = useState<OrganizationListItem[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(search);
    const [isCreating, setIsCreating] = useState(false);
    const [canManageCatalog, setCanManageCatalog] = useState(false);

    // Debounce search update
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

    // Fetch Data
    useEffect(() => {
        const fetchOrgs = async () => {
            setIsLoading(true);
            try {
                const data = await getOrganizations({ page, search });
                setOrgs(data.organizations);
                setTotalPages(data.totalPages);
                setCanManageCatalog(data.can_manage_catalog);
            } catch (e: unknown) {
                toast.error(getErrorMessage(e));
            } finally {
                setIsLoading(false);
            }
        };
        fetchOrgs();
    }, [page, search]);

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsCreating(true);
        const formData = new FormData(e.currentTarget);

        try {
            const createResult = await createOrganization(formData);
            if (!createResult.success) {
                toast.error(createResult.error);
                return;
            }

            // Refresh logic
            const data = await getOrganizations({ page, search });
            setOrgs(data.organizations);
            setTotalPages(data.totalPages);
            setCanManageCatalog(data.can_manage_catalog);
            setCreateOpen(false);

            toast.success(lang === 'es' ? 'Organización creada' : 'Organization created');
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setIsCreating(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            const deleteResult = await deleteOrganization(deleteId);
            if (!deleteResult.success) {
                toast.error(deleteResult.error);
                return;
            }

            // Refresh logic
            const data = await getOrganizations({ page, search });
            setOrgs(data.organizations);
            setTotalPages(data.totalPages);
            setCanManageCatalog(data.can_manage_catalog);

            toast.success(lang === 'es' ? 'Organización eliminada' : 'Organization deleted');
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
            orgs: "Gestión de organizaciones. Agrupa usuarios y bots para limitar el acceso y la visibilidad.",
            create: "Crea una nueva organización. Puedes asignar usuarios y bots más tarde."
        },
        en: {
            orgs: "Organization management. Group users and bots to limit access and visibility.",
            create: "Create a new organization. You can assign users and bots later."
        }
    }[lang];

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3">
                        {lang === 'es' ? 'Organizaciones' : 'Organizations'} <HelpTooltip title="Organizations" content={helpContent.orgs} />
                    </h1>
                    <p className="text-slate-500 mt-2 font-bold uppercase tracking-widest text-[10px]">
                        {lang === 'es' ? 'GESTIÓN DE GRUPOS Y ACCESO' : 'GROUP AND ACCESS MANAGEMENT'}
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    {/* Search Input */}
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={lang === 'es' ? "Buscar organización..." : "Search organization..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-8 bg-white"
                        />
                    </div>

                    {canManageCatalog && (
                        <>
                            <OrganizationImportDialog />

                            <Button onClick={() => setCreateOpen(true)} size="lg" className="bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 px-8 rounded-xl h-10 font-black text-sm group">
                                <Plus className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform" /> {t.create_new}
                            </Button>
                            <HelpTooltip title="Creation" content={helpContent.create} />
                        </>
                    )}
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
                            {orgs.map((org) => (
                                <Card key={org.id} className="bg-white shadow-sm border-slate-200 hover:border-primary/40 transition-all group overflow-hidden rounded-[2rem]">
                                    <CardHeader className="bg-slate-50 border-b border-slate-100 pb-5">
                                        <div className="flex justify-between items-start">
                                            <div className="flex items-center gap-4">
                                                {org.logo ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={org.logo} alt={org.name} className="h-10 w-10 object-contain rounded-lg bg-white p-1" />
                                                ) : (
                                                    <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center p-1 text-slate-300">
                                                        <Building className="h-6 w-6" />
                                                    </div>
                                                )}
                                                <div>
                                                    <CardTitle className="text-lg font-black text-slate-900 group-hover:text-primary transition-colors">
                                                        {org.name}
                                                    </CardTitle>
                                                    <CardDescription className="font-mono text-[9px] text-slate-400 uppercase mt-1 tracking-widest">
                                                        {org.sso_id
                                                            ? `SSO: ${org.sso_id}`
                                                            : org.allow_manual_login
                                                                ? (lang === 'es' ? 'Login manual' : 'Manual Login')
                                                                : (lang === 'es' ? 'Interna / reporting' : 'Internal / reporting')}
                                                    </CardDescription>
                                                </div>
                                            </div>
                                            {canManageCatalog && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteId(org.id)}
                                                    className="h-9 w-9 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-xl"
                                                >
                                                    <Trash className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-6">
                                        <div className="flex justify-around mb-6 text-slate-500 font-bold text-xs uppercase tracking-wider">
                                            <div className="flex flex-col items-center gap-1">
                                                <Users className="h-4 w-4 mb-1" />
                                                <span>{org._count.members} {lang === 'es' ? 'Miembros' : 'Members'}</span>
                                            </div>
                                            <div className="flex flex-col items-center gap-1">
                                                <BotIcon className="h-4 w-4 mb-1" />
                                                <span>{org._count.bots} {lang === 'es' ? 'Bots' : 'Bots'}</span>
                                            </div>
                                        </div>

                                        <Link href={`/admin/organizations/${org.id}`} className="w-full">
                                            <Button variant="outline" className="w-full h-12 bg-white border-slate-200 hover:bg-slate-50 rounded-xl font-bold text-xs text-slate-600">
                                                <Settings className="mr-2 h-4 w-4 text-primary" /> {lang === 'es' ? 'Administrar' : 'Manage'}
                                            </Button>
                                        </Link>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>

                        {orgs.length === 0 && (
                            <div className="col-span-full border-2 border-dashed border-slate-200 rounded-[3rem] p-24 text-center bg-slate-50/50 flex flex-col items-center">
                                <div className="p-6 rounded-3xl bg-slate-100 mb-6">
                                    <Building className="h-10 w-10 text-slate-300" />
                                </div>
                                <p className="text-slate-400 text-xl font-black tracking-tight">
                                    {lang === 'es' ? 'No se encontraron organizaciones.' : 'No organizations found.'}
                                </p>
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

            {/* Create Dialog */}
            <Dialog open={createOpen && canManageCatalog} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{lang === 'es' ? 'Nueva Organización' : 'New Organization'}</DialogTitle>
                        <DialogDescription>
                            {lang === 'es' ? 'Crea una nueva organización para agrupar usuarios.' : 'Create a new organization to group users.'}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <Label htmlFor="name">{lang === 'es' ? 'Nombre' : 'Name'}</Label>
                            <Input id="name" name="name" required placeholder="Acme Corp" />
                        </div>
                        <div>
                            <Label htmlFor="sso_id">{lang === 'es' ? 'ID SSO (Opcional)' : 'SSO ID (Optional)'}</Label>
                            <Input id="sso_id" name="sso_id" placeholder="123456" />
                        </div>

                        <div className="flex items-center gap-2">
                            <input type="checkbox" id="allow_manual_login" name="allow_manual_login" value="true" defaultChecked />
                            <Label htmlFor="allow_manual_login">{lang === 'es' ? 'Permitir Login Manual' : 'Allow Manual Login'}</Label>
                        </div>

                        <div>
                            <Label htmlFor="logo">{lang === 'es' ? 'Logo' : 'Logo'}</Label>
                            <Input id="logo" name="logo" type="file" accept="image/*" />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{lang === 'es' ? 'Cancelar' : 'Cancel'}</Button>
                            <Button type="submit" disabled={isCreating}>{lang === 'es' ? 'Crear' : 'Create'}</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Alert */}
            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{lang === 'es' ? '¿Estás seguro?' : 'Are you sure?'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {lang === 'es'
                                ? 'Esta acción eliminará la organización y todas sus asignaciones. Los usuarios y bots permanecerán en el sistema.'
                                : 'This action will delete the organization and all its assignments. Users and bots will remain in the system.'}
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

function OrganizationsPageFallback() {
    const { lang } = useLanguage();
    return (
        <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
            {lang === 'es' ? 'Cargando...' : 'Loading...'}
        </div>
    );
}

export default function OrganizationsPage() {
    return (
        <Suspense fallback={<OrganizationsPageFallback />}>
            <OrganizationsList />
        </Suspense>
    );
}
