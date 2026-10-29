'use client';

import Link from 'next/link';
import { ArrowLeft, Code, Layout, Save, Workflow } from 'lucide-react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { Button } from '@/components/ui/button';

interface BotEditorHeaderProps {
    botId: string;
    botType: string;
    name: string;
    lang: 'es' | 'en';
    viewMode: 'STANDARD' | 'PROFESSIONAL';
    hasUnsavedChanges: boolean;
    isSaving: boolean;
    saveLabel: string;
    syncingLabel: string;
    onToggleViewMode: () => void;
    onSave: () => void;
}

export function BotEditorHeader({
    botId,
    botType,
    name,
    lang,
    viewMode,
    hasUnsavedChanges,
    isSaving,
    saveLabel,
    syncingLabel,
    onToggleViewMode,
    onSave,
}: BotEditorHeaderProps) {
    return (
        <AdminPageHeader
            variant="editor"
            eyebrow={lang === 'es' ? 'Editor de bot' : 'Bot editor'}
            description={lang === 'es'
                ? 'Mismo nivel de control, con una lectura más clara de identidad, estrategia y publicación.'
                : 'Same level of control, with a clearer reading of identity, strategy, and publication.'}
            title={(
                <div className="flex flex-wrap items-center gap-3">
                    <span>{name || 'Director #1'}</span>
                    <span className="admin-editor-chip">
                        {botType}
                    </span>
                    {hasUnsavedChanges ? (
                        <span className="admin-editor-chip border-primary/15 bg-primary/10 text-primary">
                            {lang === 'es' ? 'Cambios pendientes' : 'Pending changes'}
                        </span>
                    ) : null}
                </div>
            )}
            actions={(
                <>
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 font-bold">
                        <Link href="/admin" prefetch={false}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            {lang === 'es' ? 'Volver' : 'Back'}
                        </Link>
                    </Button>
                    <Button
                        variant="outline"
                        onClick={onToggleViewMode}
                        className="h-11 rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        {viewMode === 'STANDARD' ? (
                            <>
                                <Code className="mr-2 h-4 w-4 text-primary" />
                                {lang === 'es' ? 'Modo Pro' : 'Pro mode'}
                            </>
                        ) : (
                            <>
                                <Layout className="mr-2 h-4 w-4 text-primary" />
                                {lang === 'es' ? 'Vista estándar' : 'Standard view'}
                            </>
                        )}
                    </Button>
                    <Button asChild variant="outline" className="h-11 rounded-2xl border-slate-200 font-bold">
                        <Link href={`/admin/qa-lab?botId=${botId}`} prefetch={false}>
                            <Workflow className="mr-2 h-4 w-4 text-primary" />
                            QA Lab
                        </Link>
                    </Button>
                    <Button
                        onClick={onSave}
                        disabled={isSaving}
                        className="h-11 rounded-2xl px-5 text-sm font-bold shadow-sm"
                    >
                        <Save className="mr-2 h-4 w-4" />
                        {isSaving ? syncingLabel : saveLabel}
                    </Button>
                </>
            )}
        />
    );
}
