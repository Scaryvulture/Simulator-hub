import 'server-only';

import prisma from '@/lib/prisma';
import { ApiKeyResourceType } from '@prisma/client';

type ApiKeyAuditParams = {
    resourceType: ApiKeyResourceType;
    resourceId: string;
    adminId: string;
    botId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
};

export async function recordApiKeyAccessAudit(params: ApiKeyAuditParams): Promise<void> {
    try {
        await prisma.apiKeyAccessAudit.create({
            data: {
                resource_type: params.resourceType,
                resource_id: params.resourceId,
                bot_id: params.botId || null,
                admin_id: params.adminId,
                ip_address: params.ipAddress || null,
                user_agent: params.userAgent || null,
            },
        });
    } catch (error) {
        // Auditing is best-effort; do not block the main admin flow if logging fails.
        console.warn('Unable to record API key access audit event:', error);
    }
}
