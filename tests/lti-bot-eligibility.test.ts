import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

async function loadModule() {
    return await import('@/lib/lti-bot-eligibility')
}

describe('lti bot eligibility', () => {
    it('excludes evaluator bots from LTI launch selectors and validation', async () => {
        const { buildLtiEligibleBotWhere } = await loadModule()

        const where = buildLtiEligibleBotWhere({ deleted_at: null })

        assert.deepEqual(where, {
            AND: [
                { deleted_at: null },
                {
                    bot_type: {
                        not: 'EVALUATOR',
                    },
                },
            ],
        })
    })
})
