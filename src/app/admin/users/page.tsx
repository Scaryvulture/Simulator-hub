'use client';

import { getUsers, createUser, deleteUser } from '@/app/actions/users';
import { Button } from '@/components/ui/button';
import { Plus, Trash, UserCog, ShieldCheck, User as UserIcon, Search } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/components/providers/i18n-context';
import { HelpTooltip } from '@/components/admin/help-tooltip';
import { UserImportDialog } from '@/components/admin/user-import-dialog';
import { Suspense, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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

type UserListItem = Awaited<ReturnType<typeof getUsers>>['users'][number];

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

function parseRoleFilter(value: string | null): 'ADMIN' | 'ORG_ADMIN' | 'USER' | 'ALL' | undefined {
    if (value === 'ADMIN' || value === 'ORG_ADMIN' || value === 'USER' || value === 'ALL') {
        return value;
    }
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

    // URL State
    const page = parsePageParam(searchParams.get('page'));

    // Initial State from URL
    const initialFilters = {
        username: searchParams.get('username') || '',
        totaraUserId: searchParams.get('totaraUserId') || '',
        email: searchParams.get('email') || '',
        role: searchParams.get('role') || ''
    };

    // Local Data State
    const [users, setUsers] = useState<UserListItem[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [filters, setFilters] = useState(initialFilters);

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    // Keep local filter inputs synced when URL changes (pagination/back/forward).
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

        if (username) params.set('username', username);
        else params.delete('username');

        if (totaraUserId) params.set('totaraUserId', totaraUserId);
        else params.delete('totaraUserId');

        if (email) params.set('email', email);
        else params.delete('email');

        if (role) params.set('role', role);
        else params.delete('role');

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

    // Fetch Data
    useEffect(() => {
        const fetchUsers = async () => {
            setIsLoading(true);
            try {
                    // Use URL params for fetching to ensure sync with pagination
                    const currentFilters = {
                        username: searchParams.get('username') || undefined,
                        totaraUserId: searchParams.get('totaraUserId') || undefined,
                        email: searchParams.get('email') || undefined,
                        role: parseRoleFilter(searchParams.get('role')),
                        page
                    };

                const data = await getUsers(currentFilters);
                setUsers(data.users);
                setTotalPages(data.totalPages);
            } catch (e: unknown) {
                toast.error(getErrorMessage(e));
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
            const username = 'user_' + Math.random().toString(36).substring(7);
            const created = await createUser(username);

            toast.success(lang === 'es' ? 'Usuario creado' : 'User created');
            router.push(`/admin/users/${created.id}`);
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setIsCreating(false);
        }
    };

    const confirmDelete = async () => {
        if (!deleteId) return;
        try {
            await deleteUser(deleteId);

            // Refresh logic
            const currentFilters = {
                username: searchParams.get('username') || undefined,
                totaraUserId: searchParams.get('totaraUserId') || undefined,
                email: searchParams.get('email') || undefined,
                role: parseRoleFilter(searchParams.get('role')),
                page
            };
            const data = await getUsers(currentFilters);
            setUsers(data.users);
            setTotalPages(data.totalPages);

            toast.success(lang === 'es' ? 'Usuario eliminado' : 'User deleted');
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
            users: "Control de acceso. Define quién puede entrar y qué roles tienen asignados.",
            create: "Genera una credencial temporal. Luego podrás personalizar el nombre y los accesos.",
            assign: "Vincula al usuario con directores específicos. Es vital para la visibilidad del chat."
        },
        en: {
            users: "Access control. Define who can enter and what roles are assigned.",
            create: "Generate a temporary credential. You can then customize the name and access.",
            assign: "Link the user with specific directors. Vital for chat visibility."
        }
    }[lang];

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header Area */}
            <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter text-slate-900 flex items-center gap-3">
                            {t.user_list_title} <HelpTooltip title="Users" content={helpContent.users} />
                        </h1>
                        <p className="text-slate-500 mt-2 font-bold uppercase tracking-widest text-[10px]">{t.user_list_desc}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <UserImportDialog />
                        <Button
                            onClick={handleCreate}
                            disabled={isCreating}
                            size="lg"
                            className="bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 px-6 rounded-xl h-10 font-black text-sm group"
                        >
                            <Plus className="mr-2 h-4 w-4 group-hover:rotate-90 transition-transform" />
                            {isCreating ? (lang === 'es' ? 'Creando...' : 'Creating...') : t.create_new}
                        </Button>
                        <HelpTooltip title={lang === 'es' ? 'Identidad' : 'Identity'} content={helpContent.create} />
                    </div>
                </div>

                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        applyFilters();
                    }}
                    className="flex flex-col md:flex-row md:items-center gap-3"
                >
                    <div className="relative w-full md:w-44">
                        <UserIcon className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={lang === 'es' ? "Usuario..." : "Username..."}
                            value={filters.username}
                            onChange={(e) => handleFilterChange('username', e.target.value)}
                            className="pl-8 bg-white h-9 text-xs"
                        />
                    </div>

                    <div className="relative w-full md:w-44">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={lang === 'es' ? "Totara User ID..." : "Totara User ID..."}
                            value={filters.totaraUserId}
                            onChange={(e) => handleFilterChange('totaraUserId', e.target.value)}
                            className="pl-8 bg-white h-9 text-xs"
                        />
                    </div>

                    <div className="relative w-full md:w-52">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                        <Input
                            placeholder={lang === 'es' ? "Email..." : "Email..."}
                            value={filters.email}
                            onChange={(e) => handleFilterChange('email', e.target.value)}
                            className="pl-8 bg-white h-9 text-xs"
                        />
                    </div>

                    <select
                        value={filters.role}
                        onChange={(e) => handleFilterChange('role', e.target.value)}
                        className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring w-full md:w-44"
                    >
                        <option value="">{lang === 'es' ? 'Todos los roles' : 'All Roles'}</option>
                        <option value="ADMIN">ADMIN</option>
                        <option value="ORG_ADMIN">ORG_ADMIN</option>
                        <option value="USER">USER</option>
                    </select>

                    <div className="flex items-center gap-2">
                        <Button type="submit" variant="outline" className="h-9">
                            {lang === 'es' ? 'Filtrar' : 'Filter'}
                        </Button>
                        <Button type="button" variant="ghost" className="h-9" onClick={clearFilters}>
                            {lang === 'es' ? 'Limpiar' : 'Clear'}
                        </Button>
                    </div>
                </form>
            </div>

            {/* Content Area */}
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
                {isLoading ? (
                    <div className="p-20 text-center text-slate-400 font-bold animate-pulse uppercase tracking-widest text-xs">
                        {t.loading}
                    </div>
                ) : (
                    <>
                        <Table>
                            <TableHeader className="bg-slate-50">
                                <TableRow>
                                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500 py-6">{lang === 'es' ? 'Usuario' : 'User'}</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500">{lang === 'es' ? 'Totara User ID' : 'Totara User ID'}</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500">{lang === 'es' ? 'Email' : 'Email'}</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500">{lang === 'es' ? 'Rol' : 'Role'}</TableHead>
                                    <TableHead className="font-bold uppercase text-[10px] tracking-widest text-slate-500 text-center">{lang === 'es' ? 'Bots' : 'Bots'}</TableHead>
                                    <TableHead className="text-right font-bold uppercase text-[10px] tracking-widest text-slate-500">{lang === 'es' ? 'Acciones' : 'Actions'}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                                            {lang === 'es' ? 'No se encontraron usuarios.' : 'No users found.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((user) => (
                                        <TableRow key={user.id} className="hover:bg-slate-50 transition-colors">
                                            <TableCell className="font-medium text-slate-900">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-lg ${user.role === 'ADMIN'
                                                        ? 'bg-primary/10 text-primary'
                                                        : user.role === 'ORG_ADMIN'
                                                            ? 'bg-secondary text-primary'
                                                            : 'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {user.role === 'ADMIN' || user.role === 'ORG_ADMIN'
                                                            ? <ShieldCheck className="h-4 w-4" />
                                                            : <UserIcon className="h-4 w-4" />}
                                                    </div>
                                                    <span className="font-bold">{user.username}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-700">
                                                {user.totaraUserId || 'n/a'}
                                            </TableCell>
                                            <TableCell className="text-slate-600 font-medium text-sm">
                                                {user.email || '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'} className={`rounded-full text-[10px] font-black uppercase tracking-widest px-2 py-0.5 shadow-none border-0 ${user.role === 'ORG_ADMIN' ? 'bg-secondary text-primary hover:bg-secondary' : ''}`}>
                                                    {user.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <span className="bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded-md text-xs border border-slate-200">
                                                    {user.assignments.length}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end items-center gap-2">
                                                    <Link href={`/admin/users/${user.id}`} prefetch={false}>
                                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-primary/5">
                                                            <UserCog className="h-4 w-4" />
                                                        </Button>
                                                    </Link>
                                                    {user.username !== 'admin' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => setDeleteId(user.id)}
                                                            className="h-8 w-8 p-0 text-slate-300 hover:text-red-600 hover:bg-red-50"
                                                        >
                                                            <Trash className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </>
                )}

                {/* Pagination Footer */}
                {!isLoading && totalPages > 1 && (
                    <div className="py-6 border-t border-slate-100 bg-slate-50/50">
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
            </div>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
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
        <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
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
