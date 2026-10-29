import { Calendar, Database, DollarSign, Mic, User } from 'lucide-react';
import { WorkspacePanel } from '@/components/workspace/workspace-panel';

type ChatCostByModelEntry = {
    model: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    messages: number;
};

type VoiceCostByModelEntry = {
    model: string;
    estimated_tokens: number;
    cost_usd: number;
    events: number;
};

type EvaluationCostEntry = {
    model: string;
    provider: string;
    tokens_in: number;
    tokens_out: number;
    cost_usd: number;
    runs: number;
};

type RagTopResult = {
    file_id?: string;
    filename?: string;
    score?: number;
    excerpt?: string;
};

type RagTrace = {
    timestamp?: string;
    rag_owner?: string;
    rag_mode?: string;
    purpose?: string;
    evidence_count?: number;
    query?: string;
    strategy?: string;
    top_k?: number;
    fallback_applied?: string;
    latency_ms?: number;
    top_results?: RagTopResult[];
};

type TriggerTrace = {
    timestamp?: string;
    step_id?: string;
    trigger_index?: number;
    trigger_type?: string;
    layer?: string;
    matched?: boolean;
    candidate?: string;
    score?: number;
    distance?: number;
    max_distance?: number;
    guardrails_applied?: string[];
    model_used?: boolean;
    model_confidence?: number;
    reason?: string;
};

type VoiceStats = {
    events: number;
    total_chars: number;
    total_estimated_tokens: number;
    total_cost_usd: number;
} | null;

interface ConversationAdminAuditPanelsProps {
    lang: 'es' | 'en';
    sessionId: string;
    createdAt: string | null;
    botName: string;
    userPrimary: string;
    userSecondary?: string | null;
    stats: {
        count: number;
    };
    totalCost: number;
    chatRows: ChatCostByModelEntry[];
    ttsRows: VoiceCostByModelEntry[];
    evaluationRows: EvaluationCostEntry[];
    metadata: Record<string, unknown>;
    ragTraces: RagTrace[];
    triggerTraces: TriggerTrace[];
    voiceStats: VoiceStats;
    formatDateTime: (dateStr: string | null) => string;
}

function AuditMetricRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3 text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="text-right font-semibold text-slate-900">{value}</span>
        </div>
    );
}

