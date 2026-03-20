import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const MESSAGE_TYPE_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/message_type';
const VERSION_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/version';
const DEPLOYMENT_ID_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/deployment_id';
const ROLES_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/roles';
const CUSTOM_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/custom';
const CONTEXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/context';
const RESOURCE_LINK_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/resource_link';
const EXT_CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/ext';
const AGS_CLAIM = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';

async function loadLtiModule() {
    return await import('@/lib/lti-claims');
}

function createConfig() {
    return {
        issuer: 'https://totara.example.com',
        clientId: 'client-123',
        authLoginUrl: 'https://totara.example.com/auth',
        jwksUrl: 'https://totara.example.com/jwks',
        deploymentId: 'deployment-1',
        orgClaimKeys: ['organization_id'],
    };
}

describe('lti claim parsing', () => {
    it('extracts wrapper org and activity identity from custom/context/resource claims', async () => {
        const { extractLtiIdentity } = await loadLtiModule();

        const identity = extractLtiIdentity({
            sub: 'user-42',
            email: 'Student@Example.com',
            name: 'Ada Lovelace',
            [MESSAGE_TYPE_CLAIM]: 'LtiResourceLinkRequest',
            [VERSION_CLAIM]: 'LTI-1p3',
            [DEPLOYMENT_ID_CLAIM]: 'deployment-1',
            [ROLES_CLAIM]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
            [CUSTOM_CLAIM]: {
                organization_id: '1012',
                organization_name: 'Acme Chile',
            },
            [CONTEXT_CLAIM]: {
                id: 'course-77',
                title: 'Leadership 101',
                label: 'LEAD-101',
            },
            [RESOURCE_LINK_CLAIM]: {
                id: 'activity-999',
                title: 'Simulator A',
            },
            [AGS_CLAIM]: {
                lineitem: 'https://totara.example.com/mod/lti/lineitems/44/lineitem',
                lineitems: 'https://totara.example.com/mod/lti/lineitems',
                scope: [
                    'https://purl.imsglobal.org/spec/lti-ags/scope/score',
                    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
                ],
            },
            [EXT_CLAIM]: {
                user_username: 'ada.lovelace',
            },
        }, createConfig());

        assert.ok(identity);
        assert.equal(identity?.orgSsoId, '1012');
        assert.equal(identity?.orgName, 'Acme Chile');
        assert.equal(identity?.contextId, 'course-77');
        assert.equal(identity?.contextTitle, 'Leadership 101');
        assert.equal(identity?.contextLabel, 'LEAD-101');
        assert.equal(identity?.resourceLinkId, 'activity-999');
        assert.equal(identity?.resourceLinkTitle, 'Simulator A');
        assert.equal(identity?.email, 'student@example.com');
        assert.equal(identity?.ltiUsername, 'ada.lovelace');
        assert.deepEqual(identity?.ags, {
            lineitem: 'https://totara.example.com/mod/lti/lineitems/44/lineitem',
            lineitems: 'https://totara.example.com/mod/lti/lineitems',
            scope: [
                'https://purl.imsglobal.org/spec/lti-ags/scope/score',
                'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
            ],
        });
    });

    it('accepts the standard 1.3.0 LTI version claim used by Totara', async () => {
        const { extractLtiIdentity } = await loadLtiModule();

        const identity = extractLtiIdentity({
            sub: 'user-42',
            email: 'student@example.com',
            [MESSAGE_TYPE_CLAIM]: 'LtiResourceLinkRequest',
            [VERSION_CLAIM]: '1.3.0',
            [DEPLOYMENT_ID_CLAIM]: 'deployment-1',
            [ROLES_CLAIM]: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
            [CUSTOM_CLAIM]: {
                organization_id: '1012',
            },
            [CONTEXT_CLAIM]: {
                id: 'course-77',
            },
            [RESOURCE_LINK_CLAIM]: {
                id: 'activity-999',
            },
        }, createConfig());

        assert.ok(identity);
        assert.equal(identity?.orgSsoId, '1012');
        assert.equal(identity?.resourceLinkId, 'activity-999');
    });

    it('does not infer wrapper organization from context id anymore', async () => {
        const { extractLtiIdentity } = await loadLtiModule();

        const identity = extractLtiIdentity({
            sub: 'user-42',
            [MESSAGE_TYPE_CLAIM]: 'LtiResourceLinkRequest',
            [VERSION_CLAIM]: 'LTI-1p3',
            [DEPLOYMENT_ID_CLAIM]: 'deployment-1',
            [ROLES_CLAIM]: [],
            [CONTEXT_CLAIM]: {
                id: 'course-77',
                title: 'Leadership 101',
            },
            [RESOURCE_LINK_CLAIM]: {
                id: 'activity-999',
                title: 'Simulator A',
            },
        }, createConfig());

        assert.ok(identity);
        assert.equal(identity?.orgSsoId, null);
        assert.equal(identity?.contextId, 'course-77');
    });

    it('rejects launches that do not include a resource link id', async () => {
        const { extractLtiIdentity } = await loadLtiModule();

        const identity = extractLtiIdentity({
            sub: 'user-42',
            [MESSAGE_TYPE_CLAIM]: 'LtiResourceLinkRequest',
            [VERSION_CLAIM]: 'LTI-1p3',
            [DEPLOYMENT_ID_CLAIM]: 'deployment-1',
            [ROLES_CLAIM]: [],
            [CUSTOM_CLAIM]: {
                organization_id: '1012',
            },
            [CONTEXT_CLAIM]: {
                id: 'course-77',
            },
        }, createConfig());

        assert.equal(identity, null);
    });
});
