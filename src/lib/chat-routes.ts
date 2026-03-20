export type ChatRouteMode = 'standard' | 'lti_embedded';

type GetChatPathOptions = {
    routeMode?: ChatRouteMode;
    forceNewSession?: boolean;
};

export function getChatPath(botId: string, options: GetChatPathOptions = {}): string {
    const routeMode = options.routeMode || 'standard';
    const safeBotId = encodeURIComponent(botId);
    const basePath = routeMode === 'lti_embedded'
        ? `/lti/chat/${safeBotId}`
        : `/chat/${safeBotId}`;

    if (!options.forceNewSession) {
        return basePath;
    }

    return `${basePath}?new=true`;
}
