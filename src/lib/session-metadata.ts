import 'server-only';

import type { Prisma } from '@prisma/client';

import prisma from '@/lib/prisma';
import { currentSessionOperation } from './session-operation-context';

type MetadataObject = Record<string, unknown>;

type LockedSessionRow = {
    metadata: unknown;
    ended: boolean;
};

type SessionMetadataMutation<T> = {
    metadata?: MetadataObject;
    ended?: boolean;
    result?: T;
    skip?: boolean;
};

function cloneJsonValue<T>(value: T): T {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

export function toSessionMetadataObject(value: unknown): MetadataObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return cloneJsonValue(value as MetadataObject);
}

export async function mutateSessionMetadata<T = void>(params: {
    sessionId: string;
    mutate: (metadata: MetadataObject) => SessionMetadataMutation<T> | void;
}): Promise<T | undefined> {
    const { sessionId, mutate } = params;
    const operation = currentSessionOperation(sessionId);
    if (operation) {
        const draft = toSessionMetadataObject(operation.metadata);
        const mutation = mutate(draft) || {};
        if (mutation.skip) return mutation.result;
        operation.metadata = mutation.metadata ?? draft;
        operation.ended = operation.ended || mutation.ended === true;
        return mutation.result;
    }

    return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<LockedSessionRow[]>`
            SELECT metadata, ended
            FROM sessions
            WHERE id = ${sessionId}
            FOR UPDATE
        `;

        const row = rows[0];
        if (!row) {
            throw new Error('Session not found');
        }

        const metadata = toSessionMetadataObject(row.metadata);
        const mutation = mutate(metadata) || {};
        if (mutation.skip) {
            return mutation.result;
        }

        const nextMetadata = mutation.metadata ?? metadata;

        await tx.session.update({
            where: { id: sessionId },
            data: {
                ...(typeof mutation.ended === 'boolean' ? { ended: row.ended || mutation.ended } : {}),
                metadata: nextMetadata as Prisma.InputJsonValue,
            },
        });

        return mutation.result;
    });
}
