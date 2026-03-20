import type { BotConfig } from './schemas/bot-config';
import { safeRegex } from './safe-regex';

type FlowStepConfig = NonNullable<BotConfig['flow_steps']>[number];

export type FlowLintSeverity = 'critical' | 'warning';

export interface FlowLintIssue {
    severity: FlowLintSeverity;
    code: string;
    message: string;
    path?: string;
}

export interface FlowLintReport {
    issues: FlowLintIssue[];
    critical_count: number;
    warning_count: number;
}

const NESTED_QUANTIFIER_REGEX = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*]/;
const REDUNDANT_WILDCARD_REGEX = /\.\*.*\.\*/;

function resolveMaxRegexTriggersPerBot(): number {
    const fallback = 120;
    const raw = Number(process.env.FLOW_MAX_REGEX_TRIGGERS || fallback);
    if (!Number.isFinite(raw)) return fallback;
    const normalized = Math.trunc(raw);
    if (normalized < 1) return 1;
    if (normalized > 5000) return 5000;
    return normalized;
}

function normalizePriority(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.trunc(value);
}

function collectTemplateVars(input: string): string[] {
    const vars = new Set<string>();
    const pattern = /\{(\w+)\}/g;
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(input)) !== null) {
        vars.add(match[1]);
    }
    return Array.from(vars);
}

function looksRiskyRegex(pattern: string): boolean {
    if (pattern.length > 180) return true;
    if (NESTED_QUANTIFIER_REGEX.test(pattern)) return true;
    if (REDUNDANT_WILDCARD_REGEX.test(pattern)) return true;
    return false;
}

function findNextStepCycles(stepById: Map<string, FlowStepConfig>): string[][] {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];
    const cycles: string[][] = [];

    function dfs(stepId: string) {
        if (visiting.has(stepId)) {
            const cycleStart = stack.indexOf(stepId);
            const cycle = cycleStart >= 0 ? stack.slice(cycleStart).concat(stepId) : [stepId, stepId];
            cycles.push(cycle);
            return;
        }
        if (visited.has(stepId)) return;

        visiting.add(stepId);
        stack.push(stepId);

        const step = stepById.get(stepId);
        const nextStep = step?.next_step;
        if (nextStep && stepById.has(nextStep)) {
            dfs(nextStep);
        }

        stack.pop();
        visiting.delete(stepId);
        visited.add(stepId);
    }

    for (const stepId of stepById.keys()) {
        dfs(stepId);
    }

    return cycles;
}

