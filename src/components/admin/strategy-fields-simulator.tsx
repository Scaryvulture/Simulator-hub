'use client';

import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FlowEditor, type FlowStep, type SessionVarConfig } from './flow-editor';
import { HelpTooltip } from './help-tooltip';
import type { BotConfig } from '@/lib/schemas/bot-config';
import type { StrategyEditorProps } from './strategy-fields-model';
import { strategyLabels, strategyPlaceholders } from './strategy-fields-model';
import {
    STRATEGY_EDITOR_SURFACE_CLASS,
    STRATEGY_CARD_CLASS,
    STRATEGY_CARD_CONTENT_CLASS,
    StrategyCountBadge,
    StrategyImageTriggersSection,
    StrategyIntroMessageSection,
    getStrategyHeaderClass,
} from './strategy-fields-shared';
import { StrategyEditorSection, StrategyEditorShell } from './strategy-editor-shell';

export function SimulatorStrategyFields({ config, onChange, lang }: StrategyEditorProps) {
    const labels = strategyLabels[lang];
    const placeholders = strategyPlaceholders[lang];
    const flowSteps = ((config.flow_steps || []) as FlowStep[]).length;
    const globalTriggers = ((config.global_triggers || []) as FlowStep[]).length;
    const imageTriggers = ((config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>).length;

    return (
        <StrategyEditorShell strategy="SIMULATOR">
            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Apertura' : 'Opening'}
                title={labels.intro_message}
                tone="primary"
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <StrategyIntroMessageSection
                        introMessage={config.intro_message}
                        onCommit={(value) => onChange({ ...config, intro_message: value })}
                        labels={labels}
                        placeholders={placeholders}
                        lang={lang}
                        defaultExpanded={true}
                    />
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Núcleo de estrategia' : 'Strategy core'}
                title={labels.simulator}
                tone="indigo"
                summary={(
                    <>
                        <StrategyCountBadge tone="indigo">
                            {flowSteps} {lang === 'es' ? 'paso(s)' : 'step(s)'}
                        </StrategyCountBadge>
                        <StrategyCountBadge tone="slate">
                            {globalTriggers} {lang === 'es' ? 'bloqueador(es)' : 'blocker(s)'}
                        </StrategyCountBadge>
                    </>
                )}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader className={getStrategyHeaderClass('primary')}>
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <Users className="h-4 w-4 text-primary" /> {labels.simulator}
                                <HelpTooltip
                                    title={lang === 'es' ? 'Simulador' : 'Simulator'}
                                    content={lang === 'es'
                                        ? 'Acá diseñás la práctica: variables + pasos del flujo para controlar qué dice y cuándo lo dice el bot.'
                                        : 'Design practice here: variables + flow steps to control what the bot says and when.'}
                                />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                            <FlowEditor
                                steps={(config.flow_steps || []) as FlowStep[]}
                                sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                                globalTriggers={(config.global_triggers || []) as FlowStep[]}
                                lang={lang}
                                onChange={(steps, vars, nextGlobalTriggers) => {
                                    onChange({
                                        ...config,
                                        flow_steps: steps as BotConfig['flow_steps'],
                                        session_vars: vars as BotConfig['session_vars'],
                                        global_triggers: nextGlobalTriggers as BotConfig['global_triggers'],
                                    });
                                }}
                            />
                        </CardContent>
                    </Card>
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Imagen y extras' : 'Image and extras'}
                title={labels.image_triggers}
                tone="slate"
                summary={imageTriggers > 0 ? <StrategyCountBadge tone="primary">{imageTriggers} trigger(s)</StrategyCountBadge> : null}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <StrategyImageTriggersSection
                        triggers={(config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>}
                        onChange={(nextTriggers) => onChange({
                            ...config,
                            image_triggers: nextTriggers as BotConfig['image_triggers'],
                        })}
                        labels={labels}
                        placeholders={placeholders}
                        lang={lang}
                    />
                </div>
            </StrategyEditorSection>
        </StrategyEditorShell>
    );
}
