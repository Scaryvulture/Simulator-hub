import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, MessageSquare, AlertTriangle, Zap } from 'lucide-react';
import { HelpTooltip } from './help-tooltip';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface DetectionStep {
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
}

interface Props {
    steps: DetectionStep[];
    onChange: (steps: DetectionStep[]) => void;
    lang: 'es' | 'en';
}

type DetectionEditorIssue = {
    severity: 'critical' | 'warning';
    stepIndex: number;
    message: string;
};

export function DetectionStepEditor({ steps = [], onChange, lang }: Props) {
    const t = {
        add_step: lang === 'es' ? 'Agregar Paso' : 'Add Step',
        no_steps: lang === 'es' ? 'No hay pasos definidos. El bot no hará nada.' : 'No steps defined. Bot will do nothing.',
        step: lang === 'es' ? 'Paso' : 'Step',
        step_id: lang === 'es' ? 'ID / Slug del paso' : 'Step ID / Slug',
        step_id_ph: lang === 'es' ? 'Ej: scaffold_type' : 'E.g. scaffold_type',
        instruction: lang === 'es' ? 'Instrucción / Pregunta' : 'Instruction / Question',
        instruction_ph: lang === 'es' ? 'Ej: ¿El andamio es fijo o móvil?' : 'E.g. Is the scaffold fixed or mobile?',
        image_url: lang === 'es' ? 'URL Imagen de Ejemplo (Opcional)' : 'Example Image URL (Optional)',
        image_url_ph: lang === 'es' ? 'https://...' : 'https://...',
        type: lang === 'es' ? 'Tipo de Entrada' : 'Input Type',
        text: lang === 'es' ? 'Texto' : 'Text',
        image: lang === 'es' ? 'Imagen' : 'Image',
        keywords: lang === 'es' ? 'Palabras Clave (Fuzzy Match)' : 'Keywords (Fuzzy Match)',
        keywords_ph: lang === 'es' ? 'Escribí y enter...' : 'Type and enter...',
        criteria: lang === 'es' ? 'Criterios de Visión (Prompt)' : 'Vision Criteria (Prompt)',
        criteria_ph: lang === 'es' ? 'Describe qué debe buscar el modelo en la foto...' : 'Describe what the model should look for...',
        fail_action: lang === 'es' ? 'Acción si falla' : 'Action on Failure',
        block: lang === 'es' ? 'Bloquear (Fin de Sesión)' : 'Block (End Session)',
        warn: lang === 'es' ? 'Advertir (Continuar)' : 'Warn (Continue)',
        allow: lang === 'es' ? 'Permitir (Ignorar)' : 'Allow (Ignore)',
        fail_msg: lang === 'es' ? 'Mensaje de Bloqueo (Opcional)' : 'Block Message (Optional)',
        fail_msg_ph: lang === 'es' ? 'Mensaje a mostrar si se bloquea...' : 'Message to show if blocked...',
        run_if: lang === 'es' ? 'Condición de ejecución (opcional)' : 'Run condition (optional)',
        run_if_var: lang === 'es' ? 'Variable' : 'Variable',
        run_if_operator: lang === 'es' ? 'Operador' : 'Operator',
        run_if_value: lang === 'es' ? 'Valor' : 'Value',
        run_if_values: lang === 'es' ? 'Valores (separados por coma)' : 'Values (comma separated)',
        on_critical: lang === 'es' ? 'Si detecta CRÍTICO' : 'When CRITICAL is detected',
        on_critical_block: lang === 'es' ? 'Bloquear sesión' : 'Block session',
        on_critical_continue: lang === 'es' ? 'Registrar crítico y continuar' : 'Record critical and continue',
    };

    const sanitizeStepId = (raw: string): string => {
        const normalized = raw
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_ -]/g, '')
            .replace(/[\s-]+/g, '_')
            .replace(/^_+|_+$/g, '');
        return normalized;
    };

    const uniqueStepId = (candidateRaw: string, index: number): string => {
        const base = sanitizeStepId(candidateRaw) || `step_${index + 1}`;
        let candidate = base;
        let counter = 2;
        while (steps.some((step, i) => i !== index && step.id === candidate)) {
            candidate = `${base}_${counter}`;
            counter += 1;
        }
        return candidate;
    };

    const getNextDefaultStepId = (): string => {
        let n = steps.length + 1;
        let candidate = `step_${n}`;
        while (steps.some((step) => step.id === candidate)) {
            n += 1;
            candidate = `step_${n}`;
        }
        return candidate;
    };

    const addStep = () => {
        const newStep: DetectionStep = {
            id: getNextDefaultStepId(),
            order: steps.length,
            type: 'text',
            instruction: '',
            required: true,
            example_image_url: '',
            keywords: [],
            on_critical: 'block',
        };
        onChange([...steps, newStep]);
    };

    const updateStep = (index: number, updates: Partial<DetectionStep>) => {
        const newSteps = [...steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        onChange(newSteps);
    };

    const deleteStep = (index: number) => {
        const newSteps = steps.filter((_, i) => i !== index);
        // Re-index orders?
        onChange(newSteps.map((s, i) => ({ ...s, order: i })));
    };

    const moveStep = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === steps.length - 1) return;

        const newSteps = [...steps];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;

        [newSteps[index], newSteps[swapIndex]] = [newSteps[swapIndex], newSteps[index]];

        onChange(newSteps.map((s, i) => ({ ...s, order: i })));
    };

    const normalizeKeyword = (raw: string): string => {
        return raw
            .normalize('NFD')
            .replace(/\p{Diacritic}/gu, '')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
    };

    const splitKeywordInput = (raw: string): string[] => {
        return raw
            .split(/[,\n;|]+/g)
            .map((value) => value.trim())
            .filter(Boolean);
    };

    // Keyword input handler
    const addKeyword = (index: number, value: string) => {
        const step = steps[index];
        if (!value.trim()) return;
        const currentkw = step.keywords || [];
        const seen = new Set(currentkw.map((entry) => normalizeKeyword(entry)));
        const nextKeywords: string[] = [];

        for (const candidate of splitKeywordInput(value)) {
            const normalized = normalizeKeyword(candidate);
            if (!normalized || seen.has(normalized)) continue;
            seen.add(normalized);
            nextKeywords.push(candidate);
        }

        if (nextKeywords.length === 0) return;
        updateStep(index, { keywords: [...currentkw, ...nextKeywords] });
    };

    const removeKeyword = (index: number, kwToDelete: string) => {
        const step = steps[index];
        const currentkw = step.keywords || [];
        updateStep(index, { keywords: currentkw.filter(k => k !== kwToDelete) });
    };

    const parseValues = (raw: string): string[] => {
        return raw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);
    };

    const issues = useMemo<DetectionEditorIssue[]>(() => {
        const next: DetectionEditorIssue[] = [];
        const idCount = new Map<string, number>();

        steps.forEach((step, index) => {
            const stepId = (step.id || '').trim();
            if (!stepId) {
                next.push({
                    severity: 'critical',
                    stepIndex: index,
                    message: lang === 'es'
                        ? 'Este paso no tiene ID.'
                        : 'This step has no ID.',
                });
                return;
            }
            idCount.set(stepId, (idCount.get(stepId) || 0) + 1);
        });

        const duplicateIds = new Set(
            Array.from(idCount.entries())
                .filter(([, count]) => count > 1)
                .map(([stepId]) => stepId)
        );

        steps.forEach((step, index) => {
            const stepId = (step.id || '').trim();
            const label = stepId || `${lang === 'es' ? 'Paso' : 'Step'} #${index + 1}`;

            if (stepId && duplicateIds.has(stepId)) {
                next.push({
                    severity: 'critical',
                    stepIndex: index,
                    message: lang === 'es'
                        ? `ID duplicado: "${stepId}".`
                        : `Duplicated ID: "${stepId}".`,
                });
            }

            if (!(step.instruction || '').trim()) {
                next.push({
                    severity: 'warning',
                    stepIndex: index,
                    message: lang === 'es'
                        ? `${label}: falta la instrucción/pregunta.`
                        : `${label}: instruction/question is empty.`,
                });
            }

            if (step.type === 'text') {
                const keywords = (step.keywords || []).map((value) => value.trim()).filter(Boolean);
                if (keywords.length === 0) {
                    next.push({
                        severity: 'warning',
                        stepIndex: index,
                        message: lang === 'es'
                            ? `${label}: paso de texto sin palabras clave.`
                            : `${label}: text step has no keywords.`,
                    });
                }
            }

            if (step.type === 'image' && !(step.criteria || '').trim()) {
                next.push({
                    severity: 'warning',
                    stepIndex: index,
                    message: lang === 'es'
                        ? `${label}: paso de imagen sin criterio de visión.`
                        : `${label}: image step has no vision criteria.`,
                });
            }

            if (step.run_if) {
                const operator = step.run_if.operator || 'equals';
                const hasVar = (step.run_if.var || '').trim().length > 0;
                const hasEqualsValue = (step.run_if.value || '').trim().length > 0;
                const hasArrayValues = (step.run_if.values || []).some((value) => value.trim() !== '');

                if (!hasVar) {
                    next.push({
                        severity: 'warning',
                        stepIndex: index,
                        message: lang === 'es'
                            ? `${label}: run_if sin variable.`
                            : `${label}: run_if has no variable.`,
                    });
                }

                if (operator === 'equals' && !hasEqualsValue) {
                    next.push({
                        severity: 'warning',
                        stepIndex: index,
                        message: lang === 'es'
                            ? `${label}: run_if equals sin valor.`
                            : `${label}: run_if equals has no value.`,
                    });
                }

                if ((operator === 'contains_any' || operator === 'in') && !hasArrayValues) {
                    next.push({
                        severity: 'warning',
                        stepIndex: index,
                        message: lang === 'es'
                            ? `${label}: run_if ${operator} sin lista de valores.`
                            : `${label}: run_if ${operator} has no values list.`,
                    });
                }
            }
        });

        return next;
    }, [steps, lang]);

    const issuesByStep = useMemo(() => {
        const map = new Map<number, DetectionEditorIssue[]>();
        issues.forEach((issue) => {
            const current = map.get(issue.stepIndex) || [];
            current.push(issue);
            map.set(issue.stepIndex, current);
        });
        return map;
    }, [issues]);

    const focusIssue = (issue: DetectionEditorIssue) => {
        requestAnimationFrame(() => {
            const el = document.querySelector(
                `[data-detection-step-index="${issue.stepIndex}"]`
            ) as HTMLElement | null;
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    const criticalCount = issues.filter((issue) => issue.severity === 'critical').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    return (
        <div className="space-y-4">
            {issues.length > 0 && (
                <Card className={cn(
                    "rounded-xl",
                    criticalCount > 0
                        ? "border-red-300 bg-red-50/70"
                        : "border-amber-300 bg-amber-50/70"
                )}>
                    <CardHeader className={cn(
                        "py-3 px-4 border-b",
                        criticalCount > 0
                            ? "border-red-200"
                            : "border-amber-200"
                    )}>
                        <div className="flex items-center gap-2 text-sm font-bold">
                            {criticalCount > 0 ? <Zap className="h-4 w-4 text-red-600" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
                            <span className={criticalCount > 0 ? 'text-red-700' : 'text-amber-800'}>
                                {criticalCount > 0
                                    ? (lang === 'es'
                                        ? `Pasos del detector con errores críticos (${criticalCount})`
                                        : `Detector steps with critical issues (${criticalCount})`)
                                    : (lang === 'es'
                                        ? `Pasos del detector con warnings (${warningCount})`
                                        : `Detector steps with warnings (${warningCount})`)}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="p-3 space-y-2">
                        {issues.slice(0, 8).map((issue, index) => (
                            <button
                                key={`${issue.stepIndex}-${issue.severity}-${index}`}
                                type="button"
                                onClick={() => focusIssue(issue)}
                                className={cn(
                                    "w-full text-left rounded-lg border bg-white px-3 py-2 text-xs",
                                    issue.severity === 'critical'
                                        ? "border-red-200 text-red-700"
                                        : "border-amber-200 text-amber-800"
                                )}
                            >
                                {issue.message}
                            </button>
                        ))}
                        {issues.length > 8 && (
                            <p className={cn(
                                "text-[11px]",
                                criticalCount > 0 ? "text-red-600" : "text-amber-700"
                            )}>
                                {lang === 'es'
                                    ? `... y ${issues.length - 8} issue(s) más`
                                    : `... and ${issues.length - 8} more issue(s)`}
                            </p>
                        )}
                    </CardContent>
                </Card>
            )}
            {steps.length === 0 && (
                <div className="text-sm text-slate-500 italic p-4 border border-dashed rounded-lg text-center">
                    {t.no_steps}
                </div>
            )}

            {steps.map((step, index) => (
                <Card
                    key={step.id}
                    data-detection-step-index={index}
                    className={cn(
                        "relative group transition-all hover:border-primary/20",
                        (() => {
                            const stepIssues = issuesByStep.get(index) || [];
                            const stepHasCritical = stepIssues.some((issue) => issue.severity === 'critical');
                            const stepHasWarning = stepIssues.some((issue) => issue.severity === 'warning');
                            if (stepHasCritical) return 'border-red-300 bg-red-50/40';
                            if (stepHasWarning) return 'border-amber-300 bg-amber-50/40';
                            return 'border-slate-200';
                        })()
                    )}
                >
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0} onClick={() => moveStep(index, 'up')}>
                            <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled={index === steps.length - 1} onClick={() => moveStep(index, 'down')}>
                            <ArrowDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteStep(index)}>
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>

                    <CardHeader className="py-3 px-4 bg-slate-50/50 border-b border-slate-100 flex flex-row items-center gap-2">
                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-200 text-xs font-bold text-slate-600">
                            {index + 1}
                        </div>
                        <div className="text-sm font-medium text-slate-700">
                            {step.type === 'text' ? (
                                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {t.text}</span>
                            ) : (
                                <span className="flex items-center gap-1"><ImageIcon className="h-3 w-3" /> {t.image}</span>
                            )}
                        </div>
                        {(() => {
                            const stepIssues = issuesByStep.get(index) || [];
                            const stepCritical = stepIssues.filter((issue) => issue.severity === 'critical').length;
                            const stepWarning = stepIssues.filter((issue) => issue.severity === 'warning').length;
                            if (stepCritical === 0 && stepWarning === 0) return null;
                            return (
                                <div className="ml-auto flex items-center gap-1">
                                    {stepCritical > 0 && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                                            {stepCritical} {lang === 'es' ? 'crítico(s)' : 'critical'}
                                        </span>
                                    )}
                                    {stepWarning > 0 && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                                            {stepWarning} warning(s)
                                        </span>
                                    )}
                                </div>
                            );
                        })()}

                    </CardHeader>

                    <CardContent className="p-4 space-y-4">
                        {(() => {
                            const stepIssues = issuesByStep.get(index) || [];
                            if (stepIssues.length === 0) return null;
                            return (
                                <div className={cn(
                                    "rounded-lg border p-2 space-y-1",
                                    stepIssues.some((issue) => issue.severity === 'critical')
                                        ? "border-red-200 bg-red-50/70"
                                        : "border-amber-200 bg-amber-50/70"
                                )}>
                                    {stepIssues.slice(0, 4).map((issue, issueIndex) => (
                                        <p
                                            key={`${issue.severity}-${issueIndex}`}
                                            className={cn(
                                                "text-xs",
                                                issue.severity === 'critical'
                                                    ? "text-red-700"
                                                    : "text-amber-800"
                                            )}
                                        >
                                            • {issue.message}
                                        </p>
                                    ))}
                                    {stepIssues.length > 4 && (
                                        <p className="text-[11px] text-slate-500">
                                            {lang === 'es'
                                                ? `+${stepIssues.length - 4} issue(s) más en este paso`
                                                : `+${stepIssues.length - 4} more issue(s) in this step`}
                                        </p>
                                    )}
                                </div>
                            );
                        })()}
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">{t.step_id}</Label>
                                <Input
                                    value={step.id}
                                    onChange={(e) => updateStep(index, { id: e.target.value })}
                                    onBlur={(e) => updateStep(index, { id: uniqueStepId(e.target.value, index) })}
                                    placeholder={t.step_id_ph}
                                    className="font-mono text-xs"
                                />
                                <p className="text-[10px] text-slate-500">
                                    {lang === 'es'
                                        ? 'Usalo en condiciones run_if.var. Recomendado: minúsculas con guión bajo.'
                                        : 'Use this in run_if.var conditions. Recommended: lowercase with underscores.'}
                                </p>
                            </div>
                            {/* Instruction */}
                            <div className="space-y-1">
                                <Label className="text-xs">{t.instruction}</Label>
                                <Input
                                    value={step.instruction}
                                    onChange={(e) => updateStep(index, { instruction: e.target.value })}
                                    placeholder={t.instruction_ph}
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t.image_url}</Label>
                                <Input
                                    value={step.example_image_url || ''}
                                    onChange={(e) => updateStep(index, { example_image_url: e.target.value })}
                                    placeholder={t.image_url_ph}
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>

                        {/* Type Selection */}
                        <div className="space-y-1">
                            <Label className="text-xs">{t.type}</Label>
                            <Select value={step.type} onValueChange={(v: 'text' | 'image') => updateStep(index, { type: v })}>
                                <SelectTrigger className="h-9">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">{t.text}</SelectItem>
                                    <SelectItem value="image">{t.image}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Step Logic: TEXT */}
                        {step.type === 'text' && (
                            <div className="space-y-1">
                                <Label className="text-xs flex items-center gap-1">
                                    {t.keywords}
                                    <HelpTooltip title={t.keywords} content="Words that allow proceeding. If empty, any text is accepted." />
                                </Label>
                                <div className="flex flex-wrap gap-2 mb-2">
                                    {step.keywords?.map(kw => (
                                        <Badge key={kw} variant="secondary" className="gap-1 pr-1">
                                            {kw}
                                            <div className="cursor-pointer hover:text-red-500" onClick={() => removeKeyword(index, kw)}>×</div>
                                        </Badge>
                                    ))}
                                </div>
                                <Input
                                    placeholder={t.keywords_ph}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            addKeyword(index, e.currentTarget.value);
                                            e.currentTarget.value = '';
                                        }
                                    }}
                                />
                            </div>
                        )}

                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            <Label className="text-xs font-bold text-slate-700">{t.run_if}</Label>
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(step.run_if)}
                                    onChange={(e) => {
                                        if (!e.target.checked) {
                                            updateStep(index, { run_if: undefined });
                                            return;
                                        }
                                        updateStep(index, {
                                            run_if: {
                                                var: '',
                                                operator: 'equals',
                                                value: '',
                                                values: [],
                                            },
                                        });
                                    }}
                                />
                                {lang === 'es' ? 'Ejecutar este paso solo si se cumple la condición' : 'Run this step only when condition is met'}
                            </label>

                            {step.run_if && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-slate-500">{t.run_if_var}</Label>
                                        <Input
                                            value={step.run_if.var || ''}
                                            onChange={(e) => updateStep(index, {
                                                run_if: {
                                                    ...step.run_if,
                                                    var: e.target.value,
                                                },
                                            })}
                                            placeholder={lang === 'es' ? 'Ej: scaffold_type (ID del paso previo)' : 'E.g. scaffold_type (previous step ID)'}
                                            className="h-8 text-xs"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-slate-500">{t.run_if_operator}</Label>
                                        <Select
                                            value={step.run_if.operator || 'equals'}
                                            onValueChange={(value: 'equals' | 'contains_any' | 'in') => updateStep(index, {
                                                run_if: {
                                                    var: step.run_if?.var || '',
                                                    value: step.run_if?.value,
                                                    values: step.run_if?.values,
                                                    operator: value,
                                                },
                                            })}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="equals">equals</SelectItem>
                                                <SelectItem value="contains_any">contains_any</SelectItem>
                                                <SelectItem value="in">in</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {(step.run_if.operator || 'equals') === 'equals' ? (
                                        <div className="md:col-span-2 space-y-1">
                                            <Label className="text-[10px] text-slate-500">{t.run_if_value}</Label>
                                            <Input
                                                value={step.run_if.value || ''}
                                                onChange={(e) => updateStep(index, {
                                                    run_if: {
                                                        var: step.run_if?.var || '',
                                                        operator: step.run_if?.operator || 'equals',
                                                        values: step.run_if?.values,
                                                        value: e.target.value,
                                                    },
                                                })}
                                                placeholder={lang === 'es' ? 'Ej: movil' : 'E.g. mobile'}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    ) : (
                                        <div className="md:col-span-2 space-y-1">
                                            <Label className="text-[10px] text-slate-500">{t.run_if_values}</Label>
                                            <Input
                                                value={(step.run_if.values || []).join(', ')}
                                                onChange={(e) => updateStep(index, {
                                                    run_if: {
                                                        var: step.run_if?.var || '',
                                                        operator: step.run_if?.operator || 'contains_any',
                                                        value: step.run_if?.value,
                                                        values: parseValues(e.target.value),
                                                    },
                                                })}
                                                placeholder={lang === 'es' ? 'Ej: móvil, movíl, con ruedas' : 'E.g. mobile, caster'}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Step Logic: IMAGE (V4 FEEDBACK) */}
                        {step.type === 'image' && (
                            <div className="space-y-4 pt-2 border-t border-slate-100">
                                <div className="space-y-1">
                                    <Label className="text-xs flex items-center gap-1 font-bold text-slate-700">
                                        {t.criteria}
                                        <HelpTooltip title={t.criteria} content="The prompt sent to the Vision model to validate the image." />
                                    </Label>
                                    <Textarea
                                        className="min-h-[100px] font-mono text-xs bg-slate-50"
                                        value={step.criteria || ''}
                                        onChange={(e) => updateStep(index, { criteria: e.target.value })}
                                        placeholder={t.criteria_ph}
                                    />
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-xs font-bold text-slate-700 block border-b border-slate-100 pb-1">
                                        {lang === 'es' ? 'Mensajes de Feedback (Smart Flow)' : 'Feedback Messages (Smart Flow)'}
                                    </Label>

                                    {/* OK Feedback */}
                                    <div className="grid grid-cols-12 gap-2 items-start">
                                        <div className="col-span-3 pt-2">
                                            <Label className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">OK / PASA</Label>
                                        </div>
                                        <div className="col-span-9">
                                            <Textarea
                                                className="h-14 text-xs resize-none"
                                                value={step.feedback_ok || ''}
                                                onChange={(e) => updateStep(index, { feedback_ok: e.target.value })}
                                                placeholder={lang === 'es' ? 'Silencioso (default) o mensaje de éxito.' : 'Silent (default) or success message.'}
                                            />
                                        </div>
                                    </div>

                                    {/* WARN Feedback */}
                                    <div className="grid grid-cols-12 gap-2 items-start">
                                        <div className="col-span-3 pt-2 space-y-2">
                                            <Label className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold">ALERTA</Label>
                                            <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer hover:text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={step.show_ref_on_warn !== false}
                                                    onChange={(e) => updateStep(index, { show_ref_on_warn: e.target.checked })}
                                                />
                                                {lang === 'es' ? 'Mostrar Ref.' : 'Show Ref.'}
                                            </label>
                                        </div>
                                        <div className="col-span-9">
                                            <Textarea
                                                className="h-14 text-xs resize-none border-amber-200 focus:border-amber-400"
                                                value={step.feedback_warn || ''}
                                                onChange={(e) => updateStep(index, { feedback_warn: e.target.value })}
                                                placeholder={lang === 'es' ? 'Mensaje para desvío leve. Usá {explanation}.' : 'Message for minor anomaly. Use {explanation}.'}
                                            />
                                        </div>
                                    </div>

                                    {/* BLOCK Feedback */}
                                    <div className="grid grid-cols-12 gap-2 items-start">
                                        <div className="col-span-3 pt-2 space-y-2">
                                            <Label className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">BLOQUEO</Label>
                                            <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer hover:text-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={step.show_ref_on_block !== false}
                                                    onChange={(e) => updateStep(index, { show_ref_on_block: e.target.checked })}
                                                />
                                                {lang === 'es' ? 'Mostrar Ref.' : 'Show Ref.'}
                                            </label>
                                            <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer hover:text-slate-700 mt-1" title={lang === 'es' ? 'Permite un reintento antes de bloquear definitivamente' : 'Allows one retry before blocking definitely'}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!step.allow_critical_retry}
                                                    onChange={(e) => updateStep(index, { allow_critical_retry: e.target.checked })}
                                                />
                                                {lang === 'es' ? 'Permitir Reintento' : 'Allow Retry'}
                                            </label>
                                            <div className="space-y-1 mt-1">
                                                <Label className="text-[9px] text-slate-500">{t.on_critical}</Label>
                                                <Select
                                                    value={step.on_critical || 'block'}
                                                    onValueChange={(value: 'block' | 'continue_flagged') => updateStep(index, { on_critical: value })}
                                                >
                                                    <SelectTrigger className="h-7 text-[9px]">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="block">{t.on_critical_block}</SelectItem>
                                                        <SelectItem value="continue_flagged">{t.on_critical_continue}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                        <div className="col-span-9">
                                            <Textarea
                                                className="h-14 text-xs resize-none border-red-200 focus:border-red-400"
                                                value={step.feedback_block || ''}
                                                onChange={(e) => updateStep(index, { feedback_block: e.target.value })}
                                                placeholder={lang === 'es' ? 'Mensaje para bloqueo crítico. Usá {explanation}.' : 'Message for critical failure. Use {explanation}.'}
                                            />
                                        </div>
                                    </div>

                                    {/* UNCERTAIN Feedback */}
                                    <div className="grid grid-cols-12 gap-2 items-start">
                                        <div className="col-span-3 pt-2">
                                            <Label className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-bold">DUDOSO</Label>
                                            <label className="flex items-center gap-1 text-[9px] text-slate-500 cursor-pointer hover:text-slate-700 mt-2">
                                                <input
                                                    type="checkbox"
                                                    checked={!!step.show_ref_on_uncertain}
                                                    onChange={(e) => updateStep(index, { show_ref_on_uncertain: e.target.checked })}
                                                />
                                                {lang === 'es' ? 'Mostrar Ref.' : 'Show Ref.'}
                                            </label>
                                        </div>
                                        <div className="col-span-9">
                                            <Textarea
                                                className="h-14 text-xs resize-none border-slate-200"
                                                value={step.feedback_uncertain || ''}
                                                onChange={(e) => updateStep(index, { feedback_uncertain: e.target.value })}
                                                placeholder={lang === 'es' ? 'Mensaje para pedir reintento.' : 'Message to request retry.'}
                                            />
                                        </div>
                                    </div>

                                    <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded -mt-1 border border-slate-100">
                                        💡 <strong>Tip:</strong> {lang === 'es'
                                            ? 'Podés usar "{explanation}" en los mensajes para incluir automáticamente la explicación técnica generada por la IA.'
                                            : 'You can use "{explanation}" in messages to automatically include the technical explanation generated by AI.'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ))}

            <Button onClick={addStep} className="w-full" variant="outline">
                <Plus className="h-4 w-4 mr-2" /> {t.add_step}
            </Button>
        </div>
    );
}
