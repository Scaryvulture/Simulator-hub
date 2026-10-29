import { getRuntimeBot } from '@/lib/runtime-bot';
import { toPublicBotResponse } from '@/lib/public-bot-contract';
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanAccessSession, AccessError } from '@/lib/chat-access';
import { isValidUuid } from '@/lib/request-validation';
import { sanitizeConversationMetadataForViewer } from '@/lib/metadata-visibility';
import { readStoredEvaluationFromMetadata, toPublicEvaluationResult } from '@/lib/evaluation-result';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        if (!isValidUuid(sessionId)) {
            return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
        }

        const currentUser = await getSessionActor();
        await assertCanAccessSession({ sessionId, user: currentUser });

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: {
                ended: true,
                bot_id: true,
                metadata: true,
                messages: {
                    orderBy: { created_at: 'asc' },
                    select: {
                        role: true,
                        content: true,
                        images: true,
                        created_at: true,
                    },
                },
            },
        });
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        const sanitizedMetadata = sanitizeConversationMetadataForViewer(
            session.metadata,
            currentUser?.role === 'ADMIN'
        );
        const evaluation = readStoredEvaluationFromMetadata(sanitizedMetadata);

        return NextResponse.json({
            bot: session.bot_id ? toPublicBotResponse(await getRuntimeBot(session.bot_id, sessionId)) : null,
            messages: session.messages,
            ended: session.ended,
            evaluation: evaluation ? toPublicEvaluationResult(evaluation) : null,
        });
    } catch (error: unknown) {
        if (error instanceof AccessError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        console.error('Error loading messages:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
