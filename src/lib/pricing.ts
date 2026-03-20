import prisma from './prisma';

export type PricingSource = 'db' | 'env';

type PricingErrorReason = 'invalid_model_name' | 'missing_db_pricing' | 'db_unavailable' | 'invalid_env_pricing';

type ResolvePricingOptions = {
    allowEnvFallback?: boolean;
    requireDatabase?: boolean;
};

export class PricingConfigurationError extends Error {
    readonly modelName: string;
    readonly reason: PricingErrorReason;

    constructor(modelName: string, reason: PricingErrorReason, message: string) {
        super(message);
        this.name = 'PricingConfigurationError';
        this.modelName = modelName;
        this.reason = reason;
    }
}

function normalizeModelName(rawModelName: string): string {
    return String(rawModelName || '').trim();
}

function parseRate(raw: string | undefined): number | null {
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

export class PricingService {
    private static readonly envFallbackWarnedModels = new Set<string>();

    private static isEnvFallbackAllowedByPolicy(): boolean {
        if (process.env.NODE_ENV === 'production') {
            return process.env.PRICING_ALLOW_ENV_FALLBACK_IN_PROD === 'true';
        }
        return process.env.PRICING_ALLOW_ENV_FALLBACK === 'true';
    }

    private static readEnvRates(): { inputRate: number; outputRate: number } | null {
        const inputRate = parseRate(process.env.OPENAI_COST_INPUT_1M);
        const outputRate = parseRate(process.env.OPENAI_COST_OUTPUT_1M);
        if (inputRate === null || outputRate === null) return null;
        return { inputRate, outputRate };
    }

    static async resolvePricingRates(
        modelName: string,
        options: ResolvePricingOptions = {}
    ): Promise<{ inputRate: number; outputRate: number; source: PricingSource }> {
        const normalizedModel = normalizeModelName(modelName);
        if (!normalizedModel) {
            throw new PricingConfigurationError(
                modelName,
                'invalid_model_name',
                'Pricing lookup failed: model name is empty.'
            );
        }

        const allowEnvFallback = options.allowEnvFallback ?? this.isEnvFallbackAllowedByPolicy();
        const requireDatabase = options.requireDatabase === true;

        try {
            const pricing = await prisma.pricingConfig.findUnique({
                where: { model_name: normalizedModel },
            });

            if (pricing) {
                return {
                    inputRate: pricing.input_price_per_million,
                    outputRate: pricing.output_price_per_million,
                    source: 'db',
                };
            }

            if (requireDatabase || !allowEnvFallback) {
                throw new PricingConfigurationError(
                    normalizedModel,
                    'missing_db_pricing',
                    `Missing DB pricing for model "${normalizedModel}".`
                );
            }
        } catch (error) {
            if (error instanceof PricingConfigurationError) {
                throw error;
            }

            if (requireDatabase || !allowEnvFallback) {
                throw new PricingConfigurationError(
                    normalizedModel,
                    'db_unavailable',
                    `Unable to read DB pricing for model "${normalizedModel}".`
                );
            }

            console.warn(
                `[pricing] DB lookup failed for model "${normalizedModel}". Trying env fallback.`,
                error
            );
        }

        const envRates = this.readEnvRates();
        if (!envRates) {
            throw new PricingConfigurationError(
                normalizedModel,
                'invalid_env_pricing',
                `Missing env pricing fallback for model "${normalizedModel}" (OPENAI_COST_INPUT_1M / OPENAI_COST_OUTPUT_1M).`
            );
        }

        if (!this.envFallbackWarnedModels.has(normalizedModel)) {
            console.warn(
                `[pricing] Using ENV pricing fallback for model "${normalizedModel}".`
            );
            this.envFallbackWarnedModels.add(normalizedModel);
        }

        return {
            inputRate: envRates.inputRate,
            outputRate: envRates.outputRate,
            source: 'env',
        };
    }

    static async calculateCost(modelName: string, tokensIn: number, tokensOut: number): Promise<number> {
        const { inputRate, outputRate } = await this.resolvePricingRates(modelName);

        const safeTokensIn = Number.isFinite(tokensIn) ? Math.max(0, tokensIn) : 0;
        const safeTokensOut = Number.isFinite(tokensOut) ? Math.max(0, tokensOut) : 0;

        return (safeTokensIn * inputRate / 1_000_000) + (safeTokensOut * outputRate / 1_000_000);
    }

    static async findMissingDatabaseModels(models: string[]): Promise<string[]> {
        const uniqueModels = Array.from(new Set(
            models
                .map((model) => normalizeModelName(model))
                .filter(Boolean)
        ));

        if (uniqueModels.length === 0) return [];

        const rows = await prisma.pricingConfig.findMany({
            where: { model_name: { in: uniqueModels } },
            select: { model_name: true },
        });

        const configured = new Set(rows.map((row) => row.model_name));
        return uniqueModels.filter((model) => !configured.has(model));
    }

    static async assertDatabasePricingForModels(models: string[], context: string): Promise<void> {
        const missing = await this.findMissingDatabaseModels(models);
        if (missing.length === 0) return;

        throw new Error(
            `[pricing] Missing DB pricing for ${context}: ${missing.join(', ')}`
        );
    }
}
