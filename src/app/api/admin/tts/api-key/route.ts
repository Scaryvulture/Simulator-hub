import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isAuthorizationError, verifyAdmin } from '@/lib/auth-utils';
import { decrypt, isEncrypted } from '@/lib/crypto';
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
        const config = await prisma.ttsConfig.findFirst({
            select: {
                id: true,
                openai_api_key: true,
            },
        });

        if (!config || !config.openai_api_key) {
            return noStoreJson({ error: 'TTS API key is not configured.' }, 404);
        }

        const apiKey = isEncrypted(config.openai_api_key) ? decrypt(config.openai_api_key) : config.openai_api_key;
        if (!apiKey) {
            return noStoreJson({ error: 'TTS API key is invalid.' }, 400);
        }

        await recordApiKeyAccessAudit({
            resourceType: ApiKeyResourceType.TTS,
            resourceId: config.id,
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
        console.error('Failed to reveal TTS API key:', error);
        return noStoreJson({ error: 'Failed to reveal TTS API key.' }, 500);
    }
}
