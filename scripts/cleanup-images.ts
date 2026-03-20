import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        const HOURS_RETENTION = 48;
        const cutoffDate = new Date(Date.now() - HOURS_RETENTION * 60 * 60 * 1000);

        console.log(`🧹 Starting image cleanup...`);
        console.log(`📅 Cutoff date: ${cutoffDate.toISOString()} (${HOURS_RETENTION} hours ago)`);

        // Update messages older than cutoff that have images
        const result = await prisma.message.updateMany({
            where: {
                created_at: {
                    lt: cutoffDate,
                },
                images: {
                    not: Prisma.DbNull, // Only targets messages that have images
                },
            },
            data: {
                images: Prisma.DbNull, // Clear the images field
            },
        });

        console.log(`✅ Cleanup complete.`);
        console.log(`🗑️  Removed images from ${result.count} older messages.`);

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
