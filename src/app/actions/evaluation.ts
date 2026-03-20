'use server';

import { revalidatePath } from 'next/cache';

import { getCurrentUser } from '@/lib/auth-utils';
import { actionFailure, actionSuccess, resolveActionErrorMessage, type ActionResult } from '@/lib/action-result';
import { assertCanAccessSession, AccessError } from '@/lib/chat-access';
import type { PublicEvaluationResult } from '@/lib/evaluation-result';
import { runSessionEvaluation } from '@/lib/evaluation-service';
import { toPublicLtiOutcomeSyncResult, type PublicLtiOutcomeSyncResult } from '@/lib/lti-outcome-result';
import { isValidUuid } from '@/lib/request-validation';
import { syncEvaluationToLtiOutcome } from '@/lib/lti-outcomes';

export interface RunEvaluationActionData {
    evaluation: PublicEvaluationResult;
    reused: boolean;
    ltiOutcomeSync: PublicLtiOutcomeSyncResult | null;
}

export async function runEvaluation(sessionId: string): Promise<ActionResult<RunEvaluationActionData>> {
    try {
        if (!sessionId) {
            return actionFailure('Session ID is required.');
        }
        if (!isValidUuid(sessionId)) {
            return actionFailure('Invalid session ID.');
        }

        const currentUser = await getCurrentUser();
        if (!currentUser) {
            return actionFailure('Unauthorized.');
        }

        try {
            await assertCanAccessSession({ sessionId, user: currentUser });
        } catch (error) {
            if (error instanceof AccessError) {
                return actionFailure(error.message);
            }
            throw error;
        }

        const isAdminEvaluation = currentUser.role === 'ADMIN';
        const evaluationResult = await runSessionEvaluation(sessionId, {
            force: isAdminEvaluation,
            source: isAdminEvaluation ? 'admin_manual' : 'manual',
        });

        const ltiOutcomeSync = (!isAdminEvaluation && currentUser.ltiAccessScope)
            ? toPublicLtiOutcomeSyncResult(await syncEvaluationToLtiOutcome({
                sessionId,
                evaluation: evaluationResult.storedEvaluation,
            }))
            : null;

        revalidatePath(`/admin/conversations/${sessionId}`);
        revalidatePath(`/admin/conversations`);
        revalidatePath(`/conversations/${sessionId}`);
        revalidatePath(`/conversations`);

        return actionSuccess({
            evaluation: evaluationResult.evaluation,
            reused: evaluationResult.reused,
            ltiOutcomeSync,
        });
    } catch (error: unknown) {
        return actionFailure(resolveActionErrorMessage(error, 'Failed to run evaluation.'));
    }
}
