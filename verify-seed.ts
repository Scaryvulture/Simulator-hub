import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
    const bot = await prisma.bot.findUnique({
        where: { id: 'default-bot-001' },
        include: { versions: true }
    })
    console.log(JSON.stringify(bot, null, 2))
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
