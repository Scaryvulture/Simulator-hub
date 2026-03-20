
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
    if (process.env.ALLOW_QA_SAFE_TEST_MUTATIONS !== 'true') {
        throw new Error('Refusing to mutate data. Set ALLOW_QA_SAFE_TEST_MUTATIONS=true to run this script.');
    }

    // 1. Optional targeted cleanup (only by explicit suite id)
    const suiteIdToDelete = process.env.QA_DELETE_SUITE_ID?.trim();
    if (suiteIdToDelete) {
        await prisma.qaSuite.delete({ where: { id: suiteIdToDelete } });
        console.log(`Deleted suite by id: ${suiteIdToDelete}`);
    } else {
        console.log('QA_DELETE_SUITE_ID not set. Skipping deletion step.');
    }

    // 2. Create a safe, empty suite
    const suite = await prisma.qaSuite.create({
        data: {
            name: 'Safe Test Suite (1 case)',
            description: 'Created for safe verification of QA Lab functionality',
            gate_config: {},
            run_config: {},
            // Assign to the admin user if possible, but finding one first is safer
            created_by: (await prisma.appUser.findFirst({ where: { role: 'ADMIN' } }))?.id
        }
    });

    console.log(`Created suite: ${suite.name}`);

    // 3. Create a single test case
    const qaCase = await prisma.qaCase.create({
        data: {
            suite_id: suite.id,
            name: 'Basic Greeting Test',
            input_messages: ['Hola, funciona este bot?'],
            expected_rules: {
                required_substrings: ['hola', 'seguro'], // Example expectation, might fail but that's ok for testing the runner
                max_latency_ms: 5000
            },
            judge_mode: 'DETERMINISTIC'
        }
    });

    console.log(`Created case: ${qaCase.name}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
