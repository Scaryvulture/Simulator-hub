'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import type { FlowStep, SessionVarConfig } from './flow-editor';
import type { BotConfig } from '@/lib/schemas/bot-config';
import { parseListInput } from '@/lib/utils';
import type { StrategyEditorProps } from './strategy-fields-model';
import { strategyLabels, strategyPlaceholders } from './strategy-fields-model';
import {
    GlobalBlockersEditor,
    LocalTextarea,
    STRATEGY_CARD_CLASS,
    STRATEGY_CARD_CONTENT_CLASS,
    STRATEGY_EDITOR_SURFACE_CLASS,
    STRATEGY_FIELD_LABEL_CLASS,
    STRATEGY_MONO_TEXTAREA_CLASS,
    StrategyCountBadge,
    StrategyImageTriggersSection,
    StrategyIntroMessageSection,
    getStrategyHeaderClass,
} from './strategy-fields-shared';
import { StrategyEditorSection, StrategyEditorShell } from './strategy-editor-shell';

export function GenericStrategyFields({ config, onChange, lang }: StrategyEditorProps) {
    const labels = strategyLabels[lang];
    const placeholders = strategyPlaceholders[lang];
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
    const genericInteraction = (config.generic_interaction || {}) as NonNullable<BotConfig['generic_interaction']>;
    const imageTriggerCount = ((config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>).length;
    const globalTriggerCount = ((config.global_triggers || []) as FlowStep[]).length;

    const toggleSection = (section: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(section)) next.delete(section);
            else next.add(section);
            return next;
        });
    };

    const updateGenericInteraction = (patch: Partial<NonNullable<BotConfig['generic_interaction']>>) => {
        onChange({
            ...config,
            generic_interaction: {
                ...genericInteraction,
                ...patch,
            } as BotConfig['generic_interaction'],
        });
    };

    return (
        <StrategyEditorShell strategy="GENERIC">
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
                eyebrow={lang === 'es' ? 'Reglas y automatización' : 'Rules and automation'}
                title={labels.generic_termination_rules}
                tone="slate"
                summary={(
                    <>
                        {globalTriggerCount > 0 ? (
                            <StrategyCountBadge tone="orange">
                                {globalTriggerCount} {lang === 'es' ? 'bloqueador(es)' : 'blocker(s)'}
                            </StrategyCountBadge>
                        ) : null}
                        {genericInteraction.goodbye_intent_phrases?.length ? (
                            <StrategyCountBadge tone="slate">
                                {genericInteraction.goodbye_intent_phrases.length} {lang === 'es' ? 'intención(es)' : 'intent(s)'}
                            </StrategyCountBadge>
                        ) : null}
                    </>
                )}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader
                            className={getStrategyHeaderClass('slate', true)}
                            onClick={() => toggleSection('generic_end_rules')}
                        >
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-800">
                                    {labels.generic_termination_rules}
                                </CardTitle>
                                {expandedSections.has('generic_end_rules')
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />}
                            </div>
                        </CardHeader>
                        {expandedSections.has('generic_end_rules') && (
                            <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>{labels.generic_goodbye_intents}</Label>
                                    <LocalTextarea
                                        value={(genericInteraction.goodbye_intent_phrases || []).join('\n')}
                                        onCommit={(value) => updateGenericInteraction({
                                            goodbye_intent_phrases: parseListInput(value),
                                        })}
                                        placeholder={placeholders.generic_goodbye_intent_phrases}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-24 text-xs`}
                                    />
                                </div>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>{labels.generic_closing_intents}</Label>
                                    <LocalTextarea
                                        value={(genericInteraction.closing_intent_phrases || []).join('\n')}
                                        onCommit={(value) => updateGenericInteraction({
                                            closing_intent_phrases: parseListInput(value),
                                        })}
                                        placeholder={placeholders.generic_closing_intent_phrases}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-24 text-xs`}
                                    />
                                </div>
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={genericInteraction.ignore_question_messages !== false}
                                        onChange={(e) => updateGenericInteraction({
                                            ignore_question_messages: e.target.checked,
                                        })}
                                    />
                                    {labels.generic_ignore_question_messages}
                                </label>
                            </CardContent>
                        )}
                    </Card>

                    <GlobalBlockersEditor
                        globalTriggers={(config.global_triggers || []) as FlowStep[]}
                        sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                        onChange={(newGlobals, newVars) => onChange({
                            ...config,
                            global_triggers: newGlobals as BotConfig['global_triggers'],
                            session_vars: newVars as BotConfig['session_vars'],
                        })}
                        lang={lang}
                    />
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Cierre' : 'Closing'}
                title={lang === 'es' ? 'Mensajes de cierre' : 'Closing messages'}
                tone="orange"
                summary={(
                    <>
                        {config.goodbye_message ? <StrategyCountBadge tone="orange">Goodbye</StrategyCountBadge> : null}
                        {config.closing_message ? <StrategyCountBadge tone="emerald">Closing</StrategyCountBadge> : null}
                    </>
                )}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader
                            className={getStrategyHeaderClass('slate', true)}
                            onClick={() => toggleSection('generic_messages')}
                        >
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-bold text-slate-800">
                                    {lang === 'es' ? 'Mensajes de Cierre' : 'Closing Messages'}
                                </CardTitle>
                                {expandedSections.has('generic_messages')
                                    ? <ChevronDown className="h-4 w-4" />
                                    : <ChevronRight className="h-4 w-4" />}
                            </div>
                        </CardHeader>
                        {expandedSections.has('generic_messages') && (
                            <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>{labels.goodbye_message}</Label>
                                    <LocalTextarea
                                        value={config.goodbye_message || ''}
                                        onCommit={(value) => onChange({ ...config, goodbye_message: value })}
                                        placeholder={placeholders.goodbye_message}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24 text-xs`}
                                    />
                                </div>
                                <div>
                                    <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-1 block`}>{labels.closing_message}</Label>
                                    <LocalTextarea
                                        value={config.closing_message || ''}
                                        onCommit={(value) => onChange({ ...config, closing_message: value })}
                                        placeholder={placeholders.closing_message}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-24 text-xs`}
                                    />
                                </div>
                            </CardContent>
                        )}
                    </Card>
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Imagen y extras' : 'Image and extras'}
                title={labels.image_triggers}
                tone="slate"
                summary={imageTriggerCount > 0 ? <StrategyCountBadge tone="primary">{imageTriggerCount} trigger(s)</StrategyCountBadge> : null}
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
