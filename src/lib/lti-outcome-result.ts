export type LtiOutcomeSyncStatus = 'synced' | 'skipped' | 'failed';

export type LtiOutcomeSyncResult = {
    status: LtiOutcomeSyncStatus;
    scoreGiven: number | null;
    scoreMaximum: number | null;
    lineitemUrl: string | null;
    error: string | null;
    attemptedAt: string;
};

export type PublicLtiOutcomeSyncResult = {
    status: LtiOutcomeSyncStatus;
};

export function toPublicLtiOutcomeSyncResult(
    result: LtiOutcomeSyncResult | null
): PublicLtiOutcomeSyncResult | null {
    if (!result) {
        return null;
    }

    return {
        status: result.status,
    };
}
