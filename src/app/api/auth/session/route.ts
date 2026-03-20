import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getAuthenticatedHomePath } from '@/lib/auth-routing';
import { getLtiAccessScopeCookieName } from '@/lib/lti-access';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) {
        const response = NextResponse.json({ authenticated: false }, { status: 401 });
        response.cookies.delete('session-token');
        response.cookies.delete('anon-session-token');
        response.cookies.delete(getLtiAccessScopeCookieName());
        return response;
    }

    return NextResponse.json({
        authenticated: true,
        role: user.role,
        homePath: getAuthenticatedHomePath({
            role: user.role,
            hasOrgAdminAccess: user.hasOrgAdminAccess,
            scopedBotId: user.ltiAccessScope?.botId,
        }),
    });
}
