import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    classifyVoiceInputStartFailure,
    detectVoiceInputUnavailableReason,
    type VoiceInputEnvironment,
} from '@/lib/voice-input-support';

function buildEnvironment(overrides: Partial<VoiceInputEnvironment> = {}): VoiceInputEnvironment {
    return {
        hasMediaDevicesApi: true,
        hasMediaRecorder: true,
        isSecureContext: true,
        isEmbedded: false,
        policyAllowsMicrophone: true,
        ...overrides,
    };
}

describe('voice-input-support', () => {
    it('flags insecure contexts before checking browser APIs', () => {
        const reason = detectVoiceInputUnavailableReason(buildEnvironment({
            isSecureContext: false,
            hasMediaDevicesApi: false,
            hasMediaRecorder: false,
        }));

        assert.equal(reason, 'insecure_context');
    });

    it('flags embedded microphone policy blocks', () => {
        const reason = detectVoiceInputUnavailableReason(buildEnvironment({
            isEmbedded: true,
            policyAllowsMicrophone: false,
        }));

        assert.equal(reason, 'embed_permission_policy');
    });

    it('flags unsupported browsers when required APIs are missing', () => {
        const reason = detectVoiceInputUnavailableReason(buildEnvironment({
            hasMediaRecorder: false,
        }));

        assert.equal(reason, 'browser_unsupported');
    });

    it('maps embedded NotAllowedError failures to iframe policy blocks', () => {
        const error = new Error('Permission denied');
        error.name = 'NotAllowedError';

        const reason = classifyVoiceInputStartFailure({
            error,
            environment: buildEnvironment({
                isEmbedded: true,
                policyAllowsMicrophone: false,
            }),
        });

        assert.equal(reason, 'embed_permission_policy');
    });

    it('maps non-embedded NotAllowedError failures to user permission denial', () => {
        const error = new Error('Permission denied by user');
        error.name = 'NotAllowedError';

        const reason = classifyVoiceInputStartFailure({
            error,
            environment: buildEnvironment(),
        });

        assert.equal(reason, 'permission_denied');
    });

    it('maps missing device errors to no microphone', () => {
        const error = new Error('Requested device not found');
        error.name = 'NotFoundError';

        const reason = classifyVoiceInputStartFailure({
            error,
            environment: buildEnvironment(),
        });

        assert.equal(reason, 'no_microphone');
    });
});
