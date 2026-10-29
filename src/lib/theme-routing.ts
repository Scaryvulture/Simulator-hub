export function isWorkspaceThemeForcedPath(pathname: string | null | undefined): boolean {
    if (!pathname) return false;

    return pathname === '/'
        || pathname === '/conversations'
        || pathname.startsWith('/conversations/')
        || pathname.startsWith('/chat/')
        || pathname === '/admin'
        || pathname.startsWith('/admin/')
        || pathname === '/lti/chat'
        || pathname.startsWith('/lti/chat/');
}

export function isAdminThemeForcedPath(pathname: string | null | undefined): boolean {
    return isWorkspaceThemeForcedPath(pathname);
}
