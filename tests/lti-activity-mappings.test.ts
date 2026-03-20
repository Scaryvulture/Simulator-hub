import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function loadMappingModule() {
    return await import('@/lib/lti-activity-mapping-core');
}

describe('lti activity mapping helpers', () => {
    it('builds deterministic wrapper organization names with a friendly label', async () => {
        const { buildLtiWrapperOrganizationName } = await loadMappingModule();

        assert.equal(
            buildLtiWrapperOrganizationName({
                issuer: 'https://totara.example.com',
                orgSsoId: '1012',
                orgName: 'Acme Chile',
            }),
            'totara.example.com | Acme Chile | org:1012'
        );
    });

    it('falls back to issuer plus org id when no friendly org name is available', async () => {
        const { buildLtiWrapperOrganizationName, normalizeLtiDeploymentId } = await loadMappingModule();

        assert.equal(
            buildLtiWrapperOrganizationName({
                issuer: 'https://totara.example.com',
                orgSsoId: '1012',
            }),
            'totara.example.com | org:1012'
        );
        assert.equal(normalizeLtiDeploymentId(null), '');
        assert.equal(normalizeLtiDeploymentId(' deploy-1 '), 'deploy-1');
    });

    it('respects the auto-create feature flag', async () => {
        const { shouldAutoCreateLtiWrapperOrganizations } = await loadMappingModule();
        const previous = process.env.LTI_ORG_AUTO_CREATE_ENABLED;

        try {
            process.env.LTI_ORG_AUTO_CREATE_ENABLED = 'false';
            assert.equal(shouldAutoCreateLtiWrapperOrganizations(), false);

            process.env.LTI_ORG_AUTO_CREATE_ENABLED = 'true';
            assert.equal(shouldAutoCreateLtiWrapperOrganizations(), true);
        } finally {
            if (previous === undefined) {
                delete process.env.LTI_ORG_AUTO_CREATE_ENABLED;
            } else {
                process.env.LTI_ORG_AUTO_CREATE_ENABLED = previous;
            }
        }
    });
});
