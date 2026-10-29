import 'server-only';

import prisma from './prisma';
import { notFound, redirect } from 'next/navigation';

import { getChatBot } from '@/app/actions/bots';
import { getCurrentUser, getViewerRole } from '@/lib/auth-utils';
import { getChatPath, type ChatRouteMode } from '@/lib/chat-routes';

type LoadChatPageContextParams = {
    botId: string;
    routeMode: ChatRouteMode;
    forceNewSession: boolean;
};

export async function loadChatPageContext(params: LoadChatPageContextParams) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        redirect('/login');
    }

    if (params.routeMode === 'lti_embedded' && !currentUser.ltiAccessScope) {
        redirect(getChatPath(params.botId, {
            routeMode: 'standard',
            forceNewSession: params.forceNewSession,
        }));
    }

    if (currentUser.role !== 'ADMIN' && currentUser.ltiAccessScope) {
        const scopedBotId = currentUser.ltiAccessScope.botId;
        const targetRouteMode: ChatRouteMode = params.routeMode === 'standard'
            ? 'lti_embedded'
            : params.routeMode;

        if (scopedBotId !== params.botId || targetRouteMode !== params.routeMode) {
            redirect(getChatPath(scopedBotId, {
                routeMode: targetRouteMode,
                forceNewSession: params.forceNewSession,
            }));
        }
    }

    const bot = await getChatBot(params.botId);
    if (!bot) {
        notFound();
    }

    const memberships = currentUser.ltiAccessScope ? [] : await prisma.organizationMember.findMany({
        where: { user_id: currentUser.userId, organization: { bots: { some: { bot_id: params.botId } } } },
        select: { organization: { select: { id: true, name: true } } },
        orderBy: { organization: { name: 'asc' } },
    });
    return {
        organizations: memberships.map((membership) => membership.organization),
        currentUser,
        bot,
        viewerRole: getViewerRole(currentUser),
    };
}
