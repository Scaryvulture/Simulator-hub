'use client';

import { Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DetectionStepEditor } from './detection-step-editor';
import { HelpTooltip } from './help-tooltip';
import type { BotConfig } from '@/lib/schemas/bot-config';
import type { FlowStep, SessionVarConfig } from './flow-editor';
import type { StrategyEditorProps } from './strategy-fields-model';
import { strategyLabels, strategyPlaceholders } from './strategy-fields-model';
import {
    GlobalBlockersEditor,
    LocalTextarea,
    STRATEGY_CARD_CLASS,
    STRATEGY_CARD_CONTENT_CLASS,
    STRATEGY_EDITOR_SURFACE_CLASS,
    STRATEGY_FIELD_LABEL_CLASS,
    STRATEGY_INPUT_CLASS,
    StrategyCountBadge,
    StrategyImageTriggersSection,
    StrategyIntroMessageSection,
    STRATEGY_MONO_TEXTAREA_CLASS,
    STRATEGY_SUBPANEL_CLASS,
    TemplateTextareaWithVariables,
    getStrategyHeaderClass,
} from './strategy-fields-shared';
import { StrategyEditorSection, StrategyEditorShell } from './strategy-editor-shell';

export function DetectorStrategyFields({ config, onChange, lang }: StrategyEditorProps) {
    const labels = strategyLabels[lang];
    const placeholders = strategyPlaceholders[lang];
    const detectorOptions = (config.detector_options || {}) as {
        reference_mode?: 'step_flags' | 'single_priority' | 'none';
        include_reference_in_final_report?: boolean;
        correction_reclassify_enabled?: boolean;
        correction_requires_new_image?: boolean;
        correction_patterns?: string[];
        final_verdict_template?: string;
        verdict_labels?: {
            habilitado?: string;
            habilitado_con_observaciones?: string;
            no_habilitado?: string;
            informacion_insuficiente?: string;
        };
    };

    const updateDetectorOptions = (updates: Partial<typeof detectorOptions>) => {
        onChange({
            ...config,
            detector_options: {
                ...detectorOptions,
                ...updates,
            } as BotConfig['detector_options'],
        });
    };

    const stepDataVariables = Array.from(new Set(
        ((config.detection_steps || []) as Array<{ id?: string }>)
            .map((step) => (typeof step.id === 'string' ? step.id.trim() : ''))
            .filter(Boolean)
            .map((stepId) => `data.${stepId}`)
    ));
    const baseTemplateVariables = lang === 'es'
        ? [
            'veredicto',
            'severidad_global',
            'hallazgos_total',
            'hallazgos_critical',
            'hallazgos_warning',
            'hallazgos_uncertain',
            'hallazgos_ok',
            'hallazgos_no_ok',
            'hallazgos_ok_detalle',
            'proximo_paso',
            'proxima_accion',
            'datos_relevados',
            'referencia_visual',
        ]
        : [
            'veredicto',
            'global_severity',
            'findings_total',
            'findings_critical',
            'findings_warning',
            'findings_uncertain',
            'findings_ok',
            'findings_not_ok',
            'findings_ok_detail',
            'next_step',
            'next_action',
            'data',
            'visual_reference',
        ];
    const templateVariables = [...baseTemplateVariables, ...stepDataVariables];
    const detectionStepCount = ((config.detection_steps || []) as Array<{ id?: string }>).length;
    const globalTriggerCount = ((config.global_triggers || []) as FlowStep[]).length;
    const imageTriggerCount = ((config.image_triggers || []) as NonNullable<BotConfig['image_triggers']>).length;

    return (
        <StrategyEditorShell strategy="DETECTOR">
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
                title={labels.detector}
                tone="emerald"
                summary={(
                    <>
                        <StrategyCountBadge tone="emerald">
                            {detectionStepCount} {lang === 'es' ? 'paso(s)' : 'step(s)'}
                        </StrategyCountBadge>
                        {detectorOptions.reference_mode ? (
                            <StrategyCountBadge tone="slate">
                                {lang === 'es' ? 'refs activas' : 'refs active'}
                            </StrategyCountBadge>
                        ) : null}
                    </>
                )}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <Card className={STRATEGY_CARD_CLASS}>
                        <CardHeader className={getStrategyHeaderClass('emerald')}>
                            <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                <Brain className="h-4 w-4 text-emerald-600" />
                                {labels.detector}
                                <HelpTooltip
                                    title={lang === 'es' ? 'Detector' : 'Detector'}
                                    content={lang === 'es'
                                        ? 'Definí pasos de validación (texto/imagen) y feedback por severidad para un flujo guiado de detección.'
                                        : 'Define validation steps (text/image) and severity-based feedback for a guided detection flow.'}
                                />
                            </CardTitle>
                        </CardHeader>
                        <CardContent className={STRATEGY_CARD_CONTENT_CLASS}>
                            <div>
                                <Label className={`${STRATEGY_FIELD_LABEL_CLASS} mb-2 block`}>
                                    {labels.detection_criteria}
                                </Label>
                                <LocalTextarea
                                    value={config.detection_criteria || ''}
                                    onCommit={(value) => onChange({ ...config, detection_criteria: value })}
                                    placeholder={placeholders.detection_criteria}
                                    className={`${STRATEGY_MONO_TEXTAREA_CLASS} h-28 text-xs`}
                                />
                            </div>

                            <div className={STRATEGY_SUBPANEL_CLASS}>
                                <div className="text-xs font-semibold text-slate-700">
                                    {lang === 'es' ? 'Opciones avanzadas (opcionales)' : 'Advanced options (optional)'}
                                </div>

                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <div className="space-y-1">
                                        <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 flex items-center gap-1">
                                            {lang === 'es' ? 'Política de referencias visuales' : 'Visual reference policy'}
                                            <HelpTooltip
                                                title={lang === 'es' ? 'Política de referencias visuales' : 'Visual reference policy'}
                                                content={lang === 'es'
                                                    ? 'Define cómo se muestran imágenes de referencia en respuestas y reporte final. "1 por prioridad" limita a una sola referencia y prioriza CRITICAL > WARNING > UNCERTAIN; "Por paso" respeta los checks "Mostrar Ref." de cada paso; "No mostrar" desactiva referencias.'
                                                    : 'Controls how reference images appear in responses and final report. "1 by severity priority" limits to one reference and prioritizes CRITICAL > WARNING > UNCERTAIN; "Per-step flags" uses each step "Show Ref." toggles; "Do not show" disables references.'}
                                            />
                                        </Label>
                                        <Select
                                            value={detectorOptions.reference_mode || 'single_priority'}
                                            onValueChange={(value: 'step_flags' | 'single_priority' | 'none') =>
                                                updateDetectorOptions({ reference_mode: value })
                                            }
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="single_priority">
                                                    {lang === 'es' ? '1 por prioridad de severidad' : '1 by severity priority'}
                                                </SelectItem>
                                                <SelectItem value="step_flags">
                                                    {lang === 'es' ? 'Según flags del paso' : 'Per-step flags'}
                                                </SelectItem>
                                                <SelectItem value="none">
                                                    {lang === 'es' ? 'No mostrar referencias' : 'Do not show references'}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                        {lang === 'es'
                                            ? 'Textos de veredicto (opcionales, por defecto se autocompletan)'
                                            : 'Verdict labels (optional, defaults are auto-filled)'}
                                    </Label>
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                        <Input
                                            value={detectorOptions.verdict_labels?.habilitado || ''}
                                            onChange={(e) => updateDetectorOptions({
                                                verdict_labels: {
                                                    ...detectorOptions.verdict_labels,
                                                    habilitado: e.target.value,
                                                },
                                            })}
                                            placeholder={lang === 'es' ? 'HABILITADO' : 'ENABLED'}
                                            className={STRATEGY_INPUT_CLASS}
                                        />
                                        <Input
                                            value={detectorOptions.verdict_labels?.habilitado_con_observaciones || ''}
                                            onChange={(e) => updateDetectorOptions({
                                                verdict_labels: {
                                                    ...detectorOptions.verdict_labels,
                                                    habilitado_con_observaciones: e.target.value,
                                                },
                                            })}
                                            placeholder={lang === 'es'
                                                ? 'HABILITADO CON OBSERVACIONES'
                                                : 'ENABLED WITH OBSERVATIONS'}
                                            className={STRATEGY_INPUT_CLASS}
                                        />
                                        <Input
                                            value={detectorOptions.verdict_labels?.no_habilitado || ''}
                                            onChange={(e) => updateDetectorOptions({
                                                verdict_labels: {
                                                    ...detectorOptions.verdict_labels,
                                                    no_habilitado: e.target.value,
                                                },
                                            })}
                                            placeholder={lang === 'es' ? 'NO HABILITADO' : 'NOT ENABLED'}
                                            className={STRATEGY_INPUT_CLASS}
                                        />
                                        <Input
                                            value={detectorOptions.verdict_labels?.informacion_insuficiente || ''}
                                            onChange={(e) => updateDetectorOptions({
                                                verdict_labels: {
                                                    ...detectorOptions.verdict_labels,
                                                    informacion_insuficiente: e.target.value,
                                                },
                                            })}
                                            placeholder={lang === 'es'
                                                ? 'INFORMACIÓN INSUFICIENTE'
                                                : 'INSUFFICIENT INFORMATION'}
                                            className={STRATEGY_INPUT_CLASS}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                        {lang === 'es'
                                            ? 'Plantilla del resumen final (editable)'
                                            : 'Final summary template (editable)'}
                                    </Label>
                                    <TemplateTextareaWithVariables
                                        value={detectorOptions.final_verdict_template || ''}
                                        onCommit={(value) => updateDetectorOptions({ final_verdict_template: value })}
                                        placeholder={lang === 'es'
                                            ? 'Ej: Luego de verificar tu andamio, el veredicto es {veredicto}. Severidad: {severidad_global}. Hallazgos críticos: {hallazgos_critical}. Próximo paso: {proximo_paso}.'
                                            : 'Example: After checking your scaffold, the verdict is {veredicto}. Severity: {global_severity}. Critical findings: {findings_critical}. Next step: {next_step}.'}
                                        className={`${STRATEGY_MONO_TEXTAREA_CLASS} min-h-28 text-xs`}
                                        variables={templateVariables}
                                        helper={lang === 'es'
                                            ? 'Tip: si esta plantilla tiene contenido, el chat final mostrará solo este texto renderizado. Hacé clic en una variable para insertarla donde tengas el cursor. Para datos de pasos, usá {data.<id_del_paso>} o los botones data.* disponibles.'
                                            : 'Tip: if this template has content, final chat output will only show this rendered text. Click a variable to insert it at the cursor position. For step data, use {data.<step_id>} or the available data.* buttons.'}
                                    />
                                </div>

                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={detectorOptions.include_reference_in_final_report !== false}
                                        onChange={(e) => updateDetectorOptions({
                                            include_reference_in_final_report: e.target.checked,
                                        })}
                                    />
                                    {lang === 'es'
                                        ? 'Incluir referencia visual en reporte final (máximo 1)'
                                        : 'Include visual reference in final report (max 1)'}
                                </label>

                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={detectorOptions.correction_reclassify_enabled !== false}
                                        onChange={(e) => updateDetectorOptions({
                                            correction_reclassify_enabled: e.target.checked,
                                        })}
                                    />
                                    {lang === 'es'
                                        ? 'Reclasificar automáticamente si el usuario corrige un hallazgo'
                                        : 'Auto-reclassify when user corrects a finding'}
                                </label>

                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={detectorOptions.correction_requires_new_image !== false}
                                        onChange={(e) => updateDetectorOptions({
                                            correction_requires_new_image: e.target.checked,
                                        })}
                                    />
                                    {lang === 'es'
                                        ? 'Al reclasificar, pedir nueva foto de detalle'
                                        : 'After reclassification, request a new detail photo'}
                                </label>

                                <div className="space-y-1">
                                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                                        {lang === 'es'
                                            ? 'Patrones de corrección (separados por coma, opcional)'
                                            : 'Correction patterns (comma-separated, optional)'}
                                    </Label>
                                    <Input
                                        value={(detectorOptions.correction_patterns || []).join(', ')}
                                        onChange={(e) => updateDetectorOptions({
                                            correction_patterns: e.target.value
                                                .split(',')
                                                .map((entry) => entry.trim())
                                                .filter(Boolean),
                                        })}
                                        placeholder={lang === 'es'
                                            ? 'ej: en realidad, eso está mal, te corrijo'
                                            : 'e.g. actually, that is wrong, correction'}
                                        className={STRATEGY_INPUT_CLASS}
                                    />
                                </div>
                            </div>

                            <DetectionStepEditor
                                steps={(config.detection_steps || []) as Array<{
                                    id: string;
                                    order: number;
                                    type: 'text' | 'image';
                                    instruction: string;
                                    required: boolean;
                                    example_image_url?: string;
                                    keywords?: string[];
                                    criteria?: string;
                                    feedback_ok?: string;
                                    feedback_warn?: string;
                                    feedback_block?: string;
                                    feedback_uncertain?: string;
                                    show_ref_on_warn?: boolean;
                                    show_ref_on_block?: boolean;
                                    show_ref_on_uncertain?: boolean;
                                    allow_critical_retry?: boolean;
                                    on_critical?: 'block' | 'continue_flagged';
                                    run_if?: {
                                        var: string;
                                        operator?: 'equals' | 'contains_any' | 'in';
                                        value?: string;
                                        values?: string[];
                                    };
                                }>}
                                onChange={(nextSteps) => onChange({
                                    ...config,
                                    detection_steps: nextSteps as BotConfig['detection_steps'],
                                })}
                                lang={lang}
                            />
                        </CardContent>
                    </Card>
                </div>
            </StrategyEditorSection>

            <StrategyEditorSection
                eyebrow={lang === 'es' ? 'Reglas y automatización' : 'Rules and automation'}
                title={labels.flow_advanced}
                tone="slate"
                summary={globalTriggerCount > 0 ? <StrategyCountBadge tone="orange">{globalTriggerCount} {lang === 'es' ? 'bloqueador(es)' : 'blocker(s)'}</StrategyCountBadge> : null}
            >
                <div className={STRATEGY_EDITOR_SURFACE_CLASS}>
                    <GlobalBlockersEditor
                        globalTriggers={(config.global_triggers || []) as FlowStep[]}
                        sessionVars={(config.session_vars || {}) as Record<string, SessionVarConfig>}
                        onChange={(newGlobals, newVars) => onChange({
                            ...config,
                            global_triggers: newGlobals as BotConfig['global_triggers'],
                            session_vars: newVars as BotConfig['session_vars'],
                        })}
                        lang={lang}
                        title={labels.flow_advanced}
                        tooltipTitle={labels.flow_advanced}
                        tooltipContent={labels.flow_advanced_desc}
                    />
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
