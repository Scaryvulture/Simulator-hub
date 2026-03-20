// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!connectionString) {
    console.error('DATABASE_URL or DIRECT_URL is required');
    process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    const bots = await prisma.bot.findMany({
        select: { id: true, name: true, bot_type: true }
    });
    const suites = await prisma.qaSuite.findMany({
        select: { id: true, name: true, _count: { select: { cases: true } } }
    });

    console.log('Bots:', JSON.stringify(bots, null, 2));
    console.log('Suites:', JSON.stringify(suites, null, 2));
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
