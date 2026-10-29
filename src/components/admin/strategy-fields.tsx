'use client';

import type { BotConfig } from '@/lib/schemas/bot-config';
import { DetectorStrategyFields } from './strategy-fields-detector';
import { ExaminerStrategyFields } from './strategy-fields-examiner';
import { GenericStrategyFields } from './strategy-fields-generic';
import { SimulatorStrategyFields } from './strategy-fields-simulator';

interface Props {
    botType: string;
    config: BotConfig;
    onChange: (config: BotConfig) => void;
    lang: 'es' | 'en';
}

export function StrategyFields({ botType, config, onChange, lang }: Props) {
    if (botType === 'SIMULATOR') {
        return <SimulatorStrategyFields config={config} onChange={onChange} lang={lang} />;
    }

    if (botType === 'EXAMINER') {
        return <ExaminerStrategyFields config={config} onChange={onChange} lang={lang} />;
    }

    if (botType === 'DETECTOR') {
        return <DetectorStrategyFields config={config} onChange={onChange} lang={lang} />;
    }

    if (botType === 'GENERIC') {
        return <GenericStrategyFields config={config} onChange={onChange} lang={lang} />;
    }

    return null;
}
