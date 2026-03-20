export type ChatPrimaryActionMode =
    | 'evaluate'
    | 'reevaluate'
    | 'end'
    | 'view_evaluation';

export type ChatPrimaryActionInput = {
    hasStarted: boolean;
    sessionEnded: boolean;
    hasEvaluator: boolean;
    hasEvaluationResult: boolean;
    viewerRole: 'ADMIN' | 'ORG_ADMIN' | 'USER';
};

export function resolveChatPrimaryAction(input: ChatPrimaryActionInput): ChatPrimaryActionMode | null {
    if (!input.hasStarted) return null;

    if (!input.sessionEnded) {
        return input.hasEvaluator ? 'evaluate' : 'end';
    }

    if (input.hasEvaluationResult) {
        if (input.viewerRole === 'ADMIN' && input.hasEvaluator) {
            return 'reevaluate';
        }
        return 'view_evaluation';
    }

    if (input.hasEvaluator) {
        return 'evaluate';
    }

    return null;
}
