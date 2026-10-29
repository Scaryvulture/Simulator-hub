import Link from 'next/link';
import { FileSignature, Settings2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EvaluatorDirectoryCardProps {
    id: string;
    name: string;
    booleanCount: number;
    qualitativeCount: number;
    lang: 'es' | 'en';
    onDelete: (id: string) => Promise<void>;
}

export function EvaluatorDirectoryCard({
    id,
    name,
    booleanCount,
    qualitativeCount,
    lang,
    onDelete,
}: EvaluatorDirectoryCardProps) {
    return (
        <article className="admin-directory-card">
            <div className="admin-directory-card-line bg-gradient-to-r from-primary via-primary/60 to-primary/0" />

            <div className="admin-directory-card-header">
                <div className="flex min-w-0 items-start gap-4">
                    <div className="admin-directory-logo">
                        <FileSignature className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 space-y-2">
                        <span className="admin-directory-card-chip border-primary/15 bg-primary/10 text-primary">
                            EVALUATOR
                        </span>
                        <div className="space-y-1">
                            <h3 className="admin-directory-card-title">{name}</h3>
                            <p className="admin-directory-card-meta">
                                {booleanCount} {lang === 'es' ? 'booleanos' : 'boolean'} · {qualitativeCount} {lang === 'es' ? 'cualitativos' : 'qualitative'}
                            </p>
                        </div>
                    </div>
                </div>

                <form action={onDelete.bind(null, id)}>
                    <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={lang === 'es' ? 'Eliminar evaluador' : 'Delete evaluator'}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </form>
            </div>

            <div className="admin-directory-card-body">
                <div className="admin-directory-card-actions sm:grid-cols-1">
                    <Button asChild className="h-11 rounded-2xl font-bold shadow-sm">
                        <Link href={`/admin/evaluators/${id}`} prefetch={false}>
                            <Settings2 className="mr-2 h-4 w-4" />
                            {lang === 'es' ? 'Configurar' : 'Configure'}
                        </Link>
                    </Button>
                </div>
            </div>
        </article>
    );
}
