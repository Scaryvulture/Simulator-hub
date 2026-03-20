import { sanitizeConversationMetadataForViewer } from './metadata-visibility';

type ChatResultLike = {
    content?: unknown;
    ended?: unknown;
    bypass?: unknown;
    end_reason?: unknown;
    rag_no_evidence?: unknown;
};

type SessionLike = Record<string, unknown> & {
    id?: unknown;
    bot_id?: unknown;
    organization_id?: unknown;
    external_user_id?: unknown;
    metadata?: unknown;
    created_at?: unknown;
    ended?: unknown;
};

export type PublicSessionResponse = {
    id: string;
    bot_id: string | null;
    organization_id: string | null;
    external_user_id: string | null;
    metadata: Record<string, unknown>;
    created_at: Date | string | null;
    ended: boolean;
};

function toOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
}

function toDateLike(value: unknown): Date | string | null {
    if (value instanceof Date) return value;
    if (typeof value === 'string' && value) return value;
    return null;
}

export function toPublicChatResponse(result: ChatResultLike) {
    return {
        content: typeof result.content === 'string' ? result.content : '',
        ended: Boolean(result.ended),
        bypass: Boolean(result.bypass),
        end_reason: typeof result.end_reason === 'string' ? result.end_reason : null,
        rag_no_evidence: Boolean(result.rag_no_evidence),
    };
}

export function toPublicSessionResponse(session: SessionLike, isAdminViewer: boolean): PublicSessionResponse {
    const metadata = sanitizeConversationMetadataForViewer(session.metadata, isAdminViewer);
    return {
        id: typeof session.id === 'string' ? session.id : '',
        bot_id: toOptionalString(session.bot_id),
        organization_id: toOptionalString(session.organization_id),
        external_user_id: toOptionalString(session.external_user_id),
        metadata,
        created_at: toDateLike(session.created_at),
        ended: Boolean(session.ended),
    };
}
