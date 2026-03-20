export type LtiLineitemSummary = {
    id: string;
    resourceLinkId: string | null;
};

export function pickLineitemUrlForResourceLink(lineitems: LtiLineitemSummary[], resourceLinkId: string): string {
    const candidates = lineitems.filter((entry) => entry.resourceLinkId === resourceLinkId);
    if (candidates.length === 1) {
        return candidates[0].id;
    }
    if (candidates.length === 0) {
        throw new Error(`No LTI lineitem matched resource_link_id "${resourceLinkId}".`);
    }

    throw new Error(`Multiple LTI lineitems matched resource_link_id "${resourceLinkId}".`);
}

export function buildLtiScorePayload(params: {
    ltiUserId: string;
    scoreGiven: number;
    scoreMaximum: number;
}) {
    return {
        timestamp: new Date().toISOString(),
        scoreGiven: params.scoreGiven,
        scoreMaximum: params.scoreMaximum,
        activityProgress: 'Completed' as const,
        gradingProgress: 'FullyGraded' as const,
        userId: params.ltiUserId,
    };
}
