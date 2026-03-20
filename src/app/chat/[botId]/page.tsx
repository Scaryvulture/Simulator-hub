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

    const { currentUser, bot, viewerRole } = await loadChatPageContext({
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
        <div className="flex flex-col h-screen bg-background relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 blur-[150px] rounded-full" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/5 blur-[150px] rounded-full" />

            <nav className="z-20 w-full border-b border-white/10 glass px-6 h-16 flex items-center">
                <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <Link href={backHref}>
                            <Button variant="ghost" size="sm" className="hover:bg-white/10 group">
                                <ArrowLeft className="mr-2 h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                                <span className="hidden sm:inline"><I18nText es={backLabelEs} en={backLabelEn} /></span>
                            </Button>
                        </Link>
                        <div className="w-px h-6 bg-white/10 mx-2 hidden sm:block" />
                        <div className="flex items-center space-x-2">
                            <Image src="/icons/assistant.svg" alt="Bot icon" width={18} height={18} className="h-[18px] w-[18px]" />
                            <span className="text-sm font-semibold tracking-tight">{bot.name}</span>
                        </div>
                    </div>
                    <LanguageSwitcher />
                </div>
            </nav>

            <main className="flex-1 relative z-10 w-full max-w-5xl mx-auto p-4 sm:p-6 lg:p-10 flex flex-col overflow-hidden">
                <ChatInterface
                    bot={bot}
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
