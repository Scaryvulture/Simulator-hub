import { NextRequest, NextResponse } from 'next/server';
import { withSessionOperation } from '@/lib/session-operation';
import { mutateSessionMetadata } from '@/lib/session-metadata';
import { SessionOperationError } from '@/lib/session-operation-context';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanUseSessionForLiveChat, AccessError } from '@/lib/chat-access';
import { isValidEntityId, isValidUuid } from '@/lib/request-validation';

type EndSessionPayload = {
    botId?: unknown;
};

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        if (!isValidUuid(sessionId)) {
            return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({})) as EndSessionPayload;
        const botId = typeof body.botId === 'string' ? body.botId : undefined;
        if (botId !== undefined && !isValidEntityId(botId)) {
            return NextResponse.json({ error: 'Invalid botId' }, { status: 400 });
        }

        const currentUser = await getSessionActor();
        await assertCanUseSessionForLiveChat({ sessionId, botId, user: currentUser });

        await withSessionOperation(sessionId, 'end', () => mutateSessionMetadata({
            sessionId, mutate: () => ({ ended: true }),
        }));

        return NextResponse.json({ ok: true, ended: true });
    } catch (error: unknown) {
        if (error instanceof AccessError || error instanceof SessionOperationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('Error ending session:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
