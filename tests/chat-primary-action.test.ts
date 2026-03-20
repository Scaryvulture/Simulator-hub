import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveChatPrimaryAction } from '@/lib/chat-primary-action';

describe('chat-primary-action', () => {
    it('returns null before the chat starts', () => {
        const action = resolveChatPrimaryAction({
            hasStarted: false,
            sessionEnded: false,
            hasEvaluator: true,
            hasEvaluationResult: false,
            viewerRole: 'USER',
        });

        assert.equal(action, null);
    });

    it('uses evaluate as the primary action while active when an evaluator exists', () => {
        const action = resolveChatPrimaryAction({
            hasStarted: true,
            sessionEnded: false,
            hasEvaluator: true,
            hasEvaluationResult: false,
            viewerRole: 'USER',
        });

        assert.equal(action, 'evaluate');
    });

    it('uses end as the primary action while active when no evaluator exists', () => {
        const action = resolveChatPrimaryAction({
            hasStarted: true,
            sessionEnded: false,
            hasEvaluator: false,
            hasEvaluationResult: false,
            viewerRole: 'USER',
        });

        assert.equal(action, 'end');
    });

    it('lets admins reevaluate an ended session with an existing result', () => {
        const action = resolveChatPrimaryAction({
            hasStarted: true,
            sessionEnded: true,
            hasEvaluator: true,
            hasEvaluationResult: true,
            viewerRole: 'ADMIN',
        });

        assert.equal(action, 'reevaluate');
    });

    it('lets non-admin viewers reopen an existing evaluation instead of hiding the action', () => {
        const action = resolveChatPrimaryAction({
            hasStarted: true,
            sessionEnded: true,
            hasEvaluator: true,
            hasEvaluationResult: true,
            viewerRole: 'USER',
        });

        assert.equal(action, 'view_evaluation');
    });

    it('returns null for ended sessions without evaluator or stored result', () => {
        const action = resolveChatPrimaryAction({
            hasStarted: true,
            sessionEnded: true,
            hasEvaluator: false,
            hasEvaluationResult: false,
            viewerRole: 'USER',
        });

        assert.equal(action, null);
    });
});
