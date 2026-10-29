import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from './prisma';
import { toSessionMetadataObject } from './session-metadata';
import { assertOperationToken, currentSessionOperation, mergeOperationMetadata, sessionOperationContext, SessionOperationError, type SessionOperationContext } from './session-operation-context';

type LockedRow = { metadata: unknown; ended: boolean; now_ms: bigint };
type Receipt = { key: string; hash: string; result: unknown };
const LEASE_MS = 15 * 60_000;

async function lockedRow(tx: Prisma.TransactionClient, sessionId: string) {
    const rows = await tx.$queryRaw<LockedRow[]>`
        SELECT metadata, ended, (extract(epoch FROM clock_timestamp()) * 1000)::bigint AS now_ms
        FROM sessions WHERE id = ${sessionId} FOR UPDATE
    `;
    if (!rows[0]) throw new SessionOperationError('Session not found');
    return rows[0];
}

// Only short transactions: provider requests run outside the database transaction.
// State, messages and the idempotency receipt commit together after a fencing check.
export async function withSessionOperation<T>(
    sessionId: string,
    kind: 'init' | 'message' | 'end' | 'evaluation',
    run: () => Promise<T>,
    request?: { id: string; payload: unknown },
): Promise<T> {
    if (currentSessionOperation(sessionId)) return run();
    const token = randomUUID();
    const key = request ? `${kind}:${request.id}` : null;
    const hash = createHash('sha256').update(JSON.stringify(request?.payload ?? null)).digest('hex');
    const claim = await prisma.$transaction(async (tx) => {
        const row = await lockedRow(tx, sessionId);
        const metadata = toSessionMetadataObject(row.metadata);
        const receipts = (Array.isArray(metadata._requests) ? metadata._requests : []) as Receipt[];
        const receipt = key ? receipts.find((entry) => entry.key === key) : undefined;
        if (receipt) {
            if (receipt.hash !== hash) throw new SessionOperationError('El identificador de envío ya se usó con otro contenido.');
            return { cached: true as const, result: receipt.result as T };
        }
        const lease = metadata._operation as { expires?: number } | undefined;
        if (lease && Number(lease.expires) > Number(row.now_ms)) {
            throw new SessionOperationError('Hay una operación en curso. Esperá unos segundos y reintentá.');
        }
        metadata._operation = { token, kind, expires: Number(row.now_ms) + LEASE_MS };
        await tx.session.update({ where: { id: sessionId }, data: { metadata: metadata as Prisma.InputJsonValue } });
        return { cached: false as const, metadata, ended: row.ended };
    });
    if (claim.cached) return claim.result;
    const context: SessionOperationContext = {
        sessionId, token, metadata: structuredClone(claim.metadata), initialMetadata: structuredClone(claim.metadata),
        ended: claim.ended, initiallyEnded: claim.ended, writes: [], costWrites: [],
    };
    try {
        const result = await sessionOperationContext.run(context, run);
        await prisma.$transaction(async (tx) => {
            const row = await lockedRow(tx, sessionId);
            const metadata = toSessionMetadataObject(row.metadata);
            assertOperationToken(metadata, token);
            const merged = mergeOperationMetadata(metadata, context);
            delete merged._operation;
            if (key) {
                const receipts = (Array.isArray(metadata._requests) ? metadata._requests : []) as Receipt[];
                // Keep every accepted ID for this session; never turn an old retry into a new turn.
                merged._requests = [...receipts, { key, hash, result }];
            }
            for (const write of [...context.writes, ...context.costWrites]) await write(tx);
            await tx.session.update({ where: { id: sessionId }, data: {
                ended: row.ended || context.ended,
                metadata: JSON.parse(JSON.stringify(merged)) as Prisma.InputJsonValue,
            } });
        });
        return result;
    } catch (error) {
        // Discard staged dialogue/progress. Keep costs for provider work already performed.
        await prisma.$transaction(async (tx) => {
            const row = await lockedRow(tx, sessionId);
            const metadata = toSessionMetadataObject(row.metadata);
            const lease = metadata._operation as { token?: string } | undefined;
            if (lease?.token !== token) return;
            delete metadata._operation;
            for (const write of context.costWrites) await write(tx);
            await tx.session.update({ where: { id: sessionId }, data: { metadata: metadata as Prisma.InputJsonValue } });
        }).catch(() => undefined);
        throw error;
    }
}

export async function readRuntimeSession(sessionId: string) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    const operation = currentSessionOperation(sessionId);
    return session && operation ? { ...session, metadata: operation.metadata, ended: operation.ended } : session;
}
