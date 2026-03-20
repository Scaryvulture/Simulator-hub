'use server';

import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';
import { verifyAdmin } from '@/lib/auth-utils';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type PricingSeedRow = {
    model_name: string;
    input_price_per_million: number;
    output_price_per_million: number;
};

async function loadPricingSeedRows(): Promise<PricingSeedRow[]> {
    const filePath = path.join(process.cwd(), 'prisma', 'pricing-defaults.json');
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
        throw new Error('pricing-defaults.json must be an array.');
    }

    const rows: PricingSeedRow[] = [];
    for (const [index, item] of parsed.entries()) {
        const source = (item && typeof item === 'object' && !Array.isArray(item))
            ? item as Record<string, unknown>
            : null;
        const modelName = typeof source?.model_name === 'string' ? source.model_name.trim() : '';
        const input = Number(source?.input_price_per_million);
        const output = Number(source?.output_price_per_million);

        if (!modelName) {
            throw new Error(`pricing-defaults.json row ${index} has invalid model_name.`);
        }
        if (!Number.isFinite(input) || input < 0 || !Number.isFinite(output) || output < 0) {
            throw new Error(`pricing-defaults.json row ${index} has invalid pricing values.`);
        }

        rows.push({
            model_name: modelName,
            input_price_per_million: input,
            output_price_per_million: output,
        });
    }

    return rows;
}

export async function getPricingConfigs() {
    await verifyAdmin();
    return await prisma.pricingConfig.findMany({
        orderBy: { model_name: 'asc' },
    });
}

export async function getPricingConfig(modelName: string) {
    await verifyAdmin();
    return await prisma.pricingConfig.findUnique({
        where: { model_name: modelName },
    });
}

export async function upsertPricingConfig(data: {
    model_name: string;
    input_price_per_million: number;
    output_price_per_million: number;
}) {
    await verifyAdmin();

    const config = await prisma.pricingConfig.upsert({
        where: { model_name: data.model_name },
        update: {
            input_price_per_million: data.input_price_per_million,
            output_price_per_million: data.output_price_per_million,
        },
        create: {
            model_name: data.model_name,
            input_price_per_million: data.input_price_per_million,
            output_price_per_million: data.output_price_per_million,
        },
    });

    revalidatePath('/admin/pricing');
    return config;
}

export async function deletePricingConfig(modelName: string) {
    await verifyAdmin();
    await prisma.pricingConfig.delete({
        where: { model_name: modelName },
    });
    revalidatePath('/admin/pricing');
}

// Seed initial pricing data (called once during setup)
export async function seedDefaultPricing() {
    await verifyAdmin();
    const defaults = await loadPricingSeedRows();

    for (const config of defaults) {
        await prisma.pricingConfig.upsert({
            where: { model_name: config.model_name },
            update: config,
            create: config,
        });
    }

    revalidatePath('/admin/pricing');
    return defaults;
}
