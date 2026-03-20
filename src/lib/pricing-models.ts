import type { BotConfig } from './schemas/bot-config';

export type RuntimePricingModelInput = {
    botType?: string | null;
    config: BotConfig;
    openaiPromptId?: string | null;
};

function cleanModel(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function resolvePrimaryModel(config: BotConfig): string {
    const configuredModel = cleanModel(config.llm_model);
    if (configuredModel) return configuredModel;
    throw new Error('Modelo no configurado: definí llm_model explícitamente.');
}

export function collectRuntimePricingModels(params: RuntimePricingModelInput): string[] {
    const { config } = params;
    return [resolvePrimaryModel(config)];
}
