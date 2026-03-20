import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getChatPath } from '@/lib/chat-routes';

describe('chat-routes', () => {
    it('builds the standard chat path by default', () => {
        assert.equal(getChatPath('bot_123'), '/chat/bot_123');
    });

    it('builds the dedicated LTI chat path when requested', () => {
        assert.equal(
            getChatPath('bot_123', { routeMode: 'lti_embedded' }),
            '/lti/chat/bot_123'
        );
    });

    it('preserves the new-session flag for LTI launches', () => {
        assert.equal(
            getChatPath('bot_123', { routeMode: 'lti_embedded', forceNewSession: true }),
            '/lti/chat/bot_123?new=true'
        );
    });

    it('encodes the bot id before building the path', () => {
        assert.equal(
            getChatPath('bot/123?preview=true', { routeMode: 'lti_embedded' }),
            '/lti/chat/bot%2F123%3Fpreview%3Dtrue'
        );
    });
});
