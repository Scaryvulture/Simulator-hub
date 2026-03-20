'use client';

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle2, XCircle, AlertCircle, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/providers/i18n-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface EvaluationResult {
    score: number;
    max_score: number;
    percentage: number;
    timestamp: string;
    results: {
        boolean: Array<{ id: string; title: string; passed: boolean; reason: string }>;
        qualitative: Array<{ id: string; title: string; feedback: string }>;
    };
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    result: EvaluationResult | null;
    sessionId?: string | null;
    userId?: string;
}

export function EvaluationResultModal({ open, onOpenChange, result, sessionId, userId }: Props) {
    const { lang } = useLanguage();
    if (!result) return null;

    const isPass = result.percentage >= 70; // Hardcoded pass threshold for visual indication
    const handleDownloadPdf = async () => {
        if (!sessionId) return;
        try {
            const resp = await fetch(`/api/sessions/${sessionId}/evaluation-pdf?lang=${encodeURIComponent(lang)}`);
            if (!resp.ok) {
                const payload = await resp.json().catch(() => ({}));
                throw new Error(payload?.error || 'Failed to generate PDF');
            }
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `evaluation-${sessionId.slice(0, 8)}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
        } catch (error: unknown) {
            toast.error(error instanceof Error ? error.message : (lang === 'es' ? 'No se pudo descargar el PDF.' : 'Failed to download PDF.'));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-white rounded-3xl border-slate-200 shadow-2xl">
                <DialogHeader className="pb-6 border-b border-slate-100">
                    <DialogTitle className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        {isPass ? (
                            <CheckCircle2 className="h-8 w-8 text-green-500" />
                        ) : (
                            <AlertCircle className="h-8 w-8 text-amber-500" />
                        )}
                        {lang === 'es' ? 'Resultados de evaluación' : 'Evaluation Results'}
                    </DialogTitle>
                    <DialogDescription className="text-slate-500 font-medium">
                        {lang === 'es'
                            ? 'Desglose detallado de tu desempeño en la sesión.'
                            : 'Detailed breakdown of your session performance.'}
                    </DialogDescription>
                    <div className="mt-3 text-xs text-slate-500 font-mono space-y-1">
                        {userId && <p>{lang === 'es' ? 'Usuario:' : 'User:'} {userId}</p>}
                        <p>{lang === 'es' ? 'Fecha:' : 'Date:'} {new Date(result.timestamp).toLocaleString()}</p>
                    </div>
                </DialogHeader>

                <div className="space-y-8 py-6">
                    {/* Score Card */}
                    <div className="flex flex-col items-center justify-center p-8 bg-slate-50 rounded-3xl border border-slate-100">
                        <div className="relative flex items-center justify-center w-32 h-32">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle
                                    className="text-slate-200"
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
                        <p className="mt-4 text-sm font-bold text-slate-500 uppercase tracking-widest">
                            {result.score} / {result.max_score} {lang === 'es' ? 'criterios cumplidos' : 'Criteria Met'}
                        </p>
                    </div>

                    {/* Boolean Criteria */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" /> {lang === 'es' ? 'Objetivos clave' : 'Key Objectives'}
                        </h3>
                        <div className="space-y-3">
                            {result.results.boolean.map((item) => (
                                <div
                                    key={item.id}
                                    className={cn(
                                        "p-4 rounded-xl border flex items-start gap-4 transition-all hover:bg-opacity-50",
                                        item.passed
                                            ? "bg-green-100/70 border-green-300"
                                            : "bg-red-100/70 border-red-300"
                                    )}
                                >
                                    <div className={cn(
                                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                                        item.passed ? "bg-green-200 text-green-700" : "bg-red-200 text-red-700"
                                    )}>
                                        {item.passed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
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

                    {/* Qualitative and Feedback */}
                    {result.results.qualitative.length > 0 && (
                        <div className="space-y-4">
                        <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                <AlertCircle className="h-4 w-4 text-primary" /> {lang === 'es' ? 'Feedback' : 'Feedback'}
                            </h3>
                            <div className="space-y-3">
                                {result.results.qualitative.map((item) => (
                                    <div key={item.id} className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm">
                                        <h4 className="font-bold text-sm text-slate-800 mb-2">{item.title}</h4>
                                        <p className="text-sm text-slate-600 leading-relaxed font-medium">
                                            {item.feedback}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="pt-4 border-t border-slate-100">
                        <Button
                            onClick={handleDownloadPdf}
                            disabled={!sessionId}
                            className="w-full rounded-xl font-bold"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            {lang === 'es' ? 'Descargar PDF de evaluación' : 'Download Evaluation PDF'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
