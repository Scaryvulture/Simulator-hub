import { NextRequest, NextResponse } from 'next/server';

import prisma from '@/lib/prisma';
import { getSessionActor } from '@/lib/auth-utils';
import { assertCanAccessSession, AccessError } from '@/lib/chat-access';
import { isValidUuid } from '@/lib/request-validation';
import { readStoredEvaluationFromMetadata } from '@/lib/evaluation-result';
import { toPublicLtiOutcomeSyncResult } from '@/lib/lti-outcome-result';
import { syncEvaluationToLtiOutcome } from '@/lib/lti-outcomes';

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    try {
        const { sessionId } = await params;
        if (!isValidUuid(sessionId)) {
            return NextResponse.json({ error: 'Invalid sessionId' }, { status: 400 });
        }

        const currentUser = await getSessionActor();
        if (!currentUser || currentUser.role === 'ADMIN' || !currentUser.ltiAccessScope) {
            return NextResponse.json({ error: 'LTI session required' }, { status: 403 });
        }

        await assertCanAccessSession({ sessionId, user: currentUser });

        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: {
                ended: true,
                metadata: true,
            },
        });

        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }
        if (!session.ended) {
            return NextResponse.json({ error: 'Session must be ended before syncing outcome.' }, { status: 409 });
        }

        const evaluation = readStoredEvaluationFromMetadata(session.metadata);
        if (!evaluation?.transcript_sha256) {
            return NextResponse.json({ error: 'Reevaluate this session before syncing its outcome.' }, { status: 409 });
        }

        const outcomeSync = await syncEvaluationToLtiOutcome({
            sessionId,
            evaluation,
        });

        return NextResponse.json({
            ok: true,
            outcomeSync: toPublicLtiOutcomeSyncResult(outcomeSync),
        });
    } catch (error: unknown) {
        if (error instanceof AccessError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }

        console.error('Error syncing LTI outcome:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
