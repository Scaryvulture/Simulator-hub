import assert from 'node:assert/strict';
import test from 'node:test';
import { isWorkspaceThemeForcedPath } from '@/lib/theme-routing';

test('isWorkspaceThemeForcedPath forces light mode on authenticated workspace routes', () => {
    assert.equal(isWorkspaceThemeForcedPath('/'), true);
    assert.equal(isWorkspaceThemeForcedPath('/admin'), true);
    assert.equal(isWorkspaceThemeForcedPath('/admin/bots/123'), true);
    assert.equal(isWorkspaceThemeForcedPath('/conversations'), true);
    assert.equal(isWorkspaceThemeForcedPath('/conversations/abc'), true);
    assert.equal(isWorkspaceThemeForcedPath('/chat/bot-1'), true);
    assert.equal(isWorkspaceThemeForcedPath('/lti/chat/bot-1'), true);
    assert.equal(isWorkspaceThemeForcedPath('/login'), false);
    assert.equal(isWorkspaceThemeForcedPath(undefined), false);
});
