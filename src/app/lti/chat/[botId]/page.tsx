import { ChatInterface } from '@/components/chat/chat-interface';

import { loadChatPageContext } from '@/lib/chat-page-context';

interface Props {
    params: Promise<{ botId: string }>;
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function LtiChatPage({ params, searchParams }: Props) {
    const { botId } = await params;
    const { new: forceNew } = await searchParams;
    const forceNewSession = forceNew === 'true';

    const { currentUser, bot, viewerRole } = await loadChatPageContext({
        botId,
        routeMode: 'lti_embedded',
        forceNewSession,
    });

    return (
        <div className="h-dvh w-full overflow-hidden bg-background/90 p-2 sm:p-3">
            <main className="h-full w-full overflow-hidden">
                <ChatInterface
                    bot={bot}
                    userId={currentUser.userId}
                    viewerRole={viewerRole}
                    requireAuth
                    forceNewSession={forceNewSession}
                    displayMode="lti_embedded"
                />
            </main>
        </div>
    );
}