export function lintFlowConfig(config: BotConfig): FlowLintReport {
    const issues: FlowLintIssue[] = [];
    const flowSteps = config.flow_steps || [];
    const globalSteps = config.global_triggers || [];
    const allSteps = [
        ...flowSteps.map((step, index) => ({ step, index, group: 'flow_steps' as const })),
        ...globalSteps.map((step, index) => ({ step, index, group: 'global_triggers' as const })),
    ];
    const sessionVars = new Set(Object.keys(config.session_vars || {}));

    const addIssue = (issue: FlowLintIssue) => {
        if (issues.length >= 200) return;
        issues.push(issue);
    };

    const maxRegexTriggers = resolveMaxRegexTriggersPerBot();
    let totalRegexTriggers = 0;

    if (allSteps.length === 0) {
        return {
            issues,
            critical_count: 0,
            warning_count: 0,
        };
    }

    const stepIdCount = new Map<string, number>();
    const stepById = new Map<string, FlowStepConfig>();

    allSteps.forEach(({ step, index, group }) => {
        const path = `${group}.${index}.id`;
        if (!step.id || !step.id.trim()) {
            addIssue({
                severity: 'critical',
                code: 'STEP_ID_EMPTY',
                path,
                message: 'Cada paso debe tener un id no vacío.',
            });
            return;
        }

        const count = (stepIdCount.get(step.id) || 0) + 1;
        stepIdCount.set(step.id, count);
        if (!stepById.has(step.id)) {
            stepById.set(step.id, step);
        }
    });

    for (const [stepId, count] of stepIdCount.entries()) {
        if (count > 1) {
            addIssue({
                severity: 'critical',
                code: 'STEP_ID_DUPLICATE',
                path: 'flow_steps',
                message: `El id de paso "${stepId}" está duplicado (${count} veces).`,
            });
        }
    }

    allSteps.forEach(({ step, index, group }) => {
        const stepPath = `${group}.${index}`;
        const stepScope = group === 'global_triggers' ? 'global_triggers' : 'flow_steps';
        if (step.next_step && !stepById.has(step.next_step)) {
            addIssue({
                severity: 'critical',
                code: 'NEXT_STEP_UNKNOWN',
                path: `${stepPath}.next_step`,
                message: `Paso "${step.id}" (${stepScope}) tiene next_step="${step.next_step}" que no existe.`,
            });
        }

        const stepPriority = normalizePriority(step.priority);
        if (stepPriority !== (step.priority || 0)) {
            addIssue({
                severity: 'warning',
                code: 'STEP_PRIORITY_NORMALIZED',
                path: `${stepPath}.priority`,
                message: 'priority de paso se normaliza a entero.',
            });
        }

        if (!Array.isArray(step.triggers) || step.triggers.length === 0) {
            addIssue({
                severity: 'warning',
                code: 'STEP_WITHOUT_TRIGGERS',
                path: `${stepPath}.triggers`,
                message: `El paso "${step.id}" no tiene triggers configurados.`,
            });
        }

        const triggerSignatures = new Set<string>();
        step.triggers.forEach((trigger, triggerIndex) => {
            const triggerPath = `${stepPath}.triggers.${triggerIndex}`;
            const triggerPriority = normalizePriority(trigger.priority);
            if (triggerPriority !== (trigger.priority || 0)) {
                addIssue({
                    severity: 'warning',
                    code: 'TRIGGER_PRIORITY_NORMALIZED',
                    path: `${triggerPath}.priority`,
                    message: 'priority de trigger se normaliza a entero.',
                });
            }

            const signature = JSON.stringify({
                type: trigger.type,
                pattern: trigger.pattern || '',
                step_id: trigger.step_id || '',
                condition: trigger.condition || null,
                phrase_list: trigger.phrase_list || null,
            });
            if (triggerSignatures.has(signature)) {
                addIssue({
                    severity: 'warning',
                    code: 'TRIGGER_DUPLICATE',
                    path: triggerPath,
                    message: `Trigger duplicado en el paso "${step.id}".`,
                });
            } else {
                triggerSignatures.add(signature);
            }

            if (trigger.type === 'REGEX') {
                totalRegexTriggers += 1;
                const pattern = (trigger.pattern || '').trim();
                if (!pattern) {
                    addIssue({
                        severity: 'warning',
                        code: 'REGEX_EMPTY',
                        path: `${triggerPath}.pattern`,
                        message: `Trigger REGEX vacío en el paso "${step.id}".`,
                    });
                } else {
                    const safe = safeRegex(pattern, trigger.flags || 'i');
                    if (!safe) {
                        addIssue({
                            severity: 'critical',
                            code: 'REGEX_INVALID',
                            path: `${triggerPath}.pattern`,
                            message: `Regex inválida, demasiado larga o insegura en "${step.id}".`,
                        });
                    }

                    if (safe && looksRiskyRegex(pattern)) {
                        addIssue({
                            severity: 'warning',
                            code: 'REGEX_RISKY',
                            path: `${triggerPath}.pattern`,
                            message: `Regex potencialmente costosa en "${step.id}".`,
                        });
                    }
                }
            }

            if (trigger.type === 'AFTER_STEP' && trigger.step_id && !stepById.has(trigger.step_id)) {
                addIssue({
                    severity: 'critical',
                    code: 'AFTER_STEP_UNKNOWN',
                    path: `${triggerPath}.step_id`,
                    message: `Paso "${step.id}" (${stepScope}) tiene AFTER_STEP en trigger #${triggerIndex + 1} con step_id="${trigger.step_id}" inexistente.`,
                });
            }

            if (trigger.type === 'PHRASE_LIST') {
                const phrases = trigger.phrase_list?.phrases || [];
                if (!phrases.some((phrase) => phrase.trim() !== '')) {
                    addIssue({
                        severity: 'warning',
                        code: 'PHRASE_LIST_EMPTY',
                        path: `${triggerPath}.phrase_list.phrases`,
                        message: `PHRASE_LIST sin frases en "${step.id}".`,
                    });
                }
            }

            if (group === 'global_triggers' && trigger.type === 'DEFAULT') {
                addIssue({
                    severity: 'warning',
                    code: 'GLOBAL_DEFAULT_TRIGGER',
                    path: triggerPath,
                    message: `DEFAULT en global_triggers (${step.id}) puede interceptar todos los turnos.`,
                });
            }
        });

        const templateSources: Array<{ key: string; value?: string }> = [
            { key: 'message', value: step.message },
            { key: 'llm_context', value: step.llm_context },
            { key: 'rag_action.query_template', value: step.rag_action?.query_template },
        ];

        templateSources.forEach((source) => {
            if (!source.value || !source.value.includes('{')) return;
            collectTemplateVars(source.value).forEach((varName) => {
                if (sessionVars.has(varName)) return;
                addIssue({
                    severity: 'warning',
                    code: 'TEMPLATE_VAR_UNDEFINED',
                    path: `${stepPath}.${source.key}`,
                    message: `Variable "{${varName}}" no está definida en session_vars.`,
                });
            });
        });
    });

    if (totalRegexTriggers > maxRegexTriggers) {
        addIssue({
            severity: 'critical',
            code: 'REGEX_TRIGGER_LIMIT_EXCEEDED',
            path: 'flow_steps',
            message: `Cantidad de triggers REGEX demasiado alta (${totalRegexTriggers}). Máximo permitido: ${maxRegexTriggers}.`,
        });
    }

    const cycles = findNextStepCycles(stepById);
    cycles.forEach((cycle) => {
        addIssue({
            severity: 'warning',
            code: 'NEXT_STEP_CYCLE',
            path: 'flow_steps',
            message: `Ciclo detectado en next_step: ${cycle.join(' -> ')}`,
        });
    });

    const critical_count = issues.filter((issue) => issue.severity === 'critical').length;
    const warning_count = issues.filter((issue) => issue.severity === 'warning').length;

    return {
        issues,
        critical_count,
        warning_count,
    };
}

export function formatCriticalFlowLintError(report: FlowLintReport, title: string): string {
    const critical = report.issues.filter((issue) => issue.severity === 'critical');
    if (critical.length === 0) return title;
    const lines = critical.slice(0, 5).map((issue) =>
        issue.path
            ? `- ${issue.message} [${issue.path}]`
            : `- ${issue.message}`
    );
    const extra = critical.length > 5 ? `\n- ... y ${critical.length - 5} más` : '';
    return `${title}\n${lines.join('\n')}${extra}`;
}
