import type { FlowLintIssue, FlowLintReport } from '@/lib/flow-linter';

type FlowLintStepRef = {
    id?: string | null;
};

type FlowLintConfigRef = {
    flow_steps?: FlowLintStepRef[] | null;
    global_triggers?: FlowLintStepRef[] | null;
};

function resolveIssueContext(
    issue: FlowLintIssue,
    config: FlowLintConfigRef | null | undefined,
    lang: 'es' | 'en'
): string | null {
    const scopedMatch = issue.path?.match(/^(flow_steps|global_triggers)\.(\d+)(?:\.|$)/);
    if (scopedMatch) {
        const scope = scopedMatch[1] as 'flow_steps' | 'global_triggers';
        const index = Number(scopedMatch[2]);
        const stepRef = scope === 'flow_steps'
            ? config?.flow_steps?.[index]
            : config?.global_triggers?.[index];
        const stepId = typeof stepRef?.id === 'string' ? stepRef.id.trim() : '';
        if (stepId) {
            if (scope === 'flow_steps') {
                return lang === 'es' ? `Paso "${stepId}"` : `Step "${stepId}"`;
            }
            return lang === 'es' ? `Global "${stepId}"` : `Global "${stepId}"`;
        }
        if (scope === 'flow_steps') {
            return lang === 'es' ? `Paso #${index + 1}` : `Step #${index + 1}`;
        }
        return lang === 'es' ? `Global #${index + 1}` : `Global #${index + 1}`;
    }

    const idMatch = issue.message.match(/"([^"]+)"/);
    const referencedId = idMatch?.[1];
    if (referencedId) {
        return lang === 'es' ? `Paso "${referencedId}"` : `Step "${referencedId}"`;
    }

    return null;
}

export function buildFlowWarningDescription(params: {
    report: FlowLintReport;
    config?: FlowLintConfigRef | null;
    lang: 'es' | 'en';
    maxItems?: number;
}): string | null {
    const maxItems = Number.isFinite(params.maxItems) ? Math.max(1, Math.trunc(params.maxItems as number)) : 3;
    const warnings = params.report.issues
        .filter((issue) => issue.severity === 'warning')
        .slice(0, maxItems);

    if (warnings.length === 0) return null;

    const rows = warnings.map((issue) => {
        const context = resolveIssueContext(issue, params.config, params.lang);
        if (context) {
            return `${context}: ${issue.message}`;
        }
        if (issue.path) {
            return `${issue.message} [${issue.path}]`;
        }
        return issue.message;
    });

    const remaining = Math.max(0, params.report.warning_count - warnings.length);
    const extra = remaining > 0
        ? (params.lang === 'es' ? `\n(+${remaining} warning(s) más)` : `\n(+${remaining} more warning(s))`)
        : '';

    return rows.join('\n') + extra;
}
