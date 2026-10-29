import 'server-only';
import prisma from '@/lib/prisma';
import { SessionCostScope, type Prisma } from '@prisma/client';
import { currentSessionOperation } from './session-operation-context';

type IncrementSessionCostAuditParams = {
    sessionId: string;
    scope: SessionCostScope;
    model: string;
    provider?: string | null;
    tokensIn?: number;
    tokensOut?: number;
    estimatedTokens?: number;
    messages?: number;
    events?: number;
    costUsd?: number;
};

function toInt(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

function toCost(value: number | undefined): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Number(Math.max(0, value).toFixed(6));
}

export async function incrementSessionCostAudit(params: IncrementSessionCostAuditParams) {
    const model = params.model.trim() || 'unknown';
    const tokensIn = toInt(params.tokensIn);
    const tokensOut = toInt(params.tokensOut);
    const estimatedTokens = toInt(params.estimatedTokens);
    const messages = toInt(params.messages);
    const events = toInt(params.events);
    const costUsd = toCost(params.costUsd);

    const dataForCreate = {
        session_id: params.sessionId,
        scope: params.scope,
        model,
        provider: params.provider ?? null,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        estimated_tokens: estimatedTokens,
        messages,
        events,
        cost_usd: costUsd,
    };

    const dataForUpdate = {
        ...(params.provider !== undefined ? { provider: params.provider } : {}),
        tokens_in: { increment: tokensIn },
        tokens_out: { increment: tokensOut },
        estimated_tokens: { increment: estimatedTokens },
        messages: { increment: messages },
        events: { increment: events },
        cost_usd: { increment: costUsd },
    };

    const write = (tx: Prisma.TransactionClient) => tx.sessionCostAudit.upsert({
        where: {
            session_id_scope_model: {
                session_id: params.sessionId,
                scope: params.scope,
                model,
            },
        },
        create: dataForCreate,
        update: dataForUpdate,
    });
    const operation = currentSessionOperation(params.sessionId);
    if (operation) operation.costWrites.push(write);
    else await write(prisma);
}

