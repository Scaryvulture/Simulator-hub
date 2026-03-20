'use server';

import { headers } from 'next/headers';

import prisma from '@/lib/prisma';
import { verifyAdmin } from '@/lib/auth-utils';
import { resolveClientIpFromHeaders } from '@/lib/request-ip';
import { shouldExpireEvaluationRawLog } from '@/lib/evaluation-log-policy';
import { mutateSessionMetadata, toSessionMetadataObject } from '@/lib/session-metadata';

type MetadataObject = Record<string, unknown>;

const MAX_ACCESS_AUDIT_ROWS = 250;

function toMetadataObject(value: unknown): MetadataObject {
    return toSessionMetadataObject(value);
}

export async function recordEvaluationRawLogAccess(sessionId: string): Promise<void> {
    if (!sessionId || typeof sessionId !== 'string') return;

    const admin = await verifyAdmin();
    const headerStore = await headers();
    const ipAddress = resolveClientIpFromHeaders(headerStore);
    const userAgent = headerStore.get('user-agent')?.trim() || null;

    try {
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            select: { metadata: true },
        });

        if (!session) return;

        const metadata = toMetadataObject(session.metadata);
        const evaluation = toMetadataObject(metadata.evaluation);
        const rawLogValue = evaluation.raw_log;
        if (typeof rawLogValue !== 'string' || !rawLogValue.trim()) return;
        if (shouldExpireEvaluationRawLog(evaluation)) return;

        const nowIso = new Date().toISOString();
        await mutateSessionMetadata({
            sessionId,
            mutate: (latestMetadata) => {
                const latestEvaluation = toMetadataObject(latestMetadata.evaluation);
                const latestRawLogValue = latestEvaluation.raw_log;
                if (typeof latestRawLogValue !== 'string' || !latestRawLogValue.trim()) {
                    return { skip: true };
                }
                if (shouldExpireEvaluationRawLog(latestEvaluation)) {
                    return { skip: true };
                }

                const auditTrail = Array.isArray(latestMetadata.evaluation_log_access_audit)
                    ? latestMetadata.evaluation_log_access_audit
                    : [];
                auditTrail.push({
                    timestamp: nowIso,
                    session_id: sessionId,
                    admin_id: admin.userId,
                    ip_address: ipAddress || null,
                    user_agent: userAgent,
                });

                latestMetadata.evaluation_log_access_audit = auditTrail.slice(-MAX_ACCESS_AUDIT_ROWS);
                return { metadata: latestMetadata };
            },
        });
    } catch (error) {
        // Access auditing is best-effort. Do not block UI interaction if logging fails.
        console.warn('Unable to record evaluation raw-log access audit event:', error);
    }
}
