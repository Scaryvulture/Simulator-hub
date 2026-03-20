import { NextRequest, NextResponse } from 'next/server';
import { isAuthorizationError, verifyAdmin } from '@/lib/auth-utils';
import { ensureQaLabConfigRecord, revealQaLabEvalsApiKey } from '@/lib/qa-lab-config';
import { getRequestIp } from '@/lib/rate-limit';
import { recordApiKeyAccessAudit } from '@/lib/api-key-audit';
import { ApiKeyResourceType } from '@prisma/client';

function noStoreJson(body: unknown, status = 200) {
    return NextResponse.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}

export async function GET(request: NextRequest) {
    try {
        const admin = await verifyAdmin();
        const record = await ensureQaLabConfigRecord();
        if (!record) {
            return noStoreJson({ error: 'QA Lab configuration is unavailable.' }, 404);
        }

        const apiKey = await revealQaLabEvalsApiKey();
        if (!apiKey) {
            return noStoreJson({ error: 'QA Lab API key is not configured.' }, 404);
        }

        await recordApiKeyAccessAudit({
            resourceType: ApiKeyResourceType.QA_LAB,
            resourceId: record.scope,
            adminId: admin.userId,
            ipAddress: getRequestIp(request),
            userAgent: request.headers.get('user-agent'),
        });

        return noStoreJson({ api_key: apiKey });
    } catch (error: unknown) {
        if (isAuthorizationError(error)) {
            return noStoreJson(
                { error: error.status === 401 ? 'Authentication required' : 'Forbidden' },
                error.status,
            );
        }
        console.error('Failed to reveal QA Lab API key:', error);
        return noStoreJson({ error: 'Failed to reveal QA Lab API key.' }, 500);
    }
}
