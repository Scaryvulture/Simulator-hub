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

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const admin = await verifyAdmin();

        const bot = await prisma.bot.findUnique({
            where: { id },
            select: {
                id: true,
                api_key: true,
                deleted_at: true,
            },
        });

        if (!bot || bot.deleted_at) {
            return noStoreJson({ error: 'Bot not found.' }, 404);
        }
        if (!bot.api_key) {
            return noStoreJson({ error: 'Bot API key is not configured.' }, 404);
        }

        const apiKey = isEncrypted(bot.api_key) ? decrypt(bot.api_key) : bot.api_key;
        if (!apiKey) {
            return noStoreJson({ error: 'Bot API key is invalid.' }, 400);
        }

        await recordApiKeyAccessAudit({
            resourceType: ApiKeyResourceType.BOT,
            resourceId: bot.id,
            botId: bot.id,
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
        console.error('Failed to reveal bot API key:', error);
        return noStoreJson({ error: 'Failed to reveal bot API key.' }, 500);
    }
}
