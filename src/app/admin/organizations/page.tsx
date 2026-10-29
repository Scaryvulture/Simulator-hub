'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Search } from 'lucide-react';
import { getOrganizations, createOrganization, deleteOrganization } from '@/app/actions/organizations';
import { useLanguage } from '@/components/providers/i18n-context';
import { AdminDirectoryPagination } from '@/components/admin/admin-directory-pagination';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { OrganizationDirectoryCard } from '@/components/admin/organization-directory-card';
import { OrganizationDirectoryEmptyState } from '@/components/admin/organization-directory-empty-state';
import { OrganizationImportDialog } from '@/components/admin/organization-import-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { AdminOrganizationListItem } from '@/components/admin/organization-directory-types';

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

    const page = parsePageParam(searchParams.get('page'));
    const search = searchParams.get('search') || '';

    const [organizations, setOrganizations] = useState<AdminOrganizationListItem[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(search);
    const [isCreating, setIsCreating] = useState(false);
    const [canManageCatalog, setCanManageCatalog] = useState(false);

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
        const fetchOrganizations = async () => {
            setIsLoading(true);
            try {
                const data = await getOrganizations({ page, search });
                setOrganizations(data.organizations);
                setTotalPages(data.totalPages);
                setCanManageCatalog(data.can_manage_catalog);
            } catch (error: unknown) {
                toast.error(getErrorMessage(error));
            } finally {
                setIsLoading(false);
            }
        };

        fetchOrganizations();
    }, [page, search]);

    const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsCreating(true);
        const formData = new FormData(event.currentTarget);

        try {
            const createResult = await createOrganization(formData);
            if (!createResult.success) {
                toast.error(createResult.error);
                return;
            }

            const data = await getOrganizations({ page, search });
            setOrganizations(data.organizations);
            setTotalPages(data.totalPages);
            setCanManageCatalog(data.can_manage_catalog);
            setCreateOpen(false);

            toast.success(lang === 'es' ? 'Organización creada' : 'Organization created');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
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

            const data = await getOrganizations({ page, search });
            setOrganizations(data.organizations);
            setTotalPages(data.totalPages);
            setCanManageCatalog(data.can_manage_catalog);

            toast.success(lang === 'es' ? 'Organización eliminada' : 'Organization deleted');
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
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
            <AdminPageHeader
                variant="directory"
                eyebrow={lang === 'es' ? 'Administración' : 'Administration'}
                title={lang === 'es' ? 'Organizaciones' : 'Organizations'}
                description={lang === 'es'
                    ? 'Acceso, membresías y bots por organización.'
                    : 'Access, memberships and bots by organization.'}
                actions={(
                    <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[520px]">
                        <div className="relative w-full">
                            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                            <Input
                                placeholder={lang === 'es' ? 'Buscar organizaciones...' : 'Search organizations...'}
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                className="h-11 rounded-2xl border-slate-200 bg-white pl-10 shadow-sm"
                            />
                        </div>
                        {canManageCatalog ? (
                            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                                <OrganizationImportDialog />
                                <Button
                                    onClick={() => setCreateOpen(true)}
                                    className="h-11 rounded-2xl px-5 text-sm font-bold shadow-sm"
                                >
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t.create_new}
                                </Button>
                            </div>
                        ) : null}
                    </div>
                )}
            />

            <AdminPanel
                variant="directory"
                title={lang === 'es' ? 'Resultados' : 'Results'}
                description={!isLoading
                    ? (lang === 'es'
                        ? `${organizations.length} organizaciones en esta página.`
                        : `${organizations.length} organizations on this page.`)
                    : undefined}
                contentClassName="space-y-5"
            >
                {isLoading ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/70 p-20 text-center">
                        <p className="text-sm font-semibold text-slate-500">
                            {t.loading}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="admin-directory-grid">
                            {organizations.map((organization) => (
                                <OrganizationDirectoryCard
                                    key={organization.id}
                                    organization={organization}
                                    lang={lang}
                                    canManageCatalog={canManageCatalog}
                                    onDelete={setDeleteId}
                                />
                            ))}
                        </div>

                        {organizations.length === 0 ? (
                            <OrganizationDirectoryEmptyState lang={lang} />
                        ) : null}

                        <AdminDirectoryPagination
                            page={page}
                            totalPages={totalPages}
                            onPageChange={handlePageChange}
                        />
                    </>
                )}
            </AdminPanel>

            <Dialog open={createOpen && canManageCatalog} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{lang === 'es' ? 'Nueva organización' : 'New organization'}</DialogTitle>
                        <DialogDescription>
                            {lang === 'es'
                                ? 'Creá una organización para agrupar usuarios y bots.'
                                : 'Create an organization to group users and bots.'}
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
                            <input
                                type="checkbox"
                                id="allow_manual_login"
                                name="allow_manual_login"
                                value="true"
                                defaultChecked
                            />
                            <Label htmlFor="allow_manual_login">
                                {lang === 'es' ? 'Permitir login manual' : 'Allow manual login'}
                            </Label>
                        </div>
                        <div>
                            <Label htmlFor="logo">{lang === 'es' ? 'Logo' : 'Logo'}</Label>
                            <Input id="logo" name="logo" type="file" accept="image/*" />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                                {lang === 'es' ? 'Cancelar' : 'Cancel'}
                            </Button>
                            <Button type="submit" disabled={isCreating}>
                                {lang === 'es' ? 'Crear' : 'Create'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
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
        <div className="p-20 text-center text-sm font-semibold text-slate-500">
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
