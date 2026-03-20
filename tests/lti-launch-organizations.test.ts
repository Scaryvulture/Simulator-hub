import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

async function loadModule() {
    return await import('@/lib/lti-launch-organizations-core');
}

describe('lti reporting scope', () => {
    it('uses the base organization when no reporting override is configured', async () => {
        const { resolveLtiReportingScope } = await loadModule();

        const scope = resolveLtiReportingScope({
            baseOrganizationId: 'org-base',
            reportingOrganizationId: null,
        });

        assert.deepEqual(scope, {
            reportingOrganizationId: 'org-base',
            requiresAdditionalMembership: false,
        });
    });

    it('uses the configured reporting organization when an override exists', async () => {
        const { resolveLtiReportingScope } = await loadModule();

        const scope = resolveLtiReportingScope({
            baseOrganizationId: 'org-base',
            reportingOrganizationId: 'org-reporting',
        });

        assert.deepEqual(scope, {
            reportingOrganizationId: 'org-reporting',
            requiresAdditionalMembership: true,
        });
    });

    it('trims reporting override values before resolving the effective scope', async () => {
        const { resolveLtiReportingScope } = await loadModule();

        const scope = resolveLtiReportingScope({
            baseOrganizationId: 'org-base',
            reportingOrganizationId: '  org-reporting  ',
        });

        assert.deepEqual(scope, {
            reportingOrganizationId: 'org-reporting',
            requiresAdditionalMembership: true,
        });
    });
});
