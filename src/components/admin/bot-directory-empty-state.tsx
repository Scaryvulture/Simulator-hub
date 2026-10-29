'use client';

import { FolderOpenDot } from 'lucide-react';

interface BotDirectoryEmptyStateProps {
    lang: 'es' | 'en';
}

export function BotDirectoryEmptyState({ lang }: BotDirectoryEmptyStateProps) {
    return (
        <div className="admin-directory-empty-state">
            <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <FolderOpenDot className="h-9 w-9 text-slate-400" />
            </div>
            <h3 className="text-xl font-black tracking-tight text-slate-900">
                {lang === 'es' ? 'No se encontraron bots' : 'No bots found'}
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-600">
                {lang === 'es'
                    ? 'Ajustá la búsqueda o creá un nuevo bot para continuar.'
                    : 'Adjust the search or create a new bot to continue.'}
            </p>
        </div>
    );
}
