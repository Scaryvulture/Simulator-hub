import { ChatInterface } from '@/components/chat/chat-interface';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { I18nText } from '@/components/providers/i18n-text';
import { LanguageSwitcher } from '@/components/providers/language-switcher';
import Image from 'next/image';
import { loadChatPageContext } from '@/lib/chat-page-context';

interface Props {
    params: Promise<{ botId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ChatPage({ params, searchParams }: Props) {
    const { botId } = await params;
    const { new: forceNew } = await searchParams;
    const forceNewSession = forceNew === 'true';

    const { currentUser, bot, viewerRole, organizations } = await loadChatPageContext({
        botId,
        routeMode: 'standard',
        forceNewSession,
    });

    let backHref = '/';
    let backLabelEs = 'Inicio';
    let backLabelEn = 'Hub';

    if (currentUser.role === 'ADMIN') {
        backHref = '/admin';
        backLabelEs = 'Admin';
        backLabelEn = 'Admin';
    } else if (currentUser.hasOrgAdminAccess) {
        backHref = '/conversations';
        backLabelEs = 'Panel';
        backLabelEn = 'Dashboard';
    }

    return (
        <div className="workspace-canvas flex h-screen flex-col">
            <nav className="workspace-topbar">
                <div className="workspace-shell flex h-16 items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Link href={backHref}>
                            <Button variant="ghost" size="sm" className="h-10 rounded-2xl px-3 font-semibold text-slate-600 hover:bg-slate-100">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                <span className="hidden sm:inline"><I18nText es={backLabelEs} en={backLabelEn} /></span>
                            </Button>
                        </Link>
                        <div className="mx-2 hidden h-6 w-px bg-slate-200 sm:block" />
                        <div className="flex items-center space-x-2">
                            <Image src="/icons/assistant.svg" alt="Bot icon" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
                            <span className="text-sm font-semibold tracking-tight text-slate-700">{bot.name}</span>
                        </div>
                    </div>
                    <LanguageSwitcher />
                </div>
            </nav>

            <main className="workspace-shell flex flex-1 flex-col overflow-hidden py-4 sm:py-6 lg:py-8">
                <ChatInterface
                    bot={bot}
                    organizations={organizations}
                    userId={currentUser?.userId}
                    viewerRole={viewerRole}
                    requireAuth
                    forceNewSession={forceNewSession}
                    displayMode="standard"
                />
            </main>
        </div>
    );
}
