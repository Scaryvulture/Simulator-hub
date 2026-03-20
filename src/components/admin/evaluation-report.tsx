'use client';

import { useMemo, useTransition } from 'react';
import { CheckCircle2, XCircle, FileSignature, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/i18n-context";
import { recordEvaluationRawLogAccess } from '@/app/actions/evaluation-log-audit';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface EvaluationResult {
    score: number;
    max_score: number;
    percentage: number;
    results: {
        boolean: Array<{ id: string; title: string; passed: boolean; reason: string }>;
        qualitative: Array<{ id: string; title: string; feedback: string }>;
    };
    raw_log?: string;
    raw_log_expired?: boolean;
    timestamp: string;
}

interface Props {
    result: EvaluationResult;
    showDebugLog?: boolean;
    sessionId?: string;
}

export function EvaluationReport({ result, showDebugLog = true, sessionId }: Props) {
    const { lang } = useLanguage();
    const [, startAuditTransition] = useTransition();
    const isPass = result.percentage >= 70;
    const rawLogContent = useMemo(() => {
        if (!result.raw_log) return '';
        try {
            return JSON.stringify(JSON.parse(result.raw_log), null, 2);
        } catch {
            return result.raw_log;
        }
    }, [result.raw_log]);

    const handleDebugDialogOpenChange = (open: boolean) => {
        if (!open || !sessionId || !showDebugLog || !result.raw_log) return;
        startAuditTransition(() => {
            void recordEvaluationRawLogAccess(sessionId).catch((error: unknown) => {
                console.warn('Failed to audit evaluation raw-log access:', error);
            });
        });
    };

    return (
        <Card className="bg-white shadow-sm border-slate-200 rounded-2xl overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-100 py-4">
                <CardTitle className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <FileSignature className="h-4 w-4 text-primary" /> {lang === 'es' ? 'Reporte de evaluación' : 'Evaluation report'}
                </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-8" id="evaluation-report-content">
                {/* Score Summary */}
                <div className="flex flex-col md:flex-row items-center gap-8">
                    <div className="relative flex items-center justify-center w-32 h-32 shrink-0">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                className="text-slate-100"
                                strokeWidth="8"
                                stroke="currentColor"
                                fill="transparent"
                                r="58"
                                cx="64"
                                cy="64"
                            />
                            <circle
                                className={cn(isPass ? "text-green-500" : "text-amber-500")}
                                strokeWidth="8"
                                strokeDasharray={365}
                                strokeDashoffset={365 - (365 * result.percentage) / 100}
                                strokeLinecap="round"
                                stroke="currentColor"
                                fill="transparent"
                                r="58"
                                cx="64"
                                cy="64"
                            />
                        </svg>
                        <span className="absolute text-3xl font-black text-slate-900">
                            {result.percentage}%
                        </span>
                    </div>
                    <div className="flex-1 space-y-2 text-center md:text-left">
                        <div className="flex items-center justify-center md:justify-start gap-2">
                            {isPass ? (
                                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold uppercase tracking-widest">
                                    {lang === 'es' ? 'Aprobado' : 'Passed'}
                                </span>
                            ) : (
                                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold uppercase tracking-widest">
                                    {lang === 'es' ? 'Necesita mejora' : 'Needs Improvement'}
                                </span>
                            )}
                            <span className="text-xs text-slate-400 font-mono">
                                {new Date(result.timestamp).toLocaleString()}
                            </span>
                        </div>
                        <p className="text-slate-600 font-medium">
                            {lang === 'es'
                                ? <>El usuario logró <strong>{result.score}</strong> de <strong>{result.max_score}</strong> objetivos clave.</>
                                : <>Student achieved <strong>{result.score}</strong> out of <strong>{result.max_score}</strong> key objectives.</>}
                        </p>
                    </div>
                </div>

                {/* Boolean Criteria */}
                <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        {lang === 'es' ? 'Objetivos clave' : 'Key Objectives'}
                    </h3>
                    <div className="grid grid-cols-1 gap-3">
                        {result.results.boolean.map((item) => (
                            <div
                                key={item.id}
                                className={cn(
                                    "p-4 rounded-xl border flex items-start gap-4",
                                    item.passed
                                        ? "bg-green-100/70 border-green-300"
                                        : "bg-red-100/70 border-red-300"
                                )}
                            >
                                <div className={cn(
                                    "w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                    item.passed ? "bg-green-200 text-green-700" : "bg-red-200 text-red-700"
                                )}>
                                    {item.passed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <h4 className="font-bold text-sm text-slate-900">
                                            {item.title}
                                        </h4>
                                        <span
                                            className={cn(
                                                "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                                item.passed ? "bg-green-200 text-slate-900" : "bg-red-200 text-slate-900"
                                            )}
                                        >
                                            {item.passed
                                                ? (lang === 'es' ? 'Sí' : 'Yes')
                                                : (lang === 'es' ? 'No' : 'No')}
                                        </span>
                                    </div>
                                    <p className="text-xs mt-1 leading-relaxed text-slate-900">
                                        {item.reason}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Qualitative Feedback */}
                {result.results.qualitative.length > 0 && (
                    <div className="space-y-4">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            {lang === 'es' ? 'Feedback cualitativo' : 'Qualitative Feedback'}
                        </h3>
                        <div className="space-y-3">
                            {result.results.qualitative.map((item) => (
                                <div key={item.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                    <h4 className="font-bold text-sm text-slate-800 mb-2">{item.title}</h4>
                                    <p className="text-sm text-slate-600 leading-relaxed">
                                        {item.feedback}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Debug Log */}
                {showDebugLog && result.raw_log && (
                    <div className="pt-6 border-t border-slate-100">
                        <Dialog onOpenChange={handleDebugDialogOpenChange}>
                            <DialogTrigger asChild>
                                <Button variant="outline" size="sm" className="w-full text-xs text-slate-500 font-mono">
                                    <Terminal className="w-3 h-3 mr-2" />
                                    {lang === 'es' ? 'Ver log bruto de evaluación' : 'View Raw Evaluation Log'}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>{lang === 'es' ? 'Log bruto de evaluación' : 'Raw Evaluation Log'}</DialogTitle>
                                    <DialogDescription>
                                        {lang === 'es'
                                            ? 'Detalles de interacción entre el sistema y el bot evaluador.'
                                            : 'Interaction details between the system and the Evaluator Bot.'}
                                    </DialogDescription>
                                </DialogHeader>
                                <pre className="p-4 bg-slate-950 text-slate-50 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                    {rawLogContent}
                                </pre>
                            </DialogContent>
                        </Dialog>
                    </div>
                )}

                {showDebugLog && !result.raw_log && result.raw_log_expired && (
                    <div className="pt-6 border-t border-slate-100">
                        <p className="text-[11px] text-slate-500 font-mono">
                            {lang === 'es'
                                ? 'El log bruto expiró por política de retención.'
                                : 'Raw debug log expired due to retention policy.'}
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
