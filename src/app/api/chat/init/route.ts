import { SessionOperationError } from '@/lib/session-operation-context';
import { NextRequest, NextResponse } from 'next/server';
import { Director } from '@/lib/director';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanUseSessionForLiveChat, AccessError } from '@/lib/chat-access';
import {
    isValidEntityId,
    isValidUuid,
    parseJsonBodyWithLimit,
    PayloadTooLargeError,
} from '@/lib/request-validation';
import { toPositiveInteger } from '@/lib/number-utils';
import { logServerError } from '@/lib/server-log';

/**
 * POST /api/chat/init
 * Initialize a chat session and get the intro message if configured
 */
export async function POST(req: NextRequest) {
    let sessionId: unknown
    let botId: unknown
    try {
        const maxRequestBytes = toPositiveInteger(process.env.CHAT_INIT_MAX_REQUEST_BYTES, 64_000);
        const payload = await parseJsonBodyWithLimit(req, maxRequestBytes);
        sessionId = payload?.sessionId;
        botId = payload?.botId;
        const currentUser = await getSessionActor();

        if (!isValidUuid(sessionId) || !isValidEntityId(botId)) {
            return NextResponse.json(
                { error: 'Invalid sessionId or botId' },
                { status: 400 }
            );
        }

        await assertCanUseSessionForLiveChat({ sessionId, botId, user: currentUser });

        const result = await Director.initSession(sessionId, botId);

        return NextResponse.json({
            introMessage: result.introMessage,
        });
    } catch (error: unknown) {
        if (error instanceof AccessError || error instanceof SessionOperationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        if (error instanceof PayloadTooLargeError) {
            return NextResponse.json({ error: error.message }, { status: 413 });
        }
        if (error instanceof SyntaxError) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
        }
        logServerError('api.chat.init', error, {
            sessionId: typeof sessionId === 'string' ? sessionId : null,
            botId: typeof botId === 'string' ? botId : null,
        });
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