function CostGroup({
    title,
    rows,
    emptyLabel,
    renderMeta,
}: {
    title: string;
    rows: Array<ChatCostByModelEntry | VoiceCostByModelEntry | EvaluationCostEntry>;
    emptyLabel: string;
    renderMeta: (row: ChatCostByModelEntry | VoiceCostByModelEntry | EvaluationCostEntry) => string;
}) {
    return (
        <div className="space-y-2">
            <h4 className="workspace-eyebrow">{title}</h4>
            {rows.length === 0 ? (
                <p className="text-sm text-slate-500">{emptyLabel}</p>
            ) : (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div
                            key={`${title}-${row.model}-${'provider' in row ? row.provider : 'base'}`}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <span className="font-mono text-sm text-slate-700">{row.model}</span>
                                <span className="font-mono text-sm font-bold text-slate-950">
                                    ${row.cost_usd.toFixed(6)}
                                </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{renderMeta(row)}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export function ConversationAdminAuditPanels({
    lang,
    sessionId,
    createdAt,
    botName,
    userPrimary,
    userSecondary,
    stats,
    totalCost,
    chatRows,
    ttsRows,
    evaluationRows,
    metadata,
    ragTraces,
    triggerTraces,
    voiceStats,
    formatDateTime,
}: ConversationAdminAuditPanelsProps) {
    const hasAdvancedAudit = Object.keys(metadata).length > 0 || ragTraces.length > 0 || triggerTraces.length > 0;

    return (
        <div className="space-y-6">
            <WorkspacePanel
                variant="muted"
                title={lang === 'es' ? 'Resumen de sesion' : 'Session summary'}
                description={lang === 'es'
                    ? 'Contexto operativo de la practica.'
                    : 'Operational context for this practice.'}
            >
                <div className="space-y-4">
                    <AuditMetricRow label={lang === 'es' ? 'Sesion' : 'Session'} value={sessionId.slice(0, 8)} />
                    <AuditMetricRow label={lang === 'es' ? 'Mensajes' : 'Messages'} value={stats.count.toString()} />
                    <AuditMetricRow label={lang === 'es' ? 'Usuario' : 'User'} value={userPrimary} />
                    {userSecondary ? (
                        <AuditMetricRow
                            label={lang === 'es' ? 'Referencia' : 'Reference'}
                            value={userSecondary}
                        />
                    ) : null}
                    <AuditMetricRow label="Bot" value={botName} />
                    <AuditMetricRow
                        label={lang === 'es' ? 'Inicio' : 'Started'}
                        value={formatDateTime(createdAt)}
                    />

                    {voiceStats ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                            <div className="mb-3 flex items-center gap-2">
                                <Mic className="h-4 w-4 text-primary" />
                                <h4 className="workspace-eyebrow">{lang === 'es' ? 'Voz' : 'Voice'}</h4>
                            </div>
                            <div className="space-y-2">
                                <AuditMetricRow
                                    label={lang === 'es' ? 'Eventos' : 'Events'}
                                    value={voiceStats.events.toString()}
                                />
                                <AuditMetricRow
                                    label="Chars"
                                    value={voiceStats.total_chars.toLocaleString()}
                                />
                                <AuditMetricRow
                                    label={lang === 'es' ? 'Tokens est.' : 'Est. tokens'}
                                    value={voiceStats.total_estimated_tokens.toLocaleString()}
                                />
                                <AuditMetricRow
                                    label={lang === 'es' ? 'Costo voz' : 'Voice cost'}
                                    value={`$${voiceStats.total_cost_usd.toFixed(6)}`}
                                />
                            </div>
                        </div>
                    ) : null}
                </div>
            </WorkspacePanel>

            <WorkspacePanel
                variant="detail"
                title={lang === 'es' ? 'Costos' : 'Costs'}
                description={lang === 'es'
                    ? 'Desglose por canal y modelo.'
                    : 'Breakdown by channel and model.'}
            >
                <div className="space-y-5">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-emerald-600" />
                            <h4 className="workspace-eyebrow">{lang === 'es' ? 'Total de la interaccion' : 'Interaction total'}</h4>
                        </div>
                        <p className="mt-3 font-mono text-3xl font-black tracking-tight text-emerald-600">
                            ${totalCost.toFixed(6)}
                        </p>
                    </div>

                    <CostGroup
                        title={lang === 'es' ? 'Conversación y transcripción' : 'Conversation and transcription'}
                        rows={chatRows}
                        emptyLabel={lang === 'es' ? 'Sin uso de chat.' : 'No chat usage.'}
                        renderMeta={(row) => {
                            const chatRow = row as ChatCostByModelEntry;
                            return lang === 'es'
                                ? `in ${chatRow.tokens_in.toLocaleString()} · out ${chatRow.tokens_out.toLocaleString()} · mensajes ${chatRow.messages}`
                                : `in ${chatRow.tokens_in.toLocaleString()} · out ${chatRow.tokens_out.toLocaleString()} · messages ${chatRow.messages}`;
                        }}
                    />

                    <CostGroup
                        title="TTS"
                        rows={ttsRows}
                        emptyLabel={lang === 'es' ? 'Sin uso de TTS.' : 'No TTS usage.'}
                        renderMeta={(row) => {
                            const ttsRow = row as VoiceCostByModelEntry;
                            return lang === 'es'
                                ? `tokens est. ${ttsRow.estimated_tokens.toLocaleString()} · eventos ${ttsRow.events}`
                                : `est. tokens ${ttsRow.estimated_tokens.toLocaleString()} · events ${ttsRow.events}`;
                        }}
                    />

                    <CostGroup
                        title={lang === 'es' ? 'Evaluacion' : 'Evaluation'}
                        rows={evaluationRows}
                        emptyLabel={lang === 'es' ? 'Sin auditoria de evaluacion.' : 'No evaluation audit yet.'}
                        renderMeta={(row) => {
                            const evaluationRow = row as EvaluationCostEntry;
                            return lang === 'es'
                                ? `in ${evaluationRow.tokens_in.toLocaleString()} · out ${evaluationRow.tokens_out.toLocaleString()} · corridas ${evaluationRow.runs}`
                                : `in ${evaluationRow.tokens_in.toLocaleString()} · out ${evaluationRow.tokens_out.toLocaleString()} · runs ${evaluationRow.runs}`;
                        }}
                    />
                </div>
            </WorkspacePanel>

            <WorkspacePanel
                variant="muted"
                title={lang === 'es' ? 'Auditoria avanzada' : 'Advanced audit'}
                description={lang === 'es'
                    ? 'Metadata y trazas tecnicas cerradas por defecto.'
                    : 'Metadata and technical traces collapsed by default.'}
            >
                {hasAdvancedAudit ? (
                    <div className="space-y-3">
                        {Object.keys(metadata).length > 0 ? (
                            <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <summary className="cursor-pointer list-none">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Database className="h-4 w-4 text-primary" />
                                            <span className="font-semibold text-slate-900">{lang === 'es' ? 'Metadata raw' : 'Raw metadata'}</span>
                                        </div>
                                        <span className="workspace-chip workspace-chip-muted">{Object.keys(metadata).length}</span>
                                    </div>
                                </summary>
                                <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                                    {JSON.stringify(metadata, null, 2)}
                                </pre>
                            </details>
                        ) : null}

                        {ragTraces.length > 0 ? (
                            <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <summary className="cursor-pointer list-none">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-primary" />
                                            <span className="font-semibold text-slate-900">{lang === 'es' ? 'Trazas RAG' : 'RAG traces'}</span>
                                        </div>
                                        <span className="workspace-chip workspace-chip-muted">{ragTraces.length}</span>
                                    </div>
                                </summary>
                                <div className="mt-3 space-y-2">
                                    {ragTraces.slice().reverse().map((trace, index) => (
                                        <div key={`${trace.timestamp || 'ts'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-xs font-semibold text-slate-900">
                                                    {(trace.rag_owner || 'wrapper')} · {trace.rag_mode || 'default'} · {trace.purpose || 'general'}
                                                </p>
                                                <span className="text-xs font-mono text-slate-500">
                                                    {trace.evidence_count || 0} ev
                                                </span>
                                            </div>
                                            {trace.query ? (
                                                <p className="mt-1 truncate font-mono text-xs text-slate-600" title={trace.query}>
                                                    {trace.query}
                                                </p>
                                            ) : null}
                                            <p className="mt-1 text-xs text-slate-500">
                                                strategy={trace.strategy || 'n/a'} · top_k={trace.top_k ?? 0} · fallback={trace.fallback_applied || 'none'} · latency={trace.latency_ms || 0}ms
                                            </p>
                                            {Array.isArray(trace.top_results) && trace.top_results.length > 0 ? (
                                                <div className="mt-2 space-y-1">
                                                    {trace.top_results.slice(0, 2).map((result, resultIndex) => (
                                                        <div key={`${result.file_id || result.filename || 'result'}-${resultIndex}`} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                            <p className="truncate font-mono text-xs text-slate-700">
                                                                {result.filename || result.file_id || 'file'} · {typeof result.score === 'number' ? result.score.toFixed(3) : '0.000'}
                                                            </p>
                                                            {result.excerpt ? (
                                                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{result.excerpt}</p>
                                                            ) : null}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        ) : null}

                        {triggerTraces.length > 0 ? (
                            <details className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <summary className="cursor-pointer list-none">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-primary" />
                                            <span className="font-semibold text-slate-900">{lang === 'es' ? 'Trazas de triggers' : 'Trigger traces'}</span>
                                        </div>
                                        <span className="workspace-chip workspace-chip-muted">{triggerTraces.length}</span>
                                    </div>
                                </summary>
                                <div className="mt-3 space-y-2">
                                    {triggerTraces.slice().reverse().map((trace, index) => (
                                        <div key={`${trace.timestamp || 'ts'}-${trace.step_id || 'step'}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-xs font-semibold text-slate-900">
                                                    {trace.step_id || 'step'} · {trace.trigger_type || 'trigger'} · {trace.layer || 'none'}
                                                </p>
                                                <span className={`text-xs font-mono ${trace.matched ? 'text-emerald-600' : 'text-slate-500'}`}>
                                                    {trace.matched ? 'match' : 'no-match'}
                                                </span>
                                            </div>
                                            <p className="mt-1 text-xs text-slate-500">{trace.reason || 'ok'}</p>
                                            {(typeof trace.score === 'number' || typeof trace.distance === 'number') ? (
                                                <p className="mt-1 text-xs text-slate-500">
                                                    score={typeof trace.score === 'number' ? trace.score.toFixed(3) : '-'} · dist={typeof trace.distance === 'number' ? trace.distance : '-'} / {typeof trace.max_distance === 'number' ? trace.max_distance : '-'}
                                                </p>
                                            ) : null}
                                            {Array.isArray(trace.guardrails_applied) && trace.guardrails_applied.length > 0 ? (
                                                <p className="mt-1 text-xs text-amber-700">
                                                    guardrails: {trace.guardrails_applied.join(', ')}
                                                </p>
                                            ) : null}
                                            {trace.model_used ? (
                                                <p className="mt-1 text-xs text-primary">
                                                    model_fallback: confidence={typeof trace.model_confidence === 'number' ? trace.model_confidence.toFixed(2) : '0.00'}
                                                </p>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            </details>
                        ) : null}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">
                        {lang === 'es' ? 'No hay metadata ni trazas adicionales para esta sesion.' : 'No additional metadata or traces for this session.'}
                    </p>
                )}
            </WorkspacePanel>
        </div>
    );
}
