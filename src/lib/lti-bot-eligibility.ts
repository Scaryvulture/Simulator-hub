import type { Prisma } from '@prisma/client'

const LTI_INELIGIBLE_BOT_TYPE = 'EVALUATOR'

export function buildLtiEligibleBotWhere(base: Prisma.BotWhereInput = {}): Prisma.BotWhereInput {
    return {
        AND: [
            base,
            {
                bot_type: {
                    not: LTI_INELIGIBLE_BOT_TYPE,
                },
            },
        ],
    }
}
