'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { getUsers, createUser, deleteUser } from '@/app/actions/users';
import { useLanguage } from '@/components/providers/i18n-context';
import { UserImportDialog } from '@/components/admin/user-import-dialog';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminPanel } from '@/components/admin/admin-panel';
import { AdminDirectoryPagination } from '@/components/admin/admin-directory-pagination';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Plus, Search, ShieldCheck, Trash, User as UserIcon, UserCog } from 'lucide-react';

type UserListItem = Awaited<ReturnType<typeof getUsers>>['users'][number];

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function parseRoleFilter(value: string | null): 'ADMIN' | 'ORG_ADMIN' | 'USER' | 'ALL' | undefined {
    if (value === 'ADMIN' || value === 'ORG_ADMIN' || value === 'USER' || value === 'ALL') return value;
    return undefined;
}

function parsePageParam(value: string | null): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.floor(parsed);
}

function UsersList() {
    const { t, lang } = useLanguage();
    const router = useRouter();
    const searchParams = useSearchParams();

    const page = parsePageParam(searchParams.get('page'));
    const initialFilters = {
        username: searchParams.get('username') || '',
        totaraUserId: searchParams.get('totaraUserId') || '',
        email: searchParams.get('email') || '',
        role: searchParams.get('role') || '',
    };

    const [users, setUsers] = useState<UserListItem[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [filters, setFilters] = useState(initialFilters);

    const handleFilterChange = (key: string, value: string) => {
        setFilters((prev) => ({ ...prev, [key]: value }));
    };

    useEffect(() => {
        setFilters({
            username: searchParams.get('username') || '',
            totaraUserId: searchParams.get('totaraUserId') || '',
            email: searchParams.get('email') || '',
            role: searchParams.get('role') || '',
        });
    }, [searchParams]);

    const applyFilters = () => {
        const params = new URLSearchParams(searchParams);
        const username = filters.username.trim();
        const totaraUserId = filters.totaraUserId.trim();
        const email = filters.email.trim();
        const role = filters.role.trim();

        if (username) params.set('username', username); else params.delete('username');
        if (totaraUserId) params.set('totaraUserId', totaraUserId); else params.delete('totaraUserId');
        if (email) params.set('email', email); else params.delete('email');
        if (role) params.set('role', role); else params.delete('role');

        params.set('page', '1');
        router.push(`?${params.toString()}`);
    };

    const clearFilters = () => {
        setFilters({ username: '', totaraUserId: '', email: '', role: '' });
        const params = new URLSearchParams(searchParams);
        params.delete('username');
        params.delete('totaraUserId');
        params.delete('email');
        params.delete('role');
        params.set('page', '1');
        router.push(`?${params.toString()}`);
    };

    useEffect(() => {
        const fetchUsers = async () => {
            setIsLoading(true);
            try {
                const data = await getUsers({
                    username: searchParams.get('username') || undefined,
                    totaraUserId: searchParams.get('totaraUserId') || undefined,
                    email: searchParams.get('email') || undefined,
                    role: parseRoleFilter(searchParams.get('role')),
                    page,
                });
                setUsers(data.users);
                setTotalPages(data.totalPages);
            } catch (error: unknown) {
                toast.error(getErrorMessage(error));
            } finally {
                setIsLoading(false);
            }
        };

        fetchUsers();
    }, [page, searchParams]);

    const handleCreate = async () => {
        if (isCreating) return;
        setIsCreating(true);
        try {
            const username = `user_${Math.random().toString(36).substring(7)}`;
            const created = await createUser(username);
            toast.success(lang === 'es' ? 'Usuario creado' : 'User created');
            router.push(`/admin/users/${created.id}`);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error));
        } finally {
            setIsCreating(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteUser(deleteId);
            const data = await getUsers({
                username: searchParams.get('username') || undefined,
                totaraUserId: searchParams.get('totaraUserId') || undefined,
                email: searchParams.get('email') || undefined,
                role: parseRoleFilter(searchParams.get('role')),
                page,
            });
            setUsers(data.users);
            setTotalPages(data.totalPages);
            toast.success(lang === 'es' ? 'Usuario eliminado' : 'User deleted');
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
                title={t.user_list_title}
                description={lang === 'es' ? 'Accesos, roles y asignaciones de usuarios.' : 'User access, roles and assignments.'}
                actions={(
                    <div className="flex flex-wrap items-center gap-3">
                        <UserImportDialog />
                        <Button
                            onClick={handleCreate}
                            disabled={isCreating}
                            className="h-11 rounded-2xl px-5 text-sm font-bold shadow-sm"
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            {isCreating ? (lang === 'es' ? 'Creando...' : 'Creating...') : t.create_new}
                        </Button>
                    </div>
                )}
            />

            <AdminPanel
                variant="section"
                title={lang === 'es' ? 'Filtros' : 'Filters'}
                description={lang === 'es' ? 'Buscá por usuario, Totara ID, email o rol.' : 'Search by username, Totara ID, email or role.'}
            >
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        applyFilters();
                    }}
                    className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_minmax(0,1fr)_180px_auto]"
                >
                    <div className="relative">
                        <UserIcon className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={lang === 'es' ? 'Usuario...' : 'Username...'}
                            value={filters.username}
                            onChange={(event) => handleFilterChange('username', event.target.value)}
                            className="h-11 rounded-2xl border-slate-200 bg-white pl-10"
                        />
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Totara User ID..."
                            value={filters.totaraUserId}
                            onChange={(event) => handleFilterChange('totaraUserId', event.target.value)}
                            className="h-11 rounded-2xl border-slate-200 bg-white pl-10"
                        />
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder="Email..."
                            value={filters.email}
                            onChange={(event) => handleFilterChange('email', event.target.value)}
                            className="h-11 rounded-2xl border-slate-200 bg-white pl-10"
                        />
                    </div>
                    <select
                        value={filters.role}
                        onChange={(event) => handleFilterChange('role', event.target.value)}
                        className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none ring-0"
                    >
                        <option value="">{lang === 'es' ? 'Todos los roles' : 'All roles'}</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="ORG_ADMIN">ORG_ADMIN</option>
                        <option value="USER">USER</option>
                    </select>
                    <div className="flex items-center gap-2 lg:justify-end">
                        <Button type="submit" variant="outline" className="h-11 rounded-2xl border-slate-200 font-semibold">
                            {lang === 'es' ? 'Filtrar' : 'Filter'}
                        </Button>
                        <Button type="button" variant="ghost" className="h-11 rounded-2xl font-semibold" onClick={clearFilters}>
                            {lang === 'es' ? 'Limpiar' : 'Clear'}
                        </Button>
                    </div>
                </form>
            </AdminPanel>

            <AdminPanel
                variant="section"
                title={lang === 'es' ? 'Usuarios' : 'Users'}
                description={!isLoading
                    ? (lang === 'es' ? `${users.length} usuarios en esta página.` : `${users.length} users on this page.`)
                    : undefined}
                contentClassName="space-y-5"
            >
                <div className="overflow-x-auto rounded-[22px] border border-slate-200">
                    <Table>
                        <TableHeader className="bg-slate-50">
                            <TableRow>
                                <TableHead className="py-5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'es' ? 'Usuario' : 'User'}</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Totara User ID</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Email</TableHead>
                                <TableHead className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'es' ? 'Rol' : 'Role'}</TableHead>
                                <TableHead className="text-center text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Bots</TableHead>
                                <TableHead className="text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{lang === 'es' ? 'Acciones' : 'Actions'}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-sm font-semibold text-slate-500">
                                        {t.loading}
                                    </TableCell>
                                </TableRow>
                            ) : users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                        {lang === 'es' ? 'No se encontraron usuarios.' : 'No users found.'}
                                    </TableCell>
                                </TableRow>
                            ) : users.map((user) => (
                                <TableRow key={user.id} className="hover:bg-slate-50/70">
                                    <TableCell className="font-medium text-slate-900">
                                        <div className="flex items-center gap-3">
                                            <div className={`rounded-xl p-2 ${user.role === 'ADMIN'
                                                ? 'bg-primary/10 text-primary'
                                                : user.role === 'ORG_ADMIN'
                                                    ? 'bg-secondary text-primary'
                                                    : 'bg-slate-100 text-slate-500'}`}
                                            >
                                                {user.role === 'ADMIN' || user.role === 'ORG_ADMIN'
                                                    ? <ShieldCheck className="h-4 w-4" />
                                                    : <UserIcon className="h-4 w-4" />}
                                            </div>
                                            <span className="font-bold">{user.username}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-slate-700">{user.totaraUserId || 'n/a'}</TableCell>
                                    <TableCell className="text-sm text-slate-600">{user.email || '—'}</TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
                                            className={`rounded-full border-0 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest shadow-none ${user.role === 'ORG_ADMIN' ? 'bg-secondary text-primary hover:bg-secondary' : ''}`}
                                        >
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                                            {user.assignments.length}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Link href={`/admin/users/${user.id}`} prefetch={false}>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:bg-primary/5 hover:text-primary">
                                                    <UserCog className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            {user.username !== 'admin' ? (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteId(user.id)}
                                                    className="h-8 w-8 p-0 text-slate-300 hover:bg-red-50 hover:text-red-600"
                                                >
                                                    <Trash className="h-4 w-4" />
                                                </Button>
                                            ) : null}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                {!isLoading ? (
                    <AdminDirectoryPagination
                        page={page}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                    />
                ) : null}
            </AdminPanel>

            <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{lang === 'es' ? '¿Estás seguro?' : 'Are you sure?'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {lang === 'es'
                                ? 'Esta acción no se puede deshacer. Eliminará permanentemente el usuario y sus asignaciones.'
                                : 'This action cannot be undone. It will permanently delete the user and their assignments.'}
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

function UsersPageFallback() {
    const { lang } = useLanguage();
    return (
        <div className="p-20 text-center text-sm font-semibold text-slate-500">
            {lang === 'es' ? 'Cargando...' : 'Loading...'}
        </div>
    );
}

export default function UsersPage() {
    return (
        <Suspense fallback={<UsersPageFallback />}>
            <UsersList />
        </Suspense>
    );
}
