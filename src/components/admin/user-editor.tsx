'use client';

import { useState, useMemo, useRef } from 'react';
import { updateUser, setPassword } from '@/app/actions/users';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, ArrowLeft, Check, ChevronsUpDown, ShieldCheck, UserCog, Eye, EyeOff, Building, Bot } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useLanguage } from '@/components/providers/i18n-context';
import { HelpTooltip } from '@/components/admin/help-tooltip';
import { useUnsavedChangesWarning } from '@/lib/use-unsaved-changes-warning';
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

type UserRecord = NonNullable<Awaited<ReturnType<typeof import('@/app/actions/users').getUser>>>;
type AvailableOrganization = Awaited<ReturnType<typeof import('@/app/actions/organizations').getAllOrganizations>>[number];

interface Props {
    user: UserRecord;
    availableOrganizations: AvailableOrganization[];
}

export function UserEditor({ user, availableOrganizations }: Props) {
    const { lang, t } = useLanguage();
    const router = useRouter();
    const initialSelectedOrgIds = (user.org_memberships?.map((m) => m.organization_id) || []).sort();
    const orgAdminOrganizationIds = user.org_memberships
        ?.filter((membership) => membership.role === 'ORG_ADMIN')
        .map((membership) => membership.organization_id) || [];
    const orgAdminMembershipCount = orgAdminOrganizationIds.length;

    const [username, setUsername] = useState(user.username);
    const [email, setEmail] = useState(user.email || '');
    const [role, setRole] = useState(user.role);
    // Bot assignment is now strictly via Organization (or read-only legacy)
    // const [selectedBotIds, setSelectedBotIds] = useState<string[]>(...); 

    const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>(
        initialSelectedOrgIds
    );
    const [isSaving, setIsSaving] = useState(false);
    // const [openBot, setOpenBot] = useState(false); // Removed
    const [openOrg, setOpenOrg] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showAdminConfirm, setShowAdminConfirm] = useState(false);
    const initialSnapshotRef = useRef<string>(JSON.stringify({
        username: user.username,
        email: user.email || '',
        role: user.role,
        selectedOrgIds: initialSelectedOrgIds,
    }));

    const handleSetPassword = async () => {
        if (!newPassword) return;
        try {
            setIsSaving(true);
            await setPassword(user.id, newPassword);
            // setNewPassword(''); // Mantener visible a petición del usuario
            toast.success(lang === 'es' ? 'Contraseña actualizada' : 'Password updated');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            await updateUser(user.id, {
                username,
                email,
                role,
                // botIds: selectedBotIds, // Removed direct assignment capability
                orgIds: selectedOrgIds
            });
            toast.success(lang === 'es' ? 'Usuario actualizado' : 'User updated successfully');
            initialSnapshotRef.current = currentSnapshot;
            router.push('/admin/users');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    };

    // handleToggleBot removed

    const handleToggleOrg = (orgId: string) => {
        setSelectedOrgIds(prev =>
            prev.includes(orgId)
                ? prev.filter(id => id !== orgId)
                : [...prev, orgId]
        );
    };

    const helpContent = {
        es: {
            identity: "Identificación única. Puede ser el nombre, ID interno o correo electrónico del usuario.",
            role: "ADMIN tiene acceso total a la plataforma. USER usa la plataforma como usuario normal. El acceso ORG_ADMIN ya no se define aquí: se hereda desde las organizaciones donde la persona fue marcada como admin.",
            assignment: "El usuario solo podrá visualizar los bots heredados por sus organizaciones o asignaciones directas."
        },
        en: {
            identity: "Unique identification. Can be the name, internal ID, or email of the user.",
            role: "ADMIN has full platform access. USER uses the platform as a normal user. ORG_ADMIN access is no longer configured here: it is inherited from organizations where the person is marked as an admin.",
            assignment: "The user will only be able to view bots inherited from organizations or direct assignments."
        }
    }[lang];

    const handleAdminSelection = () => {
        if (role === 'ADMIN') return;
        setShowAdminConfirm(true);
    };

    const currentSnapshot = useMemo(() => JSON.stringify({
        username,
        email,
        role,
        selectedOrgIds: [...selectedOrgIds].sort(),
    }), [username, email, role, selectedOrgIds]);
    const hasUnsavedChanges = !isSaving && currentSnapshot !== initialSnapshotRef.current;
    useUnsavedChangesWarning(
        hasUnsavedChanges,
        lang === 'es'
            ? 'Tienes cambios sin guardar en este usuario. Si sales ahora, los perderás. ¿Deseas continuar?'
            : 'You have unsaved changes in this user. If you leave now, they will be lost. Continue?'
    );

    return (
        <>
            <div className="space-y-8 animate-in fade-in duration-700">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center space-x-4">
                    <Link href="/admin/users">
                        <Button variant="ghost" size="icon" className="rounded-full bg-slate-100 hover:bg-slate-200 transition-all border border-slate-200">
                            <ArrowLeft className="h-5 w-5 text-slate-600" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter text-slate-900">
                            {lang === 'es' ? 'Perfil de Usuario' : 'User Profile'}: <span className="text-primary">{user.username}</span>
                        </h1>
                        <p className="text-slate-500 font-bold uppercase tracking-widest text-[9px] mt-1">
                            {lang === 'es' ? 'Protocolo de autorización de personal' : 'Personnel Authorization Protocol'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {hasUnsavedChanges && (
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                            {lang === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'}
                        </span>
                    )}
                    <Button onClick={handleSave} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 h-14 px-10 rounded-xl transition-all font-black text-sm group">
                        {isSaving ? t.loading : <><Save className="mr-2 h-5 w-5 group-hover:scale-110 transition-transform" /> {t.save}</>}
                    </Button>
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 py-6 px-8">
                        <CardTitle className="text-slate-900 font-black text-lg flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Datos de Identidad' : 'Identity Data'}
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                            {lang === 'es' ? 'Credenciales y derechos de acceso' : 'Access rights and credentials'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-8 px-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] flex items-center">
                                {lang === 'es' ? 'ID de Usuario' : 'User ID'} <HelpTooltip title={lang === 'es' ? 'Identidad' : 'Identity'} content={helpContent.identity} />
                            </Label>
                            <Input
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={user.username === 'admin'}
                                className="bg-slate-50 border-slate-200 h-12 rounded-xl text-slate-900 font-bold"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">Email</Label>
                            <Input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@example.com"
                                className="bg-slate-50 border-slate-200 h-12 rounded-xl text-slate-900 font-bold"
                            />
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                {lang === 'es' ? 'Identidad Totara' : 'Totara identity'}
                            </p>
                            <div className="mt-3 space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="font-bold text-slate-600">{lang === 'es' ? 'Totara User ID' : 'Totara User ID'}</span>
                                    <span className="font-mono text-slate-900">{user.totaraUserId || 'n/a'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="font-bold text-slate-600">{lang === 'es' ? 'Totara username' : 'Totara username'}</span>
                                    <span className="font-mono text-slate-900">{user.totaraUsername || 'n/a'}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="font-bold text-slate-600">{lang === 'es' ? 'Issuer LMS' : 'LMS issuer'}</span>
                                    <span className="max-w-[55%] truncate text-right font-mono text-slate-900" title={user.ltiIssuer || 'n/a'}>
                                        {user.ltiIssuer || 'n/a'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] flex items-center">
                                {lang === 'es' ? 'Rol de Plataforma' : 'Platform Role'} <HelpTooltip title={lang === 'es' ? 'Seguridad' : 'Security'} content={helpContent.role} />
                            </Label>
                            <div className="flex space-x-3">
                                <Button
                                    variant={role === 'ADMIN' ? 'default' : 'outline'}
                                    onClick={handleAdminSelection}
                                    className={cn(
                                        "flex-1 h-12 rounded-xl font-black text-xs transition-all",
                                        role === 'ADMIN' ? "bg-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                                    )}
                                    disabled={user.username === 'admin'}
                                >
                                    ADMIN
                                </Button>
                                <Button
                                    variant={role === 'USER' ? 'default' : 'outline'}
                                    onClick={() => setRole('USER')}
                                    className={cn(
                                        "flex-1 h-12 rounded-xl font-black text-xs transition-all",
                                        role === 'USER' ? "bg-primary text-white shadow-lg" : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                                    )}
                                    disabled={user.username === 'admin'}
                                >
                                    USER
                                </Button>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                                <p className="font-bold text-slate-800">
                                    {lang === 'es' ? 'Administración contextual por organización' : 'Contextual organization admin access'}
                                </p>
                                <p className="mt-1">
                                    {orgAdminMembershipCount > 0
                                        ? (
                                            lang === 'es'
                                                ? `Este usuario ya administra ${orgAdminMembershipCount} ${orgAdminMembershipCount === 1 ? 'organización' : 'organizaciones'}. Ese permiso se conserva y se gestiona dentro de cada organización.`
                                                : `This user already administers ${orgAdminMembershipCount} ${orgAdminMembershipCount === 1 ? 'organization' : 'organizations'}. That permission is preserved and managed inside each organization.`
                                        )
                                        : (
                                            lang === 'es'
                                                ? 'Si quieres que esta persona administre una organización, asígnale ese permiso dentro de la ficha de esa organización.'
                                                : 'If you want this person to administer an organization, grant that permission inside that organization profile.'
                                        )}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 py-6 px-8">
                        <CardTitle className="text-slate-900 font-black text-lg flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Seguridad' : 'Security'}
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                            {lang === 'es' ? 'Gestión de contraseña' : 'Password Management'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-8 px-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">
                                {lang === 'es' ? 'Nueva Contraseña' : 'New Password'}
                            </Label>
                            <div className="flex gap-3 relative">
                                <div className="relative flex-1">
                                    <Input
                                        type={showPassword ? "text" : "password"}
                                        name="admin_reset_password"
                                        autoComplete="new-password"
                                        data-lpignore="true"
                                        data-1p-ignore="true"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="bg-slate-50 border-slate-200 h-11 rounded-xl text-slate-900 font-bold pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 focus:outline-none"
                                    >
                                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                                <Button
                                    onClick={handleSetPassword}
                                    disabled={!newPassword || isSaving}
                                    className="bg-slate-900 text-white h-11 px-6 rounded-xl font-bold text-xs hover:bg-slate-800"
                                >
                                    {lang === 'es' ? 'Actualizar' : 'Update'}
                                </Button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium">
                                {lang === 'es'
                                    ? 'Ingresa una nueva contraseña para restablecer el acceso del usuario inmediatamente.'
                                    : 'Enter a new password to immediately reset user access.'}
                            </p>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 py-6 px-8">
                        <CardTitle className="text-slate-900 font-black text-lg flex items-center gap-2">
                            <UserCog className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Acceso a Asistentes' : 'Assistant Access'}
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                            {lang === 'es' ? 'Bots heredados por organización' : 'Bots inherited via organization'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-8 px-8">
                        <div className="space-y-4">
                            {/* Computed Access List */}
                            {(() => {
                                const directBots = user.assignments?.map((a) => ({
                                    ...(a.bot || {}),
                                    source: lang === 'es' ? 'Asignación Directa' : 'Direct Assignment',
                                    sourceType: 'Direct'
                                })).filter((bot): bot is { id: string; name: string; bot_type: string; published: boolean; source: string; sourceType: 'Direct' } =>
                                    typeof bot.id === 'string'
                                    && typeof bot.name === 'string'
                                    && typeof bot.bot_type === 'string'
                                    && typeof bot.published === 'boolean'
                                ) || [];

                                const orgBots = user.org_memberships?.flatMap((m) =>
                                    m.organization.bots.map((ob) => ({
                                        ...ob.bot,
                                        source: m.organization.name,
                                        sourceType: 'Organization'
                                    }))
                                ) || [];

                                const allAccess = [...directBots, ...orgBots];
                                // Deduplicate by ID
                                const uniqueAccess = Array.from(new Map(allAccess.map(item => [item?.id, item])).values()).filter(Boolean);

                                if (uniqueAccess.length === 0) {
                                    return (
                                        <div className="text-center py-6 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                                            <p className="text-xs font-bold uppercase tracking-widest">
                                                {lang === 'es' ? 'Sin acceso a bots' : 'No bot access'}
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="grid gap-3">
                                        {uniqueAccess.map((bot) => (
                                            <div key={bot.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center border border-slate-100 shadow-sm text-primary">
                                                        <Bot className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-slate-800">{bot.name}</p>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="text-[9px] h-5 bg-white border-slate-200 text-slate-400 font-bold uppercase tracking-widest">
                                                                {bot.bot_type}
                                                            </Badge>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <Badge className={cn(
                                                        "text-[9px] font-bold uppercase tracking-widest",
                                                        bot.sourceType === 'Direct' ? "bg-secondary text-primary hover:bg-secondary" : "bg-primary/10 text-primary hover:bg-primary/15"
                                                    )}>
                                                        {bot.source}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </CardContent>
                </Card>

                {/* Organization Assignments */}
                <Card className="bg-white shadow-sm border-slate-200 overflow-hidden rounded-3xl transition-all">
                    <CardHeader className="bg-slate-50 border-b border-slate-100 py-6 px-8">
                        <CardTitle className="text-slate-900 font-black text-lg flex items-center gap-2">
                            <Building className="h-5 w-5 text-primary" /> {lang === 'es' ? 'Organizaciones' : 'Organizations'}
                        </CardTitle>
                        <CardDescription className="text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                            {lang === 'es' ? 'Control de acceso multi-organización' : 'Multi-tenant Access Control'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-8 px-8">
                        <div className="space-y-2">
                            <Label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] flex items-center">
                                {lang === 'es' ? 'Seleccionar Organizaciones' : 'Select Organizations'}
                            </Label>
                            <Popover open={openOrg} onOpenChange={setOpenOrg}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={openOrg}
                                        className="w-full h-12 justify-between bg-slate-50 border-slate-200 rounded-xl text-slate-600 font-bold"
                                    >
                                        {selectedOrgIds.length > 0
                                            ? `${selectedOrgIds.length} ${lang === 'es' ? 'organizaciones seleccionadas' : 'organizations selected'}`
                                            : (lang === 'es' ? "Seleccionar organizaciones..." : "Select organizations...")}
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 text-primary" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-full p-0 bg-white shadow-2xl border-slate-200 rounded-2xl overflow-hidden mt-2">
                                    <Command className="bg-white">
                                        <CommandInput placeholder={lang === 'es' ? "Buscar organizaciones..." : "Search organizations..."} className="border-none focus:ring-0 text-slate-900 h-12 bg-slate-50" />
                                        <CommandList className="max-h-60 custom-scroll">
                                            <CommandEmpty className="p-4 text-xs text-slate-400 italic">{lang === 'es' ? "No se encontraron organizaciones." : "No organizations found."}</CommandEmpty>
                                            <CommandGroup>
                                                {availableOrganizations.map((org) => (
                                                    <CommandItem
                                                        key={org.id}
                                                        value={org.name} // Search by name
                                                        onSelect={() => handleToggleOrg(org.id)}
                                                        className="hover:bg-slate-50 transition-colors p-3 cursor-pointer"
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4 text-primary",
                                                                selectedOrgIds.includes(org.id) ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        <span className="text-xs font-bold text-slate-700">{org.name}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-6">
                            {selectedOrgIds.map(id => {
                                const org = availableOrganizations.find((o) => o.id === id);
                                const membership = user.org_memberships?.find((item) => item.organization_id === id);
                                const membershipRole = membership?.role === 'ORG_ADMIN'
                                    ? (lang === 'es' ? 'Admin de organización' : 'Organization admin')
                                    : (lang === 'es' ? 'Miembro' : 'Member');
                                return org ? (
                                    <Badge key={id} variant="secondary" className="bg-slate-100 text-slate-600 border border-slate-200 py-2 px-4 rounded-xl flex items-center gap-2 font-black text-[10px] tracking-tight group transition-all hover:bg-slate-200">
                                        {org.name}
                                        <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-bold text-slate-500">
                                            {membershipRole}
                                        </span>
                                        <button onClick={() => handleToggleOrg(id)} className="text-slate-400 hover:text-red-600 transition-colors ml-1 font-black leading-none">×</button>
                                    </Badge>
                                ) : null;
                            })}
                        </div>
                        <p className="text-[11px] text-slate-400">
                            {lang === 'es'
                                ? 'Aquí solo agregas o quitas membresías. El rol de admin de organización se cambia dentro de cada organización, no desde este perfil.'
                                : 'This screen only adds or removes memberships. Organization admin roles are changed inside each organization, not from this profile.'}
                        </p>
                    </CardContent>
                </Card>
            </div>
            </div>

            <AlertDialog open={showAdminConfirm} onOpenChange={setShowAdminConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {lang === 'es' ? 'Confirmar rol ADMIN' : 'Confirm ADMIN role'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {lang === 'es'
                                ? 'Vas a otorgar acceso total a la plataforma (bots, usuarios, organizaciones, costos y configuraciones críticas). Verifícalo antes de continuar.'
                                : 'You are granting full platform access (bots, users, organizations, costs, and critical settings). Please verify before continuing.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {lang === 'es' ? 'Cancelar' : 'Cancel'}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => setRole('ADMIN')}
                        >
                            {lang === 'es' ? 'Sí, asignar ADMIN' : 'Yes, assign ADMIN'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
