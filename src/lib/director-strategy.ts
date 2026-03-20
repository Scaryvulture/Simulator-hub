import type { FlowConfig } from './flow-engine';
import type { BotConfig } from './schemas/bot-config';

export type RuntimeStrategy = 'SIMULATOR' | 'EXAMINER' | 'DETECTOR' | 'GENERIC';

export function resolveRuntimeStrategy(botType: string | null | undefined): RuntimeStrategy {
    const normalized = typeof botType === 'string' ? botType.trim().toUpperCase() : '';
    switch (normalized) {
        case 'SIMULATOR':
            return 'SIMULATOR';
        case 'EXAMINER':
            return 'EXAMINER';
        case 'DETECTOR':
            return 'DETECTOR';
        case 'GENERIC':
            return 'GENERIC';
        default:
            return 'GENERIC';
    }
}

export function hasFlowEngineConfig(config: BotConfig): boolean {
    return Boolean(
        (Array.isArray(config.flow_steps) && config.flow_steps.length > 0)
        || (Array.isArray(config.global_triggers) && config.global_triggers.length > 0)
    );
}

export function toFlowConfig(config: BotConfig): FlowConfig {
    return {
        session_vars: config.session_vars as unknown as FlowConfig['session_vars'],
        global_triggers: config.global_triggers as unknown as FlowConfig['global_triggers'],
        flow_steps: config.flow_steps as unknown as FlowConfig['flow_steps'],
    };
}
