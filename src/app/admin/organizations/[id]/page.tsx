'use client';

import { getOrganization, updateOrganization, updateMemberRole } from '@/app/actions/organizations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Bot, Save, Building, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, use, useCallback, useMemo, useRef } from 'react'; // React 19 use()
import { toast } from 'sonner';
import { useLanguage } from '@/components/providers/i18n-context';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes-warning';

type OrganizationDetail = NonNullable<Awaited<ReturnType<typeof getOrganization>>>;

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
}

export default function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { lang } = useLanguage();
    const router = useRouter();

    const [org, setOrg] = useState<OrganizationDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'details' | 'members' | 'bots'>('details');
    const [orgName, setOrgName] = useState('');
    const [orgSsoId, setOrgSsoId] = useState('');
    const [allowManualLogin, setAllowManualLogin] = useState(false);
    const [hasNewLogo, setHasNewLogo] = useState(false);
    const initialSnapshotRef = useRef<string>('');

    // Create/Edit State
    const [isSaving, setIsSaving] = useState(false);

    const fetchOrg = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await getOrganization(id);
            if (!data) {
                toast.error(lang === 'es' ? 'Organización no encontrada' : 'Organization not found');
                router.push('/admin/organizations');
            } else {
                setOrg(data);
                setOrgName(data.name);
                setOrgSsoId(data.sso_id || '');
                setAllowManualLogin(Boolean(data.allow_manual_login));
                setHasNewLogo(false);
                initialSnapshotRef.current = JSON.stringify({
                    name: data.name,
                    sso_id: data.sso_id || '',
                    allow_manual_login: Boolean(data.allow_manual_login),
                    hasNewLogo: false,
                });
            }
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setIsLoading(false);
        }
    }, [id, lang, router]);

    useEffect(() => {
        fetchOrg();
    }, [fetchOrg]);

    const handleUpdateDetails = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSaving(true);
        const formData = new FormData(e.currentTarget);

        try {
            const updateResult = await updateOrganization(id, formData);
            if (!updateResult.success) {
                toast.error(updateResult.error);
                return;
            }
            toast.success(lang === 'es' ? 'Detalles actualizados' : 'Details updated');
            router.push('/admin/organizations');
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        } finally {
            setIsSaving(false);
        }
    };

    const handleUpdateRole = async (memberId: string, role: 'MEMBER' | 'ORG_ADMIN') => {
        try {
            const roleResult = await updateMemberRole(memberId, role);
            if (!roleResult.success) {
                toast.error(roleResult.error);
                return;
            }
            await fetchOrg(); // Optimistic update would be better but this is fast enough
            toast.success(lang === 'es' ? 'Rol actualizado' : 'Role updated');
        } catch (e: unknown) {
            toast.error(getErrorMessage(e));
        }
    };

    const currentSnapshot = useMemo(() => JSON.stringify({
        name: orgName,
        sso_id: orgSsoId,
        allow_manual_login: allowManualLogin,
        hasNewLogo,
    }), [orgName, orgSsoId, allowManualLogin, hasNewLogo]);
    const hasUnsavedChanges = Boolean(org) && !isSaving && currentSnapshot !== initialSnapshotRef.current;
    useUnsavedChangesWarning(
        hasUnsavedChanges,
        lang === 'es'
            ? 'Tienes cambios sin guardar en esta organización. Si sales ahora, los perderás. ¿Deseas continuar?'
            : 'You have unsaved changes in this organization. If you leave now, they will be lost. Continue?'
    );

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
    }

    if (!org) return null;

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Link href="/admin/organizations">
                    <Button variant="ghost" size="icon" className="rounded-full">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                </Link>
                    <div className="flex items-center gap-4">
                        {org.logo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={org.logo} alt={org.name} className="h-12 w-12 object-contain rounded-lg bg-white p-1 border border-slate-100" />
                        ) : (
                            <div className="h-12 w-12 bg-white rounded-lg flex items-center justify-center border border-slate-100 text-slate-300">
                            <Building className="h-6 w-6" />
                        </div>
                    )}
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">{org.name}</h1>
                        <p className="text-slate-500 text-xs font-mono uppercase tracking-widest">{org.id}</p>
                    </div>
                </div>
                {hasUnsavedChanges && (
                    <span className="ml-auto text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        {lang === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'}
                    </span>
                )}
            </div>

            {/* Custom Tabs */}
            <div className="flex gap-2 border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('details')}
                    className={cn(
                        "px-6 py-3 text-sm font-bold border-b-2 transition-colors",
                        activeTab === 'details' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                >
                    {lang === 'es' ? 'Detalles' : 'Details'}
                </button>
                <button
                    onClick={() => setActiveTab('members')}
                    className={cn(
                        "px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'members' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                >
                    {lang === 'es' ? 'Miembros' : 'Members'}
                    <span className="bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">{org.members.length}</span>
                </button>
                <button
                    onClick={() => setActiveTab('bots')}
                    className={cn(
                        "px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2",
                        activeTab === 'bots' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-slate-700"
                    )}
                >
                    {lang === 'es' ? 'Bots asignados' : 'Assigned Bots'}
                    <span className="bg-slate-100 px-2 py-0.5 rounded-full text-[10px]">{org.bots.length}</span>
                </button>
            </div>

            <div className="py-6">
                {/* DETAILS TAB */}
                {activeTab === 'details' && (
                    <Card className="max-w-2xl border-none shadow-none bg-transparent">
                        <CardContent className="p-0">
                            <form onSubmit={handleUpdateDetails} className="space-y-6">
                                <div className="grid gap-4 bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                                    <div>
                                        <Label htmlFor="name">{lang === 'es' ? 'Nombre' : 'Name'}</Label>
                                        <Input
                                            id="name"
                                            name="name"
                                            value={orgName}
                                            onChange={(e) => setOrgName(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <Label htmlFor="sso_id">{lang === 'es' ? 'ID SSO' : 'SSO ID'}</Label>
                                        <Input
                                            id="sso_id"
                                            name="sso_id"
                                            value={orgSsoId}
                                            onChange={(e) => setOrgSsoId(e.target.value)}
                                            placeholder={lang === 'es' ? 'ID de organización LMS' : 'LMS Organization ID'}
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {lang === 'es' ? 'Identificador único para integración LTI/SSO.' : 'Unique identifier for LTI/SSO integration.'}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <input
                                            type="checkbox"
                                            id="allow_manual_login"
                                            name="allow_manual_login"
                                            value="true"
                                            checked={allowManualLogin}
                                            onChange={(e) => setAllowManualLogin(e.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        <Label htmlFor="allow_manual_login" className="cursor-pointer">
                                            {lang === 'es' ? 'Permitir Login Manual' : 'Allow Manual Login'}
                                        </Label>
                                    </div>

                                    <div>
                                        <Label htmlFor="logo">{lang === 'es' ? 'Actualizar Logo' : 'Update Logo'}</Label>
                                        <Input
                                            id="logo"
                                            name="logo"
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => setHasNewLogo(Boolean(e.target.files?.length))}
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {lang === 'es' ? 'Deja en blanco para mantener el actual.' : 'Leave blank to keep current.'}
                                        </p>
                                    </div>
                                </div>

                                <Button type="submit" disabled={isSaving} className="font-bold">
                                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    {lang === 'es' ? 'Guardar Cambios' : 'Save Changes'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* MEMBERS TAB */}
                {activeTab === 'members' && (
                    <div className="space-y-4">
                        {/* 
                            READ-ONLY VIEW: 
                            Members are managed via User Profiles to avoid confusion.
                        */}
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <Table>
                                <TableHeader className="bg-slate-50">
                                    <TableRow>
                                        <TableHead className="font-bold text-xs uppercase tracking-wider">{lang === 'es' ? 'Usuario' : 'User'}</TableHead>
                                        <TableHead className="font-bold text-xs uppercase tracking-wider">{lang === 'es' ? 'Rol' : 'Role'}</TableHead>
                                        {/* Actions column removed for read-only View */}
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {org.members.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={2} className="text-center py-8 text-slate-400 text-sm italic">
                                                {lang === 'es' ? 'Sin miembros.' : 'No members.'}
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        org.members.map((m) => (
                                            <TableRow key={m.id}>
                                                <TableCell>
                                                    <div className="font-medium text-slate-900">{m.user.username}</div>
                                                    <div className="text-xs text-slate-500">{m.user.email}</div>
                                                </TableCell>
                                                <TableCell>
                                                    <Select
                                                        defaultValue={m.role}
                                                        onValueChange={(val) => handleUpdateRole(m.id, val as 'MEMBER' | 'ORG_ADMIN')}
                                                    >
                                                        <SelectTrigger className="w-[140px] h-8 text-xs font-bold uppercase tracking-wider bg-slate-50 border-slate-200">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="MEMBER">{lang === 'es' ? 'Miembro' : 'Member'}</SelectItem>
                                                            <SelectItem value="ORG_ADMIN">{lang === 'es' ? 'Admin de organización' : 'Org Admin'}</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest mt-4">
                            {lang === 'es'
                                ? 'La gestión de miembros se realiza desde el perfil de cada usuario.'
                                : 'Member management is handled via individual User Profiles.'}
                        </p>
                    </div>
                )}

                {/* BOTS TAB */}
                {activeTab === 'bots' && (
                    <div className="space-y-4">
                        {/* 
                            READ-ONLY VIEW: 
                            Bots are managed via Bot Editors.
                        */}
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {org.bots.map((b) => (
                                <Card key={b.bot_id} className="relative group overflow-hidden border-slate-200 hover:border-primary/30 transition-colors">
                                    <CardHeader className="bg-slate-50 border-b border-slate-100 p-4">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-sm font-black text-slate-800 flex items-center gap-2">
                                                <Bot className="h-4 w-4 text-primary" /> {b.bot.name}
                                            </CardTitle>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="p-4">
                                        <div className="text-[10px] text-slate-400 font-mono mb-4 uppercase tracking-wider">
                                            {b.bot.bot_type}
                                        </div>
                                        <Link href={`/admin/bots/${b.bot.id}`} target="_blank">
                                            <Button variant="outline" size="sm" className="w-full text-xs h-8">
                                                <ExternalLink className="mr-2 h-3 w-3" /> {lang === 'es' ? 'Ver Bot' : 'View Bot'}
                                            </Button>
                                        </Link>
                                    </CardContent>
                                </Card>
                            ))}
                            {org.bots.length === 0 && (
                                <div className="col-span-full py-12 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                                    <Bot className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                    <p className="font-bold text-xs uppercase tracking-widest">{lang === 'es' ? 'No hay bots asignados.' : 'No bots assigned.'}</p>
                                </div>
                            )}
                        </div>
                        <p className="text-center text-[10px] text-slate-400 uppercase tracking-widest mt-4">
                            {lang === 'es'
                                ? 'La asignación de bots se realiza desde el editor de cada Bot.'
                                : 'Bot assignment is handled via individual Bot Editors.'}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
