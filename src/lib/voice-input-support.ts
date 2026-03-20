export type VoiceInputUnavailableReason =
    | 'browser_unsupported'
    | 'insecure_context'
    | 'embed_permission_policy';

export type VoiceInputStartFailureReason =
    | VoiceInputUnavailableReason
    | 'permission_denied'
    | 'no_microphone'
    | 'unknown';

export type VoiceInputEnvironment = {
    hasMediaDevicesApi: boolean;
    hasMediaRecorder: boolean;
    isSecureContext: boolean;
    isEmbedded: boolean;
    policyAllowsMicrophone: boolean | null;
};

export function detectVoiceInputUnavailableReason(
    environment: VoiceInputEnvironment
): VoiceInputUnavailableReason | null {
    if (!environment.isSecureContext) {
        return 'insecure_context';
    }

    if (environment.isEmbedded && environment.policyAllowsMicrophone === false) {
        return 'embed_permission_policy';
    }

    if (!environment.hasMediaDevicesApi || !environment.hasMediaRecorder) {
        return 'browser_unsupported';
    }

    return null;
}

export function classifyVoiceInputStartFailure(params: {
    error: unknown;
    environment: Pick<VoiceInputEnvironment, 'isSecureContext' | 'isEmbedded' | 'policyAllowsMicrophone'>;
}): VoiceInputStartFailureReason {
    const { error, environment } = params;

    if (!environment.isSecureContext) {
        return 'insecure_context';
    }

    if (environment.isEmbedded && environment.policyAllowsMicrophone === false) {
        return 'embed_permission_policy';
    }

    const errorName = error instanceof Error ? (error as { name?: string }).name || '' : '';
    const normalizedMessage = error instanceof Error ? error.message.toLowerCase() : '';

    if (errorName === 'NotFoundError' || normalizedMessage.includes('not found')) {
        return 'no_microphone';
    }

    if (
        errorName === 'NotAllowedError'
        || errorName === 'PermissionDeniedError'
        || normalizedMessage.includes('permission')
        || normalizedMessage.includes('denied')
    ) {
        return 'permission_denied';
    }

    if (errorName === 'SecurityError' || normalizedMessage.includes('secure context')) {
        return 'insecure_context';
    }

    if (errorName === 'TypeError') {
        return 'browser_unsupported';
    }

    return 'unknown';
}
