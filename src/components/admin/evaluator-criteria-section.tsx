import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AdminPanel } from '@/components/admin/admin-panel';
import { Plus, Trash } from 'lucide-react';

type Criterion = {
    id: string;
    title: string;
    instruction: string;
};

interface EvaluatorCriteriaSectionProps {
    lang: 'es' | 'en';
    type: 'boolean' | 'qualitative';
    title: string;
    description: string;
    emptyLabel: string;
    addLabel: string;
    icon: ReactNode;
    criteria: Criterion[];
    titlePlaceholder: string;
    instructionPlaceholder: string;
    onAdd: () => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, field: 'title' | 'instruction', value: string) => void;
}

export function EvaluatorCriteriaSection({
    lang,
    type,
    title,
    description,
    emptyLabel,
    addLabel,
    icon,
    criteria,
    titlePlaceholder,
    instructionPlaceholder,
    onAdd,
    onRemove,
    onUpdate,
}: EvaluatorCriteriaSectionProps) {
    return (
        <AdminPanel
            variant="section"
            title={(
                <div className="flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-2">
                        {icon}
                        {title}
                    </span>
                    <span className="admin-editor-chip">{criteria.length}</span>
                </div>
            )}
            description={description}
            actions={(
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onAdd}
                    className="h-10 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    {addLabel}
                </Button>
            )}
            contentClassName="space-y-4"
        >
            {criteria.length === 0 ? (
                <div className="admin-editor-subpanel flex items-center justify-center border-dashed py-10 text-center">
                    <p className="text-sm font-medium text-slate-500">{emptyLabel}</p>
                </div>
            ) : null}

            {criteria.map((criterion, index) => (
                <article
                    key={criterion.id}
                    data-evaluator-criterion-type={type}
                    data-evaluator-criterion-id={criterion.id}
                    className="admin-editor-subpanel scroll-mt-24 space-y-4"
                >
                    <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-black text-slate-500">
                            {index + 1}
                        </div>

                        <div className="min-w-0 flex-1 space-y-4">
                            <div className="space-y-2">
                                <Label className="admin-editor-label">
                                    {lang === 'es' ? 'Titulo' : 'Title'}
                                </Label>
                                <Input
                                    value={criterion.title}
                                    onChange={(event) => onUpdate(criterion.id, 'title', event.target.value)}
                                    placeholder={titlePlaceholder}
                                    className="h-10 rounded-xl border-slate-200 bg-white text-sm font-semibold text-slate-900"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label className="admin-editor-label">
                                    {lang === 'es' ? 'Instruccion para el modelo' : 'Model instruction'}
                                </Label>
                                <textarea
                                    value={criterion.instruction}
                                    onChange={(event) => onUpdate(criterion.id, 'instruction', event.target.value)}
                                    placeholder={instructionPlaceholder}
                                    className="min-h-[88px] w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-primary/15 resize-y"
                                />
                            </div>
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onRemove(criterion.id)}
                            className="h-9 w-9 rounded-full p-0 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                            <Trash className="h-4 w-4" />
                        </Button>
                    </div>
                </article>
            ))}
        </AdminPanel>
    );
}
