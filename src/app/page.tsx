import { MessageSquare, Settings, LogOut, UserCircle } from 'lucide-react';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth-utils';
import { logout } from '@/app/actions/auth';
import prisma from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { I18nText } from '@/components/providers/i18n-text';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import { ThemeToggle } from '@/components/providers/theme-toggle';

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
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background Accents */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />

            <nav className="sticky top-0 z-50 w-full border-b border-white/10 glass px-4 md:px-6">
                <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 py-2 md:h-16 md:flex-row md:items-center md:justify-between md:py-0">
                    <div className="flex items-center space-x-2 group">
                        <div className="bg-white p-1 rounded-lg border border-slate-200 group-hover:shadow-[0_0_20px_rgba(var(--primary),0.3)] transition-all">
                            <Image src="/logo.svg" alt="Logo" width={28} height={28} className="h-7 w-7 object-contain dark:hidden" />
                            <Image src="/logo.svg" alt="Logo" width={28} height={28} className="hidden h-7 w-7 object-contain dark:block" />
                        </div>
                        <span className="font-bold text-xl tracking-tight">Simulator <span className="text-primary/70 font-light">Hub</span></span>
                    </div>

                    <div className="flex flex-1 items-center justify-center gap-2 md:gap-3">
                        {isAdmin && (
                            <Link href="/admin">
                                <Button variant="outline" size="sm" className="glass border-white/10 hover:bg-primary/10">
                                    <Settings className="mr-2 h-4 w-4" /> <I18nText es="Admin" en="Admin" />
                                </Button>
                            </Link>
                        )}
                        {isOrgAdmin && (
                            <Link href="/conversations">
                                <Button variant="outline" size="sm" className="glass border-white/10 hover:bg-primary/10">
                                    <Settings className="mr-2 h-4 w-4" /> <I18nText es="Prácticas" en="Practices" />
                                </Button>
                            </Link>
                        )}
                        {isUser && (
                            <Link href="/conversations">
                                <Button variant="outline" size="sm" className="glass border-white/10 hover:bg-primary/10 min-w-28">
                                    <MessageSquare className="mr-2 h-4 w-4" /> <I18nText es="Historial" en="History" />
                                </Button>
                            </Link>
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-2 sm:gap-3">
                        <div className="hidden md:flex items-center space-x-2 text-sm text-muted-foreground bg-white/5 px-3 py-1 rounded-full border border-white/5">
                            <UserCircle className="h-4 w-4" />
                            <span>{currentUser.username}</span>
                            {isAdmin && <Badge variant="secondary" className="bg-primary/20 text-primary text-[10px] py-0 px-2 h-4">ADMIN</Badge>}
                            {isOrgAdmin && <Badge variant="secondary" className="bg-secondary text-primary text-[10px] py-0 px-2 h-4">ORG_ADMIN</Badge>}
                        </div>
                        <form action={logout}>
                            <Button variant="ghost" size="sm" type="submit" className="hover:text-destructive hover:bg-destructive/10">
                                <LogOut className="mr-2 h-4 w-4" /> <I18nText es="Salir" en="Logout" />
                            </Button>
                        </form>
                        <LanguageSwitcher />
                        <ThemeToggle className="h-9 w-9 rounded-full shadow-sm" />
                    </div>
                </div>
            </nav>

            <main className="container mx-auto py-16 px-6 relative z-10">
                <div className="max-w-4xl mx-auto text-center mb-16 space-y-4">
                    <h1 className="brand-display text-5xl lg:text-7xl font-extrabold tracking-tight bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-transparent">
                        <I18nText es="Elegí tu simulador" en="Choose Your Simulator" />
                    </h1>
                </div>

                <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                    {bots.map((bot) => (
                        <Card key={bot.id} className="glass shadow-2xl border-white/5 hover:border-primary/40 transition-all group relative overflow-hidden flex flex-col">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Image src="/icons/assistant.svg" alt="Brand icon" width={64} height={64} className="h-16 w-16 object-contain" />
                            </div>
                            <CardHeader className="relative">
                                <CardTitle className="text-2xl font-bold group-hover:text-primary transition-colors">{bot.name}</CardTitle>
                            </CardHeader>
                            <CardContent className="mt-auto pt-6 border-t border-white/5 bg-white/5">
                                <Link href={`/chat/${bot.id}?new=true`}>
                                    <Button className="w-full h-12 text-lg font-semibold bg-primary hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/20">
                                        <MessageSquare className="mr-2 h-5 w-5" /> <I18nText es="Iniciar práctica" en="Start Practice" />
                                    </Button>
                                </Link>
                            </CardContent>
                        </Card>
                    ))}

                    {bots.length === 0 && (
                        <div className="col-span-full border-2 border-dashed border-white/10 rounded-3xl p-20 text-center glass">
                            <div className="bg-primary/5 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Image src="/icons/assistant.svg" alt="Brand icon" width={40} height={40} className="h-10 w-10 object-contain opacity-60" />
                            </div>
                            <h3 className="text-2xl font-bold text-muted-foreground/50"><I18nText es="Aún no tenés asignaciones" en="No Assignments Yet" /></h3>
                            <p className="text-muted-foreground/40 mt-2">
                                <I18nText es="Contactá a tu administrador para acceder a simuladores específicos." en="Contact your administrator to get access to specific simulators." />
                            </p>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
