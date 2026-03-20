export function getRoleHomePath(role: string | null | undefined, hasOrgAdminAccess = false): string {
    if (role === 'ADMIN') return '/admin';
    if (hasOrgAdminAccess) return '/conversations';
    return '/';
}

export function getAuthenticatedHomePath(params: {
    role: string | null | undefined
    hasOrgAdminAccess?: boolean
    scopedBotId?: string | null
}): string {
    if (params.role !== 'ADMIN' && params.scopedBotId) {
        return `/chat/${params.scopedBotId}`
    }
    return getRoleHomePath(params.role, Boolean(params.hasOrgAdminAccess))
}
