export type TurnImageAttachment = {
    mime_type: string;
    data_url: string;
};

type LogMessageFn = (
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    tin?: number,
    tout?: number,
    cost?: number,
    images?: TurnImageAttachment[]
) => Promise<unknown>;

type IncrementCostAuditFn = (params: {
    sessionId: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
}) => Promise<unknown>;

export async function persistDeterministicTurn(params: {
    logMessage: LogMessageFn;
    sessionId: string;
    userLogContent: string;
    assistantContent: string;
    userImages?: TurnImageAttachment[];
}): Promise<void> {
    const { logMessage, sessionId, userLogContent, assistantContent, userImages = [] } = params;
    await logMessage(sessionId, 'user', userLogContent, 0, 0, 0, userImages);
    await logMessage(sessionId, 'assistant', assistantContent, 0, 0, 0);
}

export async function persistModelTurn(params: {
    logMessage: LogMessageFn;
    incrementCostAudit: IncrementCostAuditFn;
    sessionId: string;
    userLogContent: string;
    assistantContent: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    userImages?: TurnImageAttachment[];
    skipCostAudit?: boolean;
}): Promise<void> {
    const {
        logMessage,
        incrementCostAudit,
        sessionId,
        userLogContent,
        assistantContent,
        model,
        tokensIn,
        tokensOut,
        costUsd,
        userImages = [],
        skipCostAudit = false,
    } = params;

    await logMessage(sessionId, 'user', userLogContent, 0, 0, 0, userImages);
    await logMessage(sessionId, 'assistant', assistantContent, tokensIn, tokensOut, costUsd);

    if (!skipCostAudit && (tokensIn > 0 || tokensOut > 0)) {
        await incrementCostAudit({
            sessionId,
            model,
            tokensIn,
            tokensOut,
            costUsd,
        });
    }
}
