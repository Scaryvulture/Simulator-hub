import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toPublicLtiOutcomeSyncResult } from '@/lib/lti-outcome-result';
import { buildLtiScorePayload, pickLineitemUrlForResourceLink } from '@/lib/lti-outcomes-core';

describe('lti outcomes helpers', () => {
    it('selects the single line item matching the current resource link', () => {
        const lineitemUrl = pickLineitemUrlForResourceLink([
            {
                id: 'https://totara.example.com/lineitems/10/lineitem',
                resourceLinkId: 'activity-other',
            },
            {
                id: 'https://totara.example.com/lineitems/44/lineitem',
                resourceLinkId: 'activity-999',
            },
        ], 'activity-999');

        assert.equal(lineitemUrl, 'https://totara.example.com/lineitems/44/lineitem');
    });

    it('fails closed when no line item matches the resource link', () => {
        assert.throws(
            () => pickLineitemUrlForResourceLink([
                {
                    id: 'https://totara.example.com/lineitems/10/lineitem',
                    resourceLinkId: 'activity-other',
                },
            ], 'activity-999'),
            /No LTI lineitem matched resource_link_id/
        );
    });

    it('fails closed when multiple line items match the same resource link', () => {
        assert.throws(
            () => pickLineitemUrlForResourceLink([
                {
                    id: 'https://totara.example.com/lineitems/44/lineitem',
                    resourceLinkId: 'activity-999',
                },
                {
                    id: 'https://totara.example.com/lineitems/45/lineitem',
                    resourceLinkId: 'activity-999',
                },
            ], 'activity-999'),
            /Multiple LTI lineitems matched resource_link_id/
        );
    });

    it('builds a final score payload with the expected AGS fields', () => {
        const payload = buildLtiScorePayload({
            ltiUserId: 'learner-42',
            scoreGiven: 83,
            scoreMaximum: 100,
        });

        assert.equal(payload.scoreGiven, 83);
        assert.equal(payload.scoreMaximum, 100);
        assert.equal(payload.activityProgress, 'Completed');
        assert.equal(payload.gradingProgress, 'FullyGraded');
        assert.equal(payload.userId, 'learner-42');
        assert.match(payload.timestamp, /^\d{4}-\d{2}-\d{2}T/);
    });

    it('exposes only sync status to non-admin clients', () => {
        const publicResult = toPublicLtiOutcomeSyncResult({
            status: 'failed',
            scoreGiven: 83,
            scoreMaximum: 100,
            lineitemUrl: 'https://totara.example.com/lineitems/44/lineitem',
            error: 'LTI score publish failed: invalid_scope',
            attemptedAt: '2026-03-20T12:00:00.000Z',
        });

        assert.deepEqual(publicResult, {
            status: 'failed',
        });
    });
});
