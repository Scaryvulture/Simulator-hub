import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '@prisma/client';

export type SessionOperationContext = {
    sessionId: string;
    token: string;
    metadata: Record<string, unknown>;
    initialMetadata: Record<string, unknown>;
    ended: boolean;
    initiallyEnded: boolean;
    writes: Array<(tx: Prisma.TransactionClient) => Promise<unknown>>;
    costWrites: Array<(tx: Prisma.TransactionClient) => Promise<unknown>>;
};

export const sessionOperationContext = new AsyncLocalStorage<SessionOperationContext>();

export function currentSessionOperation(sessionId: string) {
    const current = sessionOperationContext.getStore();
    return current?.sessionId === sessionId ? current : undefined;
}

export class SessionOperationError extends Error {
    readonly status = 409;
}

export function assertOperationToken(metadata: Record<string, unknown>, token: string) {
    const operation = metadata._operation as { token?: string } | undefined;
    if (operation?.token !== token) {
        throw new SessionOperationError('La operación venció. Recargá la conversación antes de continuar.');
    }
}

export function mergeOperationMetadata(current: Record<string, unknown>, context: Pick<SessionOperationContext, 'initialMetadata' | 'metadata'>) {
    const merged = { ...current };
    for (const key of new Set([...Object.keys(context.initialMetadata), ...Object.keys(context.metadata)])) {
        if (key === '_operation' || key === '_requests') continue;
        if (JSON.stringify(context.initialMetadata[key]) !== JSON.stringify(context.metadata[key])) {
            if (key in context.metadata) merged[key] = context.metadata[key];
            else delete merged[key];
        }
    }
    return merged;
}
