import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

async function loadDisplayModule() {
    return await import('@/lib/conversation-user-display')
}

const labels = {
    anonymous: 'Anonymous',
    notAvailable: 'n/a',
    totaraUserIdLabel: 'Totara User ID',
}

describe('conversation user display', () => {
    it('shows both identities for global admins', async () => {
        const { getConversationUserDisplay } = await loadDisplayModule()

        const display = getConversationUserDisplay(
            {
                appUsername: 'lti_69fdbedf9e33466025044e20',
                totaraUserId: '2',
            },
            'ADMIN',
            labels
        )

        assert.equal(display.primary, 'lti_69fdbedf9e33466025044e20')
        assert.equal(display.secondary, 'Totara User ID: 2')
    })

    it('shows only Totara user id for org admins', async () => {
        const { getConversationUserDisplay } = await loadDisplayModule()

        const display = getConversationUserDisplay(
            {
                appUsername: 'lti_69fdbedf9e33466025044e20',
                totaraUserId: '2',
            },
            'ORG_ADMIN',
            labels
        )

        assert.equal(display.primary, '2')
        assert.equal(display.secondary, null)
    })

    it('falls back to n/a for org admins when Totara identity is not available', async () => {
        const { getConversationUserDisplay } = await loadDisplayModule()

        const display = getConversationUserDisplay(
            {
                appUsername: 'manual_user',
                totaraUserId: null,
            },
            'ORG_ADMIN',
            labels
        )

        assert.equal(display.primary, 'n/a')
        assert.equal(display.secondary, null)
    })
})
