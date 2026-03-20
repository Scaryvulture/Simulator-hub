type ViewerRole = 'ADMIN' | 'ORG_ADMIN' | 'USER'

type ConversationUserDisplayInput = {
    appUsername: string | null
    totaraUserId: string | null
}

type ConversationUserDisplayLabels = {
    anonymous: string
    notAvailable: string
    totaraUserIdLabel: string
}

export function getConversationUserDisplay(
    input: ConversationUserDisplayInput,
    viewerRole: ViewerRole,
    labels: ConversationUserDisplayLabels
) {
    if (viewerRole === 'ADMIN') {
        return {
            primary: input.appUsername || labels.anonymous,
            secondary: `${labels.totaraUserIdLabel}: ${input.totaraUserId || labels.notAvailable}`,
            title: input.appUsername || input.totaraUserId || labels.anonymous,
        }
    }

    if (viewerRole === 'ORG_ADMIN') {
        return {
            primary: input.totaraUserId || labels.notAvailable,
            secondary: null,
            title: input.totaraUserId || labels.notAvailable,
        }
    }

    const primary = input.appUsername || input.totaraUserId || labels.anonymous
    const shouldShowSecondary = Boolean(input.totaraUserId && input.totaraUserId !== primary)

    return {
        primary,
        secondary: shouldShowSecondary
            ? `${labels.totaraUserIdLabel}: ${input.totaraUserId}`
            : null,
        title: primary,
    }
}
