import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function loadLtiModule() {
    return await import('@/lib/lti-login-core');
}

describe('lti login initiation parsing', () => {
    it('accepts a standard OIDC login initiation request with client_id', async () => {
        const { parseLtiLoginInitiationParams } = await loadLtiModule();

        const params = new URLSearchParams({
            iss: 'https://lms.example.edu',
            login_hint: '2',
            target_link_uri: 'https://simulator.example.app/api/auth/lti/launch',
            client_id: 'BpOWbGxFEuDGzBH',
            lti_message_hint: '233',
        });

        assert.deepEqual(parseLtiLoginInitiationParams(params), {
            issuer: 'https://lms.example.edu',
            loginHint: '2',
            targetLinkUri: 'https://simulator.example.app/api/auth/lti/launch',
            clientId: 'BpOWbGxFEuDGzBH',
            ltiMessageHint: '233',
        });
    });

    it('falls back to the configured client id when Totara omits client_id', async () => {
        const { parseLtiLoginInitiationParams } = await loadLtiModule();

        const params = new URLSearchParams({
            iss: 'https://lms.example.edu',
            login_hint: '2',
            target_link_uri: 'https://simulator.example.app/api/auth/lti/launch',
            lti_message_hint: '233',
        });

        assert.deepEqual(parseLtiLoginInitiationParams(params, 'BpOWbGxFEuDGzBH'), {
            issuer: 'https://lms.example.edu',
            loginHint: '2',
            targetLinkUri: 'https://simulator.example.app/api/auth/lti/launch',
            clientId: 'BpOWbGxFEuDGzBH',
            ltiMessageHint: '233',
        });
    });

    it('still rejects login initiation when client_id is missing and no fallback exists', async () => {
        const { parseLtiLoginInitiationParams } = await loadLtiModule();

        const params = new URLSearchParams({
            iss: 'https://lms.example.edu',
            login_hint: '2',
            target_link_uri: 'https://simulator.example.app/api/auth/lti/launch',
            lti_message_hint: '233',
        });

        assert.equal(parseLtiLoginInitiationParams(params), null);
    });
});
