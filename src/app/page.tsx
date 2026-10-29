import { GraduationCap, LogOut, MessageSquare, Settings, UserCircle } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCurrentUser } from '@/lib/auth-utils';
import { logout } from '@/app/actions/auth';
import prisma from '@/lib/prisma';
import { I18nText } from '@/components/providers/i18n-text';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { WorkspacePageHeader } from '@/components/workspace/workspace-page-header';
import { WorkspacePanel } from '@/components/workspace/workspace-panel';

type HomeBot = {
    id: string;
    name: string;
    published: boolean;
};

export default async function HomePage() {
    const currentUser = await getCurrentUser();

    if (!currentUser) {
        redirect('/login');
    }

    const activeLtiScope = currentUser.role !== 'ADMIN' ? currentUser.ltiAccessScope : null;

    const userWithBots = activeLtiScope ? null : await prisma.appUser.findUnique({
        where: { id: currentUser.userId },
        select: {
            assignments: {
                select: {
                    bot: {
                        select: {
                            id: true,
                            name: true,
                            published: true,
                            deleted_at: true,
                        },
                    },
                },
            },
            org_memberships: {
                select: {
                    organization: {
                        select: {
                            bots: {
                                select: {
                                    bot: {
                                        select: {
                                            id: true,
                                            name: true,
                                            published: true,
                                            deleted_at: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    let bots: HomeBot[] = [];
    if (currentUser.role === 'ADMIN') {
        bots = await prisma.bot.findMany({
            where: { deleted_at: null },
            select: { id: true, name: true, published: true },
            orderBy: { created_at: 'desc' },
        });
    } else if (activeLtiScope) {
        const scopedBot = await prisma.bot.findFirst({
            where: {
                id: activeLtiScope.botId,
                deleted_at: null,
                published: true,
            },
            select: { id: true, name: true, published: true },
        });
        bots = scopedBot ? [scopedBot] : [];
    } else {
        const directBots: HomeBot[] = [];
        for (const assignment of userWithBots?.assignments || []) {
            const bot = assignment.bot;
            if (bot && !bot.deleted_at) {
                directBots.push({ id: bot.id, name: bot.name, published: bot.published });
            }
        }

        const orgBots: HomeBot[] = [];
        for (const membership of userWithBots?.org_memberships || []) {
            for (const orgBot of membership.organization.bots) {
                const bot = orgBot.bot;
                if (bot && !bot.deleted_at) {
                    orgBots.push({ id: bot.id, name: bot.name, published: bot.published });
                }
            }
        }

        bots = Array.from(new Map([...directBots, ...orgBots].map((bot) => [bot.id, bot])).values());
        bots = bots.filter((bot) => bot.published);
    }

    const isAdmin = currentUser.role === 'ADMIN';
    const isOrgAdmin = currentUser.hasOrgAdminAccess;
    const isUser = !isAdmin && !isOrgAdmin;

    return (
        <div className="workspace-canvas">
            <nav className="workspace-topbar">
                <div className="workspace-shell flex min-h-16 flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <Image src="/logo.svg" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
                        </div>
                        <div className="min-w-0">
                            <p className="workspace-eyebrow">Simulator Hub</p>
                            <p className="truncate text-sm font-semibold text-slate-700">
                                {currentUser.username}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {isAdmin ? (
                            <Badge variant="outline" className="workspace-chip workspace-chip-primary">
                                ADMIN
                            </Badge>
                        ) : null}
                        {isOrgAdmin ? (
                            <Badge variant="outline" className="workspace-chip workspace-chip-primary">
                                ORG_ADMIN
                            </Badge>
                        ) : null}
                        {isUser ? (
                            <Badge variant="outline" className="workspace-chip workspace-chip-muted">
                                USER
                            </Badge>
                        ) : null}
                        <LanguageSwitcher />
                        <form action={logout}>
                            <Button variant="ghost" size="sm" type="submit" className="h-10 rounded-2xl px-3 font-semibold text-slate-600 hover:bg-red-50 hover:text-red-600">
                                <LogOut className="mr-2 h-4 w-4" />
                                <I18nText es="Salir" en="Logout" />
                            </Button>
                        </form>
                    </div>
                </div>
            </nav>

            <main className="workspace-shell py-8 sm:py-10">
                <WorkspacePageHeader
                    variant="hub"
                    eyebrow={<I18nText es="Acceso rápido" en="Quick access" />}
                    title={<I18nText es="Tus simuladores" en="Your simulators" />}
                    description={isAdmin
                        ? <I18nText es="Vista general de acceso para lanzar prácticas o revisar el estado de publicación." en="Overview to launch practices or review publication status." />
                        : <I18nText es="Entrá a tus prácticas disponibles desde un panel más claro y directo." en="Access your available practices from a clearer, more direct hub." />}
                    meta={(
                        <>
                            <span className="workspace-chip">
                                <UserCircle className="h-3.5 w-3.5" />
                                {currentUser.username}
                            </span>
                            <span className="workspace-chip workspace-chip-muted">
                                {bots.length} <I18nText es="simulador(es)" en="simulator(s)" />
                            </span>
                        </>
                    )}
                    actions={(
                        <>
                            {isAdmin ? (
                                <Link href="/admin">
                                    <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-4 font-semibold">
                                        <Settings className="mr-2 h-4 w-4" />
                                        <I18nText es="Admin" en="Admin" />
                                    </Button>
                                </Link>
                            ) : null}
                            {(isOrgAdmin || isUser) ? (
                                <Link href="/conversations">
                                    <Button variant="outline" className="h-11 rounded-2xl border-slate-200 bg-white px-4 font-semibold">
                                        <MessageSquare className="mr-2 h-4 w-4" />
                                        <I18nText es={isOrgAdmin ? 'Prácticas' : 'Historial'} en={isOrgAdmin ? 'Practices' : 'History'} />
                                    </Button>
                                </Link>
                            ) : null}
                        </>
                    )}
                />

                <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {bots.map((bot) => (
                        <WorkspacePanel
                            key={bot.id}
                            variant="hub"
                            title={bot.name}
                            description={bot.published
                                ? <I18nText es="Disponible para iniciar una práctica nueva." en="Available to start a new practice." />
                                : <I18nText es="No publicado. Visible para revisión interna." en="Not published. Visible for internal review." />}
                            bodyClassName="space-y-5"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className={`workspace-chip ${bot.published ? 'workspace-chip-primary' : 'workspace-chip-muted'}`}>
                                    {bot.published ? <I18nText es="Publicado" en="Published" /> : <I18nText es="Borrador" en="Draft" />}
                                </span>
                                <span className="text-xs font-medium text-slate-500">
                                    ID: {bot.id.slice(0, 8)}
                                </span>
                            </div>
                            <Link href={`/chat/${bot.id}?new=true`} className="block">
                                <Button className="h-11 w-full rounded-2xl px-4 text-sm font-semibold shadow-sm">
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    <I18nText es="Iniciar práctica" en="Start practice" />
                                </Button>
                            </Link>
                        </WorkspacePanel>
                    ))}
                </div>

                {bots.length === 0 ? (
                    <div className="workspace-empty-state mt-8">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <GraduationCap className="h-7 w-7 text-slate-400" aria-hidden="true" />
                        </div>
                        <h2 className="mt-5 text-xl font-black text-slate-900">
                            <I18nText es="Aún no tenés simuladores asignados" en="You do not have assigned simulators yet" />
                        </h2>
                        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                            <I18nText
                                es="Cuando tengas accesos, tus simuladores asignados van a aparecer acá para iniciar una práctica nueva."
                                en="When you receive access, your assigned simulators will appear here so you can start a new practice."
                            />
                        </p>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
